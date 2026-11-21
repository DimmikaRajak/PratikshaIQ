import React, { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { fetchDatabaseOffices, submitQueueReport } from '../lib/api';
import { readAllCachedOffices } from '../lib/offlineCache';
import {
  QUEUE_SIZE_OPTIONS,
  WAITING_TIME_OPTIONS,
  type Office,
  type ReportableCrowdLevel,
} from '../types/domain';
import { getCategoryLabel, getCrowdMeta } from '../lib/utils';
import { SupabaseNotice } from '../components/common/SupabaseNotice';
import { Button, Card, CardContent, Input, Label, Textarea } from '../components/ui/primitives';

const CROWD_OPTIONS: ReportableCrowdLevel[] = [
  'very_low',
  'low',
  'moderate',
  'high',
  'very_high',
];

export function SubmitReportPage() {
  const location = useLocation();
  const initialOffice = (location.state as { office?: Office } | null)?.office ?? null;
  const queryClient = useQueryClient();
  const { user, isConfigured } = useAuth();
  const { language, t } = useI18n();

  const [selectedOffice, setSelectedOffice] = useState<Office | null>(initialOffice);
  const [officeSearch, setOfficeSearch] = useState('');
  const [queueSizeIdx, setQueueSizeIdx] = useState<number>(1);
  const [waitTimeIdx, setWaitTimeIdx] = useState<number>(1);
  const [crowdLevel, setCrowdLevel] = useState<ReportableCrowdLevel>('moderate');
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submittedResult, setSubmittedResult] = useState<{
    reportId: string;
    officeSlug: string;
    officeName: string;
  } | null>(null);

  const dbOfficesQuery = useQuery({
    queryKey: ['report-office-picker', officeSearch],
    queryFn: () => fetchDatabaseOffices({ search: officeSearch.trim() || undefined, limit: 25 }),
    enabled: isConfigured,
    staleTime: 30_000,
  });

  const cachedOffices = useMemo(() => readAllCachedOffices(), []);

  const candidateOffices = useMemo(() => {
    const map = new Map<string, Office>();
    for (const o of [...(dbOfficesQuery.data?.offices || []), ...cachedOffices]) {
      const key = o.osm_id ? `${o.osm_type}-${o.osm_id}` : o.id;
      if (!map.has(key)) map.set(key, o);
    }
    const q = officeSearch.trim().toLowerCase();
    return Array.from(map.values())
      .filter((o) => {
        if (!q) return true;
        return `${o.name} ${o.city || ''} ${o.state} ${o.address || ''}`
          .toLowerCase()
          .includes(q);
      })
      .slice(0, 15);
  }, [dbOfficesQuery.data, cachedOffices, officeSearch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!selectedOffice) {
      setErrorMsg(t.reportForm.validationSelectOffice);
      return;
    }
    if (!confirmed) {
      setErrorMsg(t.reportForm.validationConfirm);
      return;
    }

    const qOpt = QUEUE_SIZE_OPTIONS[queueSizeIdx];
    const wOpt = WAITING_TIME_OPTIONS[waitTimeIdx];

    setSubmitting(true);
    try {
      const result = await submitQueueReport({
        office: selectedOffice,
        queue_size_min: qOpt.min,
        queue_size_max: qOpt.max,
        waiting_time_min: wOpt.min,
        waiting_time_max: wOpt.max,
        crowd_level: crowdLevel,
        note,
      });

      void queryClient.invalidateQueries({ queryKey: ['office-reports'] });
      void queryClient.invalidateQueries({ queryKey: ['office-detail'] });
      void queryClient.invalidateQueries({ queryKey: ['recently-reported-offices'] });
      void queryClient.invalidateQueries({ queryKey: ['my-reports'] });

      setSubmittedResult({
        reportId: result.reportId,
        officeSlug: result.officeSlug,
        officeName: selectedOffice.name,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to submit queue report.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submittedResult) {
    return (
      <Card className="max-w-xl mx-auto">
        <CardContent className="py-10 text-center space-y-4">
          <CheckCircle2 className="h-11 w-11 text-emerald-700 mx-auto" aria-hidden="true" />
          <h1 className="text-xl font-bold text-[#0F2744]">{t.reportForm.successTitle}</h1>
          <p className="text-sm text-slate-600">{t.reportForm.successDesc}</p>
          <p className="text-xs font-mono text-slate-500">{submittedResult.officeName}</p>
          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <Link to={`/office/${encodeURIComponent(submittedResult.officeSlug)}`}>
              <Button variant="accent">{t.common.viewDetails}</Button>
            </Link>
            <Link to="/my-reports">
              <Button variant="secondary">{t.nav.myReports}</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0F2744]">{t.reportForm.title}</h1>
        <p className="mt-1 text-sm text-slate-600">{t.reportForm.subtitle}</p>
      </div>

      <SupabaseNotice />

      {isConfigured && !user && (
        <Card className="border-slate-200 bg-white">
          <CardContent className="py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-[#0F2744]">{t.common.signInRequired}</p>
              <p className="text-xs text-slate-500 mt-1">
                Citizen reports require authentication to prevent spam and duplicate submissions.
              </p>
            </div>
            <Link to="/login" state={{ from: '/report', office: selectedOffice }}>
              <Button variant="primary">{t.nav.signIn}</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-5">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Step 1: Select Office */}
            <div className="space-y-2.5">
              <Label>{t.reportForm.selectOffice}</Label>
              {selectedOffice ? (
                <div className="flex items-start justify-between gap-3 rounded-lg border border-[#0D7377]/30 bg-[#EEF7F7]/50 p-3.5">
                  <div>
                    <p className="text-sm font-semibold text-[#0F2744]">{selectedOffice.name}</p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      {getCategoryLabel(selectedOffice.category, language)} ·{' '}
                      {[selectedOffice.city, selectedOffice.state].filter(Boolean).join(', ')}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedOffice(null)}
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
                      aria-hidden="true"
                    />
                    <Input
                      value={officeSearch}
                      onChange={(e) => setOfficeSearch(e.target.value)}
                      placeholder={t.reportForm.searchOfficePlaceholder}
                      className="pl-9"
                    />
                  </div>
                  {candidateOffices.length > 0 ? (
                    <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                      {candidateOffices.map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => setSelectedOffice(o)}
                          className="w-full px-3.5 py-2.5 text-left hover:bg-slate-50 transition-colors cursor-pointer"
                        >
                          <p className="text-sm font-medium text-[#0F2744]">{o.name}</p>
                          <p className="text-xs text-slate-500">
                            {getCategoryLabel(o.category, language)} ·{' '}
                            {[o.city, o.state].filter(Boolean).join(', ')}
                          </p>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">
                      No offices loaded yet. First discover offices in{' '}
                      <Link to="/explore" className="text-[#0D7377] font-medium hover:underline">
                        Explore Offices
                      </Link>{' '}
                      or{' '}
                      <Link
                        to="/suggest-office"
                        className="text-[#0D7377] font-medium hover:underline"
                      >
                        suggest a missing office
                      </Link>
                      .
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Step 2: Queue Size */}
            <div>
              <Label>{t.reportForm.queueSizeLabel}</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {QUEUE_SIZE_OPTIONS.map((opt, idx) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setQueueSizeIdx(idx)}
                    className={`min-h-[44px] rounded-lg border px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                      queueSizeIdx === idx
                        ? 'border-[#0D7377] bg-[#EEF7F7] text-[#0D7377]'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {language === 'hi' ? opt.labelHi : opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Step 3: Waiting Time */}
            <div>
              <Label>{t.reportForm.waitingTimeLabel}</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {WAITING_TIME_OPTIONS.map((opt, idx) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setWaitTimeIdx(idx)}
                    className={`min-h-[44px] rounded-lg border px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                      waitTimeIdx === idx
                        ? 'border-[#0D7377] bg-[#EEF7F7] text-[#0D7377]'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {language === 'hi' ? opt.labelHi : opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Step 4: Crowd Level */}
            <div>
              <Label>{t.reportForm.crowdLevelLabel}</Label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {CROWD_OPTIONS.map((lvl) => {
                  const meta = getCrowdMeta(lvl, language);
                  const active = crowdLevel === lvl;
                  return (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setCrowdLevel(lvl)}
                      className={`min-h-[44px] rounded-lg border px-2.5 py-2 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                        active
                          ? 'border-[#0F2744] bg-[#0F2744] text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span
                        className={`h-2 w-2 rounded-full ${active ? 'bg-white' : meta.dotColor}`}
                        aria-hidden="true"
                      />
                      <span>{meta.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 5: Optional Note */}
            <div>
              <Label htmlFor="report-note">{t.reportForm.noteLabel}</Label>
              <Textarea
                id="report-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                placeholder={t.reportForm.notePlaceholder}
              />
            </div>

            {/* Step 6: Firsthand confirmation */}
            <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 accent-[#0D7377]"
              />
              <span>{t.reportForm.confirmCheckbox}</span>
            </label>

            {errorMsg && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
                {errorMsg}
              </p>
            )}

            <Button
              type="submit"
              variant="accent"
              size="lg"
              className="w-full"
              disabled={submitting || !user || !isConfigured}
            >
              {submitting ? t.reportForm.submitting : t.reportForm.submitButton}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
