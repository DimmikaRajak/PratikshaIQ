import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CalendarClock,
  ExternalLink,
  Flag,
  Globe,
  Loader2,
  Navigation,
  Phone,
  PlusCircle,
  Sparkles,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Office } from '../types/domain';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import {
  fetchOfficeByIdOrSlug,
  fetchOfficeReports,
  flagQueueReport,
  requestAiVisitBrief,
} from '../lib/api';
import { readCachedOfficeByIdOrSlug } from '../lib/offlineCache';
import { calculateQueueAggregate, formatMinutesReadable, formatRangeLabel, formatWaitingTimeSummary } from '../lib/queueEngine';
import { calculateHistoricalAnalytics } from '../lib/historicalAnalytics';
import { supabase } from '../lib/supabase';
import {
  buildDirectionsUrl,
  buildGoogleMapsDirectionsUrl,
  formatRelativeTime,
  getCategoryLabel,
  getConfidenceLabel,
  getCrowdMeta,
  sanitizeExternalUrl,
} from '../lib/utils';
import { Button, Card, CardContent, CardHeader, Skeleton, Textarea } from '../components/ui/primitives';

const LazyOfficeMap = lazy(() => import('../components/map/InteractiveOfficeMap'));

export function OfficeDetailsPage() {
  const { slug = '' } = useParams();
  const location = useLocation();
  const routeStateOffice = (location.state as { office?: Office } | null)?.office ?? null;
  const queryClient = useQueryClient();
  const { user, isConfigured } = useAuth();
  const { language, t } = useI18n();

  const [flaggingReportId, setFlaggingReportId] = useState<string | null>(null);
  const [flagReason, setFlagReason] = useState('');
  const [flagStatusMsg, setFlagStatusMsg] = useState<string | null>(null);
  const [flagSubmitting, setFlagSubmitting] = useState(false);

  const [aiBrief, setAiBrief] = useState<{ brief: string; disclaimer: string } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const officeQuery = useQuery({
    queryKey: ['office-detail', slug],
    queryFn: async () => {
      const dbOffice = await fetchOfficeByIdOrSlug(slug);
      if (dbOffice) return dbOffice;
      if (routeStateOffice) return routeStateOffice;
      return readCachedOfficeByIdOrSlug(slug);
    },
    initialData: routeStateOffice || readCachedOfficeByIdOrSlug(slug) || undefined,
    staleTime: 30_000,
  });

  const office = officeQuery.data ?? null;

  const reportsQuery = useQuery({
    queryKey: ['office-reports', office?.id],
    queryFn: () => fetchOfficeReports(office!.id, 150),
    enabled: Boolean(office?.id && isConfigured),
    staleTime: 20_000,
  });

  // Subscribe to Supabase Realtime for live updates on this office's reports & aggregates
  useEffect(() => {
    const client = supabase;
    if (!client || !office?.id || office.id.startsWith('osm-')) return;

    const channel = client
      .channel(`office-live-${office.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'queue_reports',
          filter: `office_id=eq.${office.id}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['office-reports', office.id] });
          void queryClient.invalidateQueries({ queryKey: ['office-detail', slug] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'office_aggregates',
          filter: `office_id=eq.${office.id}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['office-detail', slug] });
        }
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [office?.id, slug, queryClient]);

  const reports = reportsQuery.data || [];

  const liveCalc = useMemo(() => calculateQueueAggregate(reports), [reports]);
  const waitSummary = useMemo(
    () => formatWaitingTimeSummary(liveCalc, language),
    [liveCalc, language]
  );
  const historical = useMemo(() => calculateHistoricalAnalytics(reports), [reports]);

  const crowdMeta = getCrowdMeta(liveCalc.current_crowd_level, language);
  const confidenceText = getConfidenceLabel(liveCalc.confidence_level, language);
  const safeWebsite = sanitizeExternalUrl(office?.official_website);

  const handleFlagSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!flaggingReportId || flagReason.trim().length < 5) return;
    setFlagSubmitting(true);
    setFlagStatusMsg(null);
    try {
      await flagQueueReport(flaggingReportId, flagReason);
      setFlagStatusMsg('Report has been flagged for administrator review.');
      setFlaggingReportId(null);
      setFlagReason('');
    } catch (err) {
      setFlagStatusMsg(err instanceof Error ? err.message : 'Unable to flag report.');
    } finally {
      setFlagSubmitting(false);
    }
  };

  const handleGenerateAiBrief = async () => {
    if (!office) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const result = await requestAiVisitBrief({
        officeName: office.name,
        category: getCategoryLabel(office.category, 'en'),
        city: office.city,
        state: office.state,
        language,
        recentReportCount: liveCalc.recent_report_count,
        estimatedWaitingMinutes: liveCalc.estimated_waiting_minutes,
        currentCrowdLevel: liveCalc.current_crowd_level,
        hasHistoricalData: historical.hasSufficientData,
      });
      setAiBrief(result);
    } catch (err) {
      setAiError(
        err instanceof Error ? err.message : 'Optional AI visit brief is unavailable right now.'
      );
    } finally {
      setAiLoading(false);
    }
  };

  if (officeQuery.isLoading && !office) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!office) {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-4">
          <h1 className="text-xl font-bold text-[#0F2744]">Public office not found</h1>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            This office record could not be loaded from the database or local cache. Try searching for it in Explore Offices.
          </p>
          <Link to="/explore">
            <Button variant="primary">{t.nav.explore}</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  const sourceLabel =
    office.source === 'osm'
      ? t.common.osmSource
      : office.source === 'citizen_suggestion'
        ? t.common.citizenSource
        : t.common.officialSource;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <div>
        <Link
          to="/explore"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-[#0F2744]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>{t.nav.explore}</span>
        </Link>
      </div>

      {/* Office Title & Primary Actions */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-bold text-[#0F2744]">{office.name}</h1>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
            <span className="font-medium text-[#0D7377]">
              {getCategoryLabel(office.category, language)}
            </span>
            <span aria-hidden="true">·</span>
            <span>{sourceLabel}</span>
            {office.osm_id && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-xs text-slate-500">
                  OSM {office.osm_type}/{office.osm_id}
                </span>
              </>
            )}
          </div>
          <p className="text-sm text-slate-600">
            {office.address ||
              [office.city, office.district, office.state, office.postal_code]
                .filter(Boolean)
                .join(', ')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <Link to="/report" state={{ office }}>
            <Button variant="accent">
              <PlusCircle className="h-4 w-4" aria-hidden="true" />
              <span>{t.office.reportQueueBtn}</span>
            </Button>
          </Link>
          <Link to="/planner" state={{ office }}>
            <Button variant="secondary">
              <CalendarClock className="h-4 w-4" aria-hidden="true" />
              <span>{t.nav.planner}</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Live Queue Status Summary */}
      <Card>
        <CardContent className="pt-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 divide-y md:divide-y-0 md:divide-x divide-slate-100">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-slate-500">{t.office.currentCrowdStatus}</p>
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className={`h-3 w-3 rounded-full ${crowdMeta.dotColor}`}
                />
                <span className={`text-2xl font-bold ${crowdMeta.textColor}`}>
                  {crowdMeta.label}
                </span>
              </div>
              <p className="text-xs text-slate-500">{confidenceText}</p>
            </div>

            <div className="pt-4 md:pt-0 md:pl-6 space-y-1.5">
              <p className="text-xs font-medium text-slate-500">{t.office.estimatedWait}</p>
              <p className="text-lg font-semibold text-[#0F2744] tabular-nums">
                {waitSummary.headline}
              </p>
              <p className="text-xs text-slate-500">{waitSummary.subtext}</p>
            </div>

            <div className="pt-4 md:pt-0 md:pl-6 space-y-1.5">
              <p className="text-xs font-medium text-slate-500">{t.office.lastUpdated}</p>
              <p className="text-base font-medium font-mono tabular-nums text-[#0F2744]">
                {formatRelativeTime(liveCalc.last_report_at, language)}
              </p>
              <p className="text-xs text-slate-500">
                {liveCalc.average_queue_size !== null
                  ? `Avg queue size: ~${Math.round(liveCalc.average_queue_size)} people`
                  : t.common.disclaimerEstimate}
              </p>
            </div>
          </div>

          <p className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
            {t.common.disclaimerEstimate}
          </p>
        </CardContent>
      </Card>

      {/* Main 2-Column Content: Reports & Analytics (Left) + Map & Contact (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 space-y-6">
          {/* Recent Reports */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100">
              <h2 className="text-base font-semibold text-[#0F2744]">
                {t.office.recentReports}
              </h2>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                {reports.length} total
              </span>
            </CardHeader>
            <CardContent className="pt-4">
              {flagStatusMsg && (
                <p className="mb-3 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-700">
                  {flagStatusMsg}
                </p>
              )}

              {reportsQuery.isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : reports.length === 0 ? (
                <div className="py-6 text-center space-y-3">
                  <p className="text-sm text-slate-600">{t.office.noRecentReports}</p>
                  <Link to="/report" state={{ office }}>
                    <Button variant="outlineTeal" size="sm">
                      {t.office.reportQueueBtn}
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {reports.slice(0, 10).map((rep) => {
                    const repCrowd = getCrowdMeta(rep.crowd_level, language);
                    return (
                      <div key={rep.id} className="py-3.5 first:pt-0 last:pb-0 space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className={`font-semibold ${repCrowd.textColor}`}>
                              {repCrowd.label}
                            </span>
                            <span aria-hidden="true" className="text-slate-300">
                              ·
                            </span>
                            <span className="font-mono tabular-nums text-[#0F2744]">
                              {formatRangeLabel(rep.waiting_time_min, rep.waiting_time_max, language)}
                            </span>
                            <span aria-hidden="true" className="text-slate-300">
                              ·
                            </span>
                            <span className="text-xs text-slate-600 tabular-nums">
                              {rep.queue_size_min}–{rep.queue_size_max} people
                            </span>
                          </div>
                          <span className="text-xs font-mono tabular-nums text-slate-500">
                            {formatRelativeTime(rep.submitted_at, language)}
                          </span>
                        </div>

                        {rep.note && (
                          <p className="text-sm text-slate-700 leading-relaxed">{rep.note}</p>
                        )}

                        {user && (
                          <div className="pt-1">
                            {flaggingReportId === rep.id ? (
                              <form onSubmit={handleFlagSubmit} className="mt-2 space-y-2">
                                <Textarea
                                  value={flagReason}
                                  onChange={(e) => setFlagReason(e.target.value)}
                                  placeholder={t.office.flagReasonPlaceholder}
                                  rows={2}
                                  required
                                  minLength={5}
                                />
                                <div className="flex items-center gap-2">
                                  <Button type="submit" size="sm" disabled={flagSubmitting}>
                                    {t.common.submit}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setFlaggingReportId(null);
                                      setFlagReason('');
                                    }}
                                  >
                                    {t.common.cancel}
                                  </Button>
                                </div>
                              </form>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setFlaggingReportId(rep.id)}
                                className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-red-700 transition-colors cursor-pointer"
                              >
                                <Flag className="h-3 w-3" aria-hidden="true" />
                                <span>{t.office.flagReport}</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Historical Crowd Patterns & Peak Hours */}
          <Card>
            <CardHeader className="border-b border-slate-100">
              <h2 className="text-base font-semibold text-[#0F2744]">
                {t.office.historicalTrends}
              </h2>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              {!historical.hasSufficientData ? (
                <div className="py-4 space-y-2">
                  <p className="text-sm font-medium text-[#0F2744]">
                    {t.office.insufficientHistory}
                  </p>
                  <p className="text-xs text-slate-500">
                    Recorded observations: <span className="font-mono tabular-nums">{historical.totalObservations}</span> /{' '}
                    <span className="font-mono tabular-nums">{historical.minimumRequiredObservations}</span> minimum required before calculating peak-hour patterns.
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-slate-500">{t.office.historicalAvgWait}</p>
                      <p className="mt-0.5 text-lg font-bold font-mono tabular-nums text-[#0F2744]">
                        {historical.historicalAverageWaitingMinutes !== null
                          ? formatMinutesReadable(
                              Math.round(historical.historicalAverageWaitingMinutes),
                              language
                            )
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">{t.office.observationsLabel}</p>
                      <p className="mt-0.5 text-lg font-bold font-mono tabular-nums text-[#0F2744]">
                        {historical.totalObservations}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Date range</p>
                      <p className="mt-0.5 text-xs font-mono tabular-nums text-slate-700">
                        {historical.dateRangeStart
                          ? `${new Date(historical.dateRangeStart).toLocaleDateString()} – ${new Date(historical.dateRangeEnd || historical.dateRangeStart).toLocaleDateString()}`
                          : '—'}
                      </p>
                    </div>
                  </div>

                  {historical.timeBucketStats.length > 0 && (
                    <div className="h-56 w-full pt-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={historical.timeBucketStats}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#475569' }} />
                          <YAxis
                            unit="m"
                            tick={{ fontSize: 11, fill: '#475569' }}
                            width={42}
                          />
                          <Tooltip
                            formatter={(val: unknown) => [`${val} min`, 'Historical Avg Wait']}
                          />
                          <Bar
                            dataKey="avgWaitingMinutes"
                            fill="#0D7377"
                            radius={[6, 6, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-slate-100 text-xs">
                    <div>
                      <p className="font-semibold text-[#0F2744] mb-1">
                        {t.office.busiestWeekdays}
                      </p>
                      {historical.busiestWeekdays.length > 0 ? (
                        historical.busiestWeekdays.map((d) => (
                          <p key={d.dayIndex} className="text-slate-600 tabular-nums">
                            {d.dayName} (~{Math.round(d.avgWaitingMinutes)}m · {d.observations} obs)
                          </p>
                        ))
                      ) : (
                        <p className="text-slate-400">Insufficient weekday spread</p>
                      )}
                    </div>

                    <div>
                      <p className="font-semibold text-[#0F2744] mb-1">
                        {t.office.busiestPeriods}
                      </p>
                      {historical.busiestTimePeriods.map((b) => (
                        <p key={b.bucketIndex} className="text-slate-600 tabular-nums">
                          {b.label} (~{Math.round(b.avgWaitingMinutes)}m)
                        </p>
                      ))}
                    </div>

                    <div>
                      <p className="font-semibold text-[#0F2744] mb-1">
                        {t.office.quietestPeriods}
                      </p>
                      {historical.leastCrowdedTimePeriods.map((b) => (
                        <p key={b.bucketIndex} className="text-emerald-800 tabular-nums">
                          {b.label} (~{Math.round(b.avgWaitingMinutes)}m)
                        </p>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Optional Grounded AI Visit Preparation Checklist */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100">
              <h2 className="text-base font-semibold text-[#0F2744]">{t.office.aiPrepTitle}</h2>
              {!aiBrief && (
                <Button
                  variant="outlineTeal"
                  size="sm"
                  onClick={handleGenerateAiBrief}
                  disabled={aiLoading}
                >
                  {aiLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  <span>{aiLoading ? t.office.aiPrepLoading : t.office.aiPrepButton}</span>
                </Button>
              )}
            </CardHeader>
            <CardContent className="pt-4">
              {!aiBrief && !aiError && (
                <p className="text-xs text-slate-500">
                  Optional checklist of typical documents and preparation reminders for this Indian office category. Core queue estimates do not depend on AI.
                </p>
              )}
              {aiError && <p className="text-xs text-amber-800">{aiError}</p>}
              {aiBrief && (
                <div className="space-y-3">
                  <div className="whitespace-pre-line text-sm text-slate-700 leading-relaxed">
                    {aiBrief.brief}
                  </div>
                  <p className="text-xs text-slate-500 border-t border-slate-100 pt-2">
                    {aiBrief.disclaimer}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Map & Official Contact */}
        <div className="lg:col-span-5 space-y-6">
          <Suspense fallback={<Skeleton className="h-72 w-full rounded-xl" />}>
            <LazyOfficeMap
              offices={[office]}
              center={{ latitude: office.latitude, longitude: office.longitude }}
              zoom={15}
              heightClass="h-72"
            />
          </Suspense>

          <Card>
            <CardHeader className="border-b border-slate-100">
              <h2 className="text-base font-semibold text-[#0F2744]">
                {t.office.officialContact}
              </h2>
            </CardHeader>
            <CardContent className="pt-4 space-y-3 text-sm">
              <div className="flex items-start justify-between gap-4">
                <span className="text-slate-500">Coordinates</span>
                <span className="font-mono text-xs tabular-nums text-[#0F2744]">
                  {office.latitude.toFixed(5)}, {office.longitude.toFixed(5)}
                </span>
              </div>

              <div className="flex items-start justify-between gap-4">
                <span className="text-slate-500 inline-flex items-center gap-1.5">
                  <Globe className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  <span>{t.office.website}</span>
                </span>
                {safeWebsite ? (
                  <a
                    href={safeWebsite}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[#0D7377] hover:underline truncate max-w-[200px]"
                  >
                    <span className="truncate">{new URL(safeWebsite).hostname}</span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  </a>
                ) : (
                  <span className="text-xs text-slate-400">{t.office.notListed}</span>
                )}
              </div>

              <div className="flex items-start justify-between gap-4">
                <span className="text-slate-500 inline-flex items-center gap-1.5">
                  <Phone className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  <span>{t.office.phone}</span>
                </span>
                {office.phone ? (
                  <a
                    href={`tel:${office.phone}`}
                    className="font-mono text-xs text-[#0F2744] hover:text-[#0D7377]"
                  >
                    {office.phone}
                  </a>
                ) : (
                  <span className="text-xs text-slate-400">{t.office.notListed}</span>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex flex-col gap-2">
                <a
                  href={buildDirectionsUrl(office.latitude, office.longitude, office.name)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="secondary" className="w-full justify-between">
                    <span className="inline-flex items-center gap-2">
                      <Navigation className="h-4 w-4 text-[#0D7377]" aria-hidden="true" />
                      <span>{t.common.openInOsm}</span>
                    </span>
                    <ExternalLink className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                  </Button>
                </a>
                <a
                  href={buildGoogleMapsDirectionsUrl(office.latitude, office.longitude)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="ghost" className="w-full justify-between text-xs">
                    <span>{t.common.openInGoogleMaps}</span>
                    <ExternalLink className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                  </Button>
                </a>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
