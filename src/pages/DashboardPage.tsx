import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, ArrowRight, PlusCircle, RefreshCw } from 'lucide-react';
import { useLocationContext } from '../context/LocationContext';
import { useI18n } from '../i18n/I18nContext';
import { discoverNearbyOffices, fetchRecentlyReportedOffices } from '../lib/api';
import { OFFICE_CATEGORIES } from '../types/domain';
import { LocationPickerBar } from '../components/common/LocationPickerBar';
import { SupabaseNotice } from '../components/common/SupabaseNotice';
import { OfficeCard } from '../components/office/OfficeCard';
import { Button, Card, CardContent, Skeleton } from '../components/ui/primitives';

const FEATURED_CATEGORIES = [
  'all',
  'post_office',
  'police_station',
  'government_hospital',
  'municipal_corporation',
  'rto_office',
  'sub_registrar',
  'court',
  'district_collector',
  'tehsil_office',
  'service_centre',
];

export function DashboardPage() {
  const { selectedLocation, userCoords, radiusMeters } = useLocationContext();
  const { language, t } = useI18n();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const nearbyQuery = useQuery({
    queryKey: [
      'nearby-offices',
      selectedLocation?.latitude,
      selectedLocation?.longitude,
      radiusMeters,
      selectedCategory,
    ],
    queryFn: () =>
      discoverNearbyOffices({
        lat: selectedLocation!.latitude,
        lon: selectedLocation!.longitude,
        radius: radiusMeters,
        category: selectedCategory,
        state: selectedLocation!.state,
        city: selectedLocation!.city,
      }),
    enabled: Boolean(selectedLocation),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const recentReportedQuery = useQuery({
    queryKey: ['recently-reported-offices'],
    queryFn: () => fetchRecentlyReportedOffices(6),
    staleTime: 60 * 1000,
  });

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#0F2744]">{t.dashboard.title}</h1>
          <p className="mt-1 text-sm text-slate-600">{t.dashboard.subtitle}</p>
        </div>

        <Link to="/report">
          <Button variant="primary">
            <PlusCircle className="h-4 w-4" aria-hidden="true" />
            <span>{t.dashboard.quickReportCta}</span>
          </Button>
        </Link>
      </div>

      <SupabaseNotice compact />

      {/* Location Discovery Panel */}
      <Card>
        <CardContent className="pt-5">
          <LocationPickerBar showRadius />
        </CardContent>
      </Card>

      {/* Interactive Category Filter Buttons */}
      <section aria-label={t.dashboard.categoriesHeading} className="space-y-2.5">
        <p className="text-xs font-medium text-slate-500">{t.dashboard.categoriesHeading}</p>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {FEATURED_CATEGORIES.map((cat) => {
            const catObj = OFFICE_CATEGORIES.find((c) => c.value === cat);
            const label =
              cat === 'all'
                ? t.common.allCategories
                : language === 'hi'
                  ? catObj?.labelHi || cat
                  : catObj?.labelEn || cat;
            const active = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`h-9 rounded-lg px-3.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#0F2744] text-white'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Nearby Public Offices Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-[#0F2744]">{t.dashboard.nearbyHeading}</h2>
          {selectedLocation && (
            <Link
              to="/explore"
              className="inline-flex items-center gap-1 text-sm font-medium text-[#0D7377] hover:underline whitespace-nowrap"
            >
              <span>{t.nav.explore}</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}
        </div>

        {!selectedLocation && (
          <Card>
            <CardContent className="py-10 text-center space-y-3">
              <p className="text-sm text-slate-600 max-w-lg mx-auto">
                {t.dashboard.noNearbyYet}
              </p>
              <p className="text-xs text-slate-500">{t.common.coverageHonesty}</p>
            </CardContent>
          </Card>
        )}

        {selectedLocation && nearbyQuery.isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="p-5 space-y-3">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-3.5 w-1/2" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </Card>
            ))}
          </div>
        )}

        {selectedLocation && nearbyQuery.isError && (
          <Card className="border-red-200 bg-red-50/40">
            <CardContent className="py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-700 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-red-900">
                    {nearbyQuery.error instanceof Error
                      ? nearbyQuery.error.message
                      : 'Failed to load public offices.'}
                  </p>
                  <p className="text-xs text-red-800/80 mt-1">
                    OpenStreetMap Overpass servers occasionally throttle high traffic. Retry in a few seconds.
                  </p>
                </div>
              </div>
              <Button variant="secondary" size="sm" onClick={() => nearbyQuery.refetch()}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                <span>{t.common.retry}</span>
              </Button>
            </CardContent>
          </Card>
        )}

        {selectedLocation && nearbyQuery.data && (
          <>
            {(nearbyQuery.data.offlineFallback || nearbyQuery.data.sourceNote) && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
                {nearbyQuery.data.sourceNote || t.common.cachedDataNotice}
              </div>
            )}

            {nearbyQuery.data.offices.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center space-y-3">
                  <p className="text-sm font-medium text-[#0F2744]">
                    No mapped public offices were found in OpenStreetMap for this exact filter and radius.
                  </p>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    {t.common.coverageHonesty} Try increasing the search radius or suggest a missing office.
                  </p>
                  <div className="pt-2">
                    <Link to="/suggest-office">
                      <Button variant="outlineTeal" size="sm">
                        {t.nav.suggestOffice}
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {nearbyQuery.data.offices.slice(0, 9).map((office) => (
                  <OfficeCard
                    key={office.id}
                    office={office}
                    showDistance={Boolean(userCoords || selectedLocation)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* Recently Reported Offices (Real Supabase Records Only) */}
      <section className="space-y-4 pt-2 border-t border-slate-200">
        <h2 className="text-lg font-semibold text-[#0F2744]">
          {t.dashboard.recentlyReportedHeading}
        </h2>

        {recentReportedQuery.isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="p-5 space-y-3">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-8 w-full" />
              </Card>
            ))}
          </div>
        ) : recentReportedQuery.data && recentReportedQuery.data.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentReportedQuery.data.map((office) => (
              <OfficeCard key={office.id} office={office} showDistance={false} />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <p className="text-sm text-slate-600">{t.dashboard.noRecentReports}</p>
              <Link to="/report">
                <Button variant="secondary" size="sm">
                  {t.nav.reportQueue}
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
