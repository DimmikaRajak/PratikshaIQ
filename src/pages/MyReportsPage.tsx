import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { fetchMyOfficeSuggestions, fetchMyReports } from '../lib/api';
import { formatRangeLabel } from '../lib/queueEngine';
import { formatRelativeTime, getCategoryLabel, getCrowdMeta } from '../lib/utils';
import { SupabaseNotice } from '../components/common/SupabaseNotice';
import { Button, Card, CardContent, CardHeader, Skeleton } from '../components/ui/primitives';

export function MyReportsPage() {
  const { user, isConfigured } = useAuth();
  const { language, t } = useI18n();

  const reportsQuery = useQuery({
    queryKey: ['my-reports', user?.id],
    queryFn: fetchMyReports,
    enabled: Boolean(user && isConfigured),
  });

  const suggestionsQuery = useQuery({
    queryKey: ['my-suggestions', user?.id],
    queryFn: fetchMyOfficeSuggestions,
    enabled: Boolean(user && isConfigured),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0F2744]">{t.nav.myReports}</h1>
          <p className="mt-1 text-sm text-slate-600">
            Your submitted waiting-time observations and public office suggestions.
          </p>
        </div>
        <Link to="/report">
          <Button variant="accent" size="sm">
            {t.nav.reportQueue}
          </Button>
        </Link>
      </div>

      <SupabaseNotice />

      {isConfigured && !user && (
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <p className="text-sm text-slate-600">{t.common.signInRequired}</p>
            <Link to="/login">
              <Button variant="primary">{t.nav.signIn}</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {user && (
        <>
          <Card>
            <CardHeader className="border-b border-slate-100">
              <h2 className="text-base font-semibold text-[#0F2744]">Queue Report History</h2>
            </CardHeader>
            <CardContent className="pt-4">
              {reportsQuery.isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                </div>
              ) : reportsQuery.data && reportsQuery.data.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {reportsQuery.data.map((r) => {
                    const crowd = getCrowdMeta(r.crowd_level, language);
                    return (
                      <div key={r.id} className="py-3.5 first:pt-0 last:pb-0 space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          {r.office ? (
                            <Link
                              to={`/office/${encodeURIComponent(r.office.slug)}`}
                              className="text-sm font-semibold text-[#0F2744] hover:text-[#0D7377]"
                            >
                              {r.office.name}
                            </Link>
                          ) : (
                            <span className="text-sm font-semibold text-[#0F2744]">
                              Public Office
                            </span>
                          )}
                          <span className="text-xs font-mono tabular-nums text-slate-500">
                            {formatRelativeTime(r.submitted_at, language)}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-600">
                          <span className={`font-semibold ${crowd.textColor}`}>{crowd.label}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {formatRangeLabel(r.waiting_time_min, r.waiting_time_max, language)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">
                            {r.queue_size_min}–{r.queue_size_max} people
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>Status: {r.report_status}</span>
                        </div>
                        {r.note && <p className="text-xs text-slate-500">{r.note}</p>}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="py-6 text-sm text-slate-500">
                  You have not submitted any queue reports yet.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-slate-100">
              <h2 className="text-base font-semibold text-[#0F2744]">
                My Office Suggestions
              </h2>
            </CardHeader>
            <CardContent className="pt-4">
              {suggestionsQuery.isLoading ? (
                <Skeleton className="h-14 w-full" />
              ) : suggestionsQuery.data && suggestionsQuery.data.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {suggestionsQuery.data.map((s) => (
                    <div key={s.id} className="py-3 first:pt-0 last:pb-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-[#0F2744]">{s.office_name}</p>
                        <span className="text-xs font-medium capitalize text-slate-600">
                          {s.review_status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        {getCategoryLabel(s.category, language)} · {s.city}, {s.state}
                      </p>
                      {s.reviewer_notes && (
                        <p className="text-xs text-slate-600">Review note: {s.reviewer_notes}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-4 text-sm text-slate-500">
                  No office suggestions submitted yet.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
