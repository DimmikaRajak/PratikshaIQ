import React, { Suspense, lazy, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, List, Map as MapIcon, RefreshCw, Search } from 'lucide-react';
import { useLocationContext } from '../context/LocationContext';
import { useI18n } from '../i18n/I18nContext';
import { discoverNearbyOffices, fetchDatabaseOffices } from '../lib/api';
import { OFFICE_CATEGORIES } from '../types/domain';
import { LocationPickerBar } from '../components/common/LocationPickerBar';
import { OfficeCard } from '../components/office/OfficeCard';
import { Button, Card, CardContent, Input, Select, Skeleton } from '../components/ui/primitives';

const LazyOfficeMap = lazy(() => import('../components/map/InteractiveOfficeMap'));

const PAGE_SIZE = 12;

export function ExploreOfficesPage() {
  const { selectedLocation, userCoords, radiusMeters } = useLocationContext();
  const { language, t } = useI18n();

  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [nameFilter, setNameFilter] = useState('');
  const [category, setCategory] = useState('all');
  const [pinFilter, setPinFilter] = useState('');
  const [page, setPage] = useState(1);

  const discoveryQuery = useQuery({
    queryKey: [
      'explore-discovery',
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
    retry: 1,
  });

  const dbOfficesQuery = useQuery({
    queryKey: ['explore-db-offices', nameFilter, category, pinFilter],
    queryFn: () =>
      fetchDatabaseOffices({
        search: nameFilter.trim() || undefined,
        category,
        postalCode: /^\d{6}$/.test(pinFilter.trim()) ? pinFilter.trim() : undefined,
        limit: 60,
      }),
    staleTime: 60 * 1000,
  });

  // Merge OSM discovered offices + Supabase approved offices cleanly without duplicates
  const filteredOffices = useMemo(() => {
    const mergedMap = new Map<string, (typeof combined)[number]>();
    const combined = [
      ...(discoveryQuery.data?.offices || []),
      ...(dbOfficesQuery.data?.offices || []),
    ];

    for (const office of combined) {
      const dedupeKey = office.osm_id ? `${office.osm_type}-${office.osm_id}` : office.id;
      if (!mergedMap.has(dedupeKey)) {
        mergedMap.set(dedupeKey, office);
      }
    }

    const q = nameFilter.trim().toLowerCase();
    const pin = pinFilter.trim();

    return Array.from(mergedMap.values()).filter((o) => {
      if (category !== 'all' && o.category !== category) return false;
      if (pin && !(o.postal_code || '').includes(pin)) return false;
      if (q) {
        const hay = `${o.name} ${o.address || ''} ${o.city || ''} ${o.district || ''} ${o.state} ${o.postal_code || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [discoveryQuery.data, dbOfficesQuery.data, nameFilter, category, pinFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredOffices.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedOffices = filteredOffices.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0F2744]">{t.nav.explore}</h1>
          <p className="mt-1 text-sm text-slate-600">{t.common.coverageHonesty}</p>
        </div>

        {/* Segmented View Toggle (Interactive control) */}
        <div className="inline-flex items-center rounded-lg bg-slate-200/70 p-1 self-start">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              viewMode === 'list'
                ? 'bg-white text-[#0F2744] shadow-xs'
                : 'text-slate-600 hover:text-[#0F2744]'
            }`}
          >
            <List className="h-3.5 w-3.5" aria-hidden="true" />
            <span>List</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('map')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              viewMode === 'map'
                ? 'bg-white text-[#0F2744] shadow-xs'
                : 'text-slate-600 hover:text-[#0F2744]'
            }`}
          >
            <MapIcon className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t.nav.map}</span>
          </button>
        </div>
      </div>

      {/* Pan-India Location Controls */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <LocationPickerBar showRadius onLocationChosen={() => setPage(1)} />

          <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
                aria-hidden="true"
              />
              <Input
                value={nameFilter}
                onChange={(e) => {
                  setNameFilter(e.target.value);
                  setPage(1);
                }}
                placeholder="Filter by office name or locality..."
                className="pl-9"
              />
            </div>

            <Select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by office category"
            >
              <option value="all">{t.common.allCategories}</option>
              {OFFICE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {language === 'hi' ? c.labelHi : c.labelEn}
                </option>
              ))}
            </Select>

            <Input
              value={pinFilter}
              onChange={(e) => {
                setPinFilter(e.target.value.replace(/\D/g, '').slice(0, 6));
                setPage(1);
              }}
              inputMode="numeric"
              placeholder="Filter by 6-digit PIN code"
            />
          </div>
        </CardContent>
      </Card>

      {discoveryQuery.data?.offlineFallback && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
          {t.common.cachedDataNotice}
        </div>
      )}

      {discoveryQuery.isError && (
        <Card className="border-red-200 bg-red-50/40">
          <CardContent className="py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-2.5 text-sm text-red-900">
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 text-red-700" aria-hidden="true" />
              <span>
                {discoveryQuery.error instanceof Error
                  ? discoveryQuery.error.message
                  : 'OpenStreetMap discovery request failed.'}
              </span>
            </div>
            <Button variant="secondary" size="sm" onClick={() => discoveryQuery.refetch()}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              <span>{t.common.retry}</span>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Results Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <p className="font-mono tabular-nums">
          {filteredOffices.length} public {filteredOffices.length === 1 ? 'office' : 'offices'} found
        </p>
        <Link to="/suggest-office" className="text-[#0D7377] font-medium hover:underline">
          Missing an office? {t.nav.suggestOffice}
        </Link>
      </div>

      {/* Loading Skeletons */}
      {selectedLocation && discoveryQuery.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="p-5 space-y-3">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-3.5 w-1/2" />
              <Skeleton className="h-10 w-full" />
            </Card>
          ))}
        </div>
      ) : viewMode === 'map' ? (
        <Suspense
          fallback={<Skeleton className="h-[460px] w-full rounded-xl" />}
        >
          <LazyOfficeMap
            offices={filteredOffices}
            center={selectedLocation}
            userCoords={userCoords}
            heightClass="h-[480px]"
          />
        </Suspense>
      ) : filteredOffices.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <p className="text-sm font-medium text-[#0F2744]">
              {selectedLocation
                ? 'No public offices matched your current search criteria.'
                : t.location.noLocationSelected}
            </p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              {t.common.coverageHonesty}
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
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginatedOffices.map((office) => (
              <OfficeCard
                key={office.id}
                office={office}
                showDistance={Boolean(userCoords || selectedLocation)}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-xs font-mono tabular-nums text-slate-600">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
