import { Link } from 'react-router-dom';
import { ArrowUpRight, Navigation } from 'lucide-react';
import type { Office } from '../../types/domain';
import { useI18n } from '../../i18n/I18nContext';
import {
  buildDirectionsUrl,
  formatDistance,
  formatRelativeTime,
  getCategoryLabel,
  getConfidenceLabel,
  getCrowdMeta,
} from '../../lib/utils';
import { formatMinutesReadable } from '../../lib/queueEngine';

interface OfficeCardProps {
  office: Office;
  showDistance?: boolean;
}

export function OfficeCard({ office, showDistance = true }: OfficeCardProps) {
  const { language, t } = useI18n();
  const agg = office.aggregate;
  const hasLiveReports = Boolean(agg && agg.recent_report_count > 0);
  const crowdLevel = hasLiveReports && agg ? agg.current_crowd_level : 'unknown';
  const crowdMeta = getCrowdMeta(crowdLevel, language);
  const confidenceText = getConfidenceLabel(
    hasLiveReports && agg ? agg.confidence_level : 'no_data',
    language
  );
  const distanceLabel = showDistance ? formatDistance(office.distance_meters) : null;

  const sourceLabel =
    office.source === 'osm'
      ? t.common.osmSource
      : office.source === 'citizen_suggestion'
        ? t.common.citizenSource
        : t.common.officialSource;

  const locationLine =
    office.address ||
    [office.city, office.district, office.state, office.postal_code].filter(Boolean).join(', ');

  return (
    <article className="group flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-5 transition-colors duration-150 hover:border-slate-300">
      <div>
        {/* Title leads directly — zero pill badge sandwich */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              to={`/office/${encodeURIComponent(office.slug)}`}
              state={{ office }}
              className="text-base font-semibold text-[#0F2744] hover:text-[#0D7377] transition-colors line-clamp-2"
            >
              {office.name}
            </Link>
            {/* Quiet unboxed metadata with typographic separators */}
            <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500">
              <span className="font-medium text-slate-700">
                {getCategoryLabel(office.category, language)}
              </span>
              <span aria-hidden="true">·</span>
              <span>{sourceLabel}</span>
              {distanceLabel && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums text-slate-700">{distanceLabel}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {locationLine && (
          <p className="mt-2.5 text-sm text-slate-600 line-clamp-2 leading-relaxed">
            {locationLine}
          </p>
        )}

        {/* Crowd & Waiting Time Status Strip (subtle hairline separation, no nested card box) */}
        <div className="mt-4 pt-3.5 border-t border-slate-100 space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full ${crowdMeta.dotColor}`}
              />
              <span className={`font-semibold ${crowdMeta.textColor}`}>
                {crowdMeta.label}
              </span>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <span className="text-xs text-slate-500">{confidenceText}</span>
            </div>

            {hasLiveReports && agg?.estimated_waiting_minutes !== null && agg?.estimated_waiting_minutes !== undefined ? (
              <span className="font-mono text-sm font-medium tabular-nums text-[#0F2744]">
                ~{formatMinutesReadable(Math.round(agg.estimated_waiting_minutes), language)}
              </span>
            ) : (
              <span className="text-xs text-slate-500">{t.common.noData}</span>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
            <span>
              {hasLiveReports && agg
                ? language === 'hi'
                  ? `${agg.recent_report_count} हालिया रिपोर्ट`
                  : `${agg.recent_report_count} recent ${agg.recent_report_count === 1 ? 'report' : 'reports'}`
                : language === 'hi'
                  ? 'प्रतीक्षा समय उपलब्ध नहीं। पहली रिपोर्ट करें।'
                  : 'Waiting time unavailable. Be the first to report.'}
            </span>
            {hasLiveReports && agg?.last_report_at && (
              <span className="font-mono tabular-nums shrink-0">
                {formatRelativeTime(agg.last_report_at, language)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
        <Link
          to={`/office/${encodeURIComponent(office.slug)}`}
          state={{ office }}
          className="inline-flex items-center gap-1 text-sm font-medium text-[#0D7377] hover:text-[#0A5C60] transition-colors whitespace-nowrap"
        >
          <span>{t.common.viewDetails}</span>
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </Link>

        <a
          href={buildDirectionsUrl(office.latitude, office.longitude, office.name)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-[#0F2744] transition-colors whitespace-nowrap"
        >
          <Navigation className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{t.common.directions}</span>
        </a>
      </div>
    </article>
  );
}
