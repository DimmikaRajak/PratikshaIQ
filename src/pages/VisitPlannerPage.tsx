import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Info } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../context/AuthContext';
import { fetchDatabaseOffices, fetchOfficeReports } from '../lib/api';
import { readAllCachedOffices } from '../lib/offlineCache';
import { evaluatePlannedVisit } from '../lib/historicalAnalytics';
import { formatMinutesReadable } from '../lib/queueEngine';
import type { Office } from '../types/domain';
import { getCategoryLabel } from '../lib/utils';
import { SupabaseNotice } from '../components/common/SupabaseNotice';
import { Button, Card, CardContent, Input, Label, Select } from '../components/ui/primitives';

export function VisitPlannerPage() {
  const location = useLocation();
  const initialOffice = (location.state as { office?: Office } | null)?.office ?? null;
  const { isConfigured } = useAuth();
  const { language, t } = useI18n();

  const [selectedOfficeId, setSelectedOfficeId] = useState<string>(initialOffice?.id || '');
  const [preferredDate, setPreferredDate] = useState<string>(() => {
    const tomorrow = new Date(Date.now() + 86400000);
    return tomorrow.toISOString().slice(0, 10);
  });
  const [preferredHour, setPreferredHour] = useState<number>(10);
  const [evaluated, setEvaluated] = useState<boolean>(Boolean(initialOffice));

  const dbOfficesQuery = useQuery({
    queryKey: ['planner-offices'],
    queryFn: () => fetchDatabaseOffices({ limit: 50 }),
    enabled: isConfigured,
  });

  const officeOptions = useMemo(() => {
    const map = new Map<string, Office>();
    if (initialOffice) map.set(initialOffice.id, initialOffice);
    for (const o of [...(dbOfficesQuery.data?.offices || []), ...readAllCachedOffices()]) {
      if (!map.has(o.id)) map.set(o.id, o);
    }
    return Array.from(map.values());
  }, [initialOffice, dbOfficesQuery.data]);

  const selectedOffice = officeOptions.find((o) => o.id === selectedOfficeId) || null;

  const reportsQuery = useQuery({
    queryKey: ['planner-office-reports', selectedOffice?.id],
    queryFn: () => fetchOfficeReports(selectedOffice!.id, 200),
    enabled: Boolean(selectedOffice?.id && isConfigured),
  });

  const planResult = useMemo(() => {
    if (!evaluated || !selectedOffice) return null;
    return evaluatePlannedVisit(reportsQuery.data || [], preferredDate, preferredHour);
  }, [evaluated, selectedOffice, reportsQuery.data, preferredDate, preferredHour]);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0F2744]">{t.planner.title}</h1>
        <p className="mt-1 text-sm text-slate-600">{t.planner.subtitle}</p>
      </div>

      <SupabaseNotice compact />

      <Card>
        <CardContent className="pt-5 space-y-4">
          <div>
            <Label htmlFor="planner-office">{t.planner.selectOffice}</Label>
            <Select
              id="planner-office"
              value={selectedOfficeId}
              onChange={(e) => {
                setSelectedOfficeId(e.target.value);
                setEvaluated(false);
              }}
            >
              <option value="">Choose a public office...</option>
              {officeOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({getCategoryLabel(o.category, language)} — {o.city || o.state})
                </option>
              ))}
            </Select>
            {officeOptions.length === 0 && (
              <p className="mt-1.5 text-xs text-slate-500">
                First search and discover an office in{' '}
                <Link to="/explore" className="text-[#0D7377] font-medium hover:underline">
                  Explore Offices
                </Link>
                .
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="planner-date">{t.planner.preferredDate}</Label>
              <Input
                id="planner-date"
                type="date"
                value={preferredDate}
                onChange={(e) => setPreferredDate(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="planner-hour">{t.planner.preferredTime}</Label>
              <Select
                id="planner-hour"
                value={String(preferredHour)}
                onChange={(e) => setPreferredHour(Number(e.target.value))}
              >
                {[9, 10, 11, 12, 13, 14, 15, 16, 17].map((hr) => (
                  <option key={hr} value={hr}>
                    {String(hr).padStart(2, '0')}:00 – {String(hr + 1).padStart(2, '0')}:00
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <Button
            variant="primary"
            className="w-full"
            disabled={!selectedOffice}
            onClick={() => setEvaluated(true)}
          >
            <CalendarClock className="h-4 w-4" aria-hidden="true" />
            <span>{t.planner.evaluateButton}</span>
          </Button>
        </CardContent>
      </Card>

      {planResult && selectedOffice && (
        <Card>
          <CardContent className="pt-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-[#0F2744]">{selectedOffice.name}</h2>
                <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                  {preferredDate} · {String(preferredHour).padStart(2, '0')}:00
                </p>
              </div>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                {planResult.slotObservations} obs
              </span>
            </div>

            {planResult.hasSlotData && planResult.slotAverageWaitingMinutes !== null ? (
              <div className="rounded-lg bg-[#EEF7F7] border border-[#0D7377]/20 p-4 space-y-1">
                <p className="text-xs font-medium text-[#0D7377]">
                  Historical average waiting time for this slot
                </p>
                <p className="text-2xl font-bold font-mono tabular-nums text-[#0F2744]">
                  ~{formatMinutesReadable(Math.round(planResult.slotAverageWaitingMinutes), language)}
                </p>
              </div>
            ) : (
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
                <p className="text-sm font-medium text-[#0F2744]">
                  {t.office.insufficientHistory}
                </p>
              </div>
            )}

            <p className="text-sm text-slate-700 leading-relaxed">{planResult.explanation}</p>

            {planResult.recommendedAlternative && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3.5 text-sm text-emerald-950">
                <p className="font-semibold">
                  Historically quieter window: {planResult.recommendedAlternative.label}
                </p>
                <p className="text-xs text-emerald-900 mt-1 tabular-nums">
                  Historical average: ~
                  {Math.round(planResult.recommendedAlternative.avgWaitingMinutes)} minutes across{' '}
                  {planResult.recommendedAlternative.observations} citizen reports.
                </p>
              </div>
            )}

            <div className="flex items-start gap-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
              <Info className="h-4 w-4 shrink-0 mt-0.5 text-slate-400" aria-hidden="true" />
              <p>{t.planner.disclaimer}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
