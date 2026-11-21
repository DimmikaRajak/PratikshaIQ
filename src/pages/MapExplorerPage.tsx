import { Suspense, lazy, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Navigation } from 'lucide-react';
import { useLocationContext } from '../context/LocationContext';
import { useI18n } from '../i18n/I18nContext';
import { discoverNearbyOffices } from '../lib/api';
import { OFFICE_CATEGORIES } from '../types/domain';
import {
  buildDirectionsUrl,
  formatDistance,
  getCategoryLabel,
  getCrowdMeta,
} from '../lib/utils';
import { LocationPickerBar } from '../components/common/LocationPickerBar';
import { Card, CardContent, Select, Skeleton } from '../components/ui/primitives';

const LazyOfficeMap = lazy(() => import('../components/map/InteractiveOfficeMap'));

export function MapExplorerPage() {
  const { selectedLocation, userCoords, radiusMeters } = useLocationContext();
  const { language, t } = useI18n();
  const [category, setCategory] = useState('all');

  const query = useQuery({
    queryKey: [
      'map-explorer-offices',
      selectedLocation?.latitude,
      selectedLocation?.longitude,
      radiusMeters,
      category,
    ],
    queryFn: () =>
      discoverNearbyOffices({
        lat: selectedLocation!.latitude,
        lon: selectedLocation!.longitude,
        radius: radiusMeters,
        category,
        state: selectedLocation!.state,
        city: selectedLocation!.city,
      }),
    enabled: Boolean(selectedLocation),
    staleTime: 5 * 60 * 1000,
  });

  const offices = query.data?.offices || [];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0F2744]">{t.nav.map}</h1>
          <p className="mt-1 text-sm text-slate-600">{t.common.osmAttribution}</p>
        </div>

        <div className="w-full sm:w-64">
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Filter map by category"
          >
            <option value="all">{t.common.allCategories}</option>
            {OFFICE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {language === 'hi' ? c.labelHi : c.labelEn}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="pt-5">
          <LocationPickerBar showRadius />
        </CardContent>
      </Card>

      {/* Crowd Legend (Color + explicit text label for accessibility) */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600">
        {(
          ['very_low', 'low', 'moderate', 'high', 'very_high', 'unknown'] as const
        ).map((lvl) => {
          const meta = getCrowdMeta(lvl, language);
          return (
            <span key={lvl} className="inline-flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${meta.dotColor}`} aria-hidden="true" />
              <span>{meta.label}</span>
            </span>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-8">
          <Suspense fallback={<Skeleton className="h-[520px] w-full rounded-xl" />}>
            <LazyOfficeMap
              offices={offices}
              center={selectedLocation}
              userCoords={userCoords}
              heightClass="h-[520px]"
            />
          </Suspense>
        </div>

        <div className="lg:col-span-4 rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#0F2744]">Mapped Offices</h2>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {offices.length}
            </span>
          </div>

          <div className="max-h-[468px] overflow-y-auto divide-y divide-slate-100">
            {!selectedLocation && (
              <p className="p-4 text-xs text-slate-500 leading-relaxed">
                {t.location.noLocationSelected}
              </p>
            )}
            {selectedLocation && query.isLoading && (
              <div className="p-4 space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            )}
            {selectedLocation && !query.isLoading && offices.length === 0 && (
              <p className="p-4 text-xs text-slate-500">
                No mapped public offices found in this radius. Try expanding the radius or switching category.
              </p>
            )}
            {offices.map((office) => {
              const dist = formatDistance(office.distance_meters);
              const crowd = getCrowdMeta(
                office.aggregate && office.aggregate.recent_report_count > 0
                  ? office.aggregate.current_crowd_level
                  : 'unknown',
                language
              );
              return (
                <div key={office.id} className="p-3.5 hover:bg-slate-50 transition-colors">
                  <Link
                    to={`/office/${encodeURIComponent(office.slug)}`}
                    state={{ office }}
                    className="block text-sm font-medium text-[#0F2744] hover:text-[#0D7377]"
                  >
                    {office.name}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-slate-500">
                    <span>{getCategoryLabel(office.category, language)}</span>
                    <span aria-hidden="true">·</span>
                    <span className={crowd.textColor}>{crowd.label}</span>
                    {dist && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{dist}</span>
                      </>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs">
                    <Link
                      to={`/office/${encodeURIComponent(office.slug)}`}
                      state={{ office }}
                      className="text-[#0D7377] font-medium hover:underline"
                    >
                      {t.common.viewDetails}
                    </Link>
                    <a
                      href={buildDirectionsUrl(office.latitude, office.longitude, office.name)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-slate-500 hover:text-[#0F2744]"
                    >
                      <Navigation className="h-3 w-3" aria-hidden="true" />
                      <span>{t.common.directions}</span>
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
