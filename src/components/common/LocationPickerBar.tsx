import React, { useEffect, useRef, useState } from 'react';
import { Crosshair, Loader2, MapPin, Search, X } from 'lucide-react';
import { INDIA_STATES_AND_UTS } from '../../data/indiaLocations';
import { useLocationContext } from '../../context/LocationContext';
import { useI18n } from '../../i18n/I18nContext';
import { searchIndiaLocations } from '../../lib/api';
import type { GeoLocationResult } from '../../types/domain';
import { Button, Input, Select } from '../ui/primitives';

interface LocationPickerBarProps {
  showRadius?: boolean;
  onLocationChosen?: () => void;
}

export function LocationPickerBar({
  showRadius = true,
  onLocationChosen,
}: LocationPickerBarProps) {
  const { t } = useI18n();
  const {
    selectedLocation,
    radiusMeters,
    detectingLocation,
    locationError,
    setSelectedLocation,
    setRadiusMeters,
    requestCurrentLocation,
  } = useLocationContext();

  const [query, setQuery] = useState('');
  const [selectedState, setSelectedState] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [suggestions, setSuggestions] = useState<GeoLocationResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const stateObj = INDIA_STATES_AND_UTS.find((s) => s.name === selectedState);

  // Debounced Nominatim geocoding search (respects OSM rate limits)
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setSuggestions([]);
      setSearchError(null);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const res = await searchIndiaLocations(trimmed, selectedState || undefined);
        setSuggestions(res);
        setDropdownOpen(true);
      } catch (err) {
        setSearchError(err instanceof Error ? err.message : 'Search failed.');
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [query, selectedState]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectSuggestion = (item: GeoLocationResult) => {
    const shortLabel =
      [item.city, item.state].filter(Boolean).join(', ') ||
      item.display_name.split(',').slice(0, 2).join(', ');
    setSelectedLocation({
      label: shortLabel,
      latitude: item.latitude,
      longitude: item.longitude,
      city: item.city,
      state: item.state,
      source: 'manual_search',
    });
    setQuery(shortLabel);
    setDropdownOpen(false);
    onLocationChosen?.();
  };

  const handleStateCityApply = (stateName: string, cityName: string) => {
    const st = INDIA_STATES_AND_UTS.find((s) => s.name === stateName);
    const ct = st?.cities.find((c) => c.name === cityName);
    if (!st || !ct) return;
    setSelectedLocation({
      label: `${ct.name}, ${st.name}`,
      latitude: ct.latitude,
      longitude: ct.longitude,
      city: ct.name,
      state: st.name,
      source: 'state_city_picker',
    });
    onLocationChosen?.();
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    setSearching(true);
    setSearchError(null);
    try {
      const res = await searchIndiaLocations(trimmed, selectedState || undefined);
      setSuggestions(res);
      setDropdownOpen(true);
      if (res.length === 1) {
        handleSelectSuggestion(res[0]);
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Location lookup failed.');
    } finally {
      setSearching(false);
    }
  };

  return (
    <div ref={containerRef} className="space-y-3">
      {/* Row 1: Free-text Indian city / locality / PIN code search + Current Location */}
      <form onSubmit={handleManualSubmit} className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (e.target.value.trim().length >= 3) setDropdownOpen(true);
            }}
            placeholder={t.location.searchPlaceholder}
            aria-label={t.location.searchPlaceholder}
            className="pl-10 pr-9"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setSuggestions([]);
                setDropdownOpen(false);
              }}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}

          {dropdownOpen && (searching || suggestions.length > 0 || searchError) && (
            <div className="absolute left-0 right-0 top-full z-40 mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
              {searching && (
                <div className="flex items-center gap-2 px-4 py-3 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin text-[#0D7377]" />
                  <span>{t.common.loading}</span>
                </div>
              )}
              {!searching && searchError && (
                <div className="px-4 py-3 text-sm text-red-700">{searchError}</div>
              )}
              {!searching && !searchError && suggestions.length === 0 && query.trim().length >= 3 && (
                <div className="px-4 py-3 text-sm text-slate-500">
                  No matching Indian locations found. Try selecting a State & City below.
                </div>
              )}
              {!searching &&
                suggestions.map((item, idx) => (
                  <button
                    key={`${item.osm_id || idx}-${item.latitude}`}
                    type="button"
                    onClick={() => handleSelectSuggestion(item)}
                    className="flex w-full items-start gap-2.5 border-b border-slate-100 px-4 py-2.5 text-left text-sm hover:bg-slate-50 last:border-b-0 cursor-pointer"
                  >
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#0D7377]" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="font-medium text-[#0F2744] truncate">
                        {[item.city, item.state].filter(Boolean).join(', ') ||
                          item.display_name.split(',')[0]}
                      </p>
                      <p className="text-xs text-slate-500 truncate">{item.display_name}</p>
                    </div>
                  </button>
                ))}
            </div>
          )}
        </div>

        <Button
          type="button"
          variant="outlineTeal"
          onClick={() => {
            void requestCurrentLocation().then(() => onLocationChosen?.());
          }}
          disabled={detectingLocation}
        >
          {detectingLocation ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Crosshair className="h-4 w-4" aria-hidden="true" />
          )}
          <span>
            {detectingLocation ? t.location.detectingLocation : t.location.useCurrentLocation}
          </span>
        </Button>
      </form>

      {/* Row 2: All 28 States & 8 UTs selector + City selector + Radius selector */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <Select
          value={selectedState}
          aria-label={t.location.selectState}
          onChange={(e) => {
            const nextState = e.target.value;
            setSelectedState(nextState);
            setSelectedCity('');
            const found = INDIA_STATES_AND_UTS.find((s) => s.name === nextState);
            if (found && found.cities.length === 1) {
              setSelectedCity(found.cities[0].name);
              handleStateCityApply(nextState, found.cities[0].name);
            }
          }}
        >
          <option value="">{t.location.selectState} (28 States & 8 UTs)</option>
          <optgroup label="States (28)">
            {INDIA_STATES_AND_UTS.filter((s) => s.type === 'state').map((st) => (
              <option key={st.code} value={st.name}>
                {st.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Union Territories (8)">
            {INDIA_STATES_AND_UTS.filter((s) => s.type === 'ut').map((ut) => (
              <option key={ut.code} value={ut.name}>
                {ut.name}
              </option>
            ))}
          </optgroup>
        </Select>

        <Select
          value={selectedCity}
          disabled={!stateObj}
          aria-label={t.location.selectCity}
          onChange={(e) => {
            const nextCity = e.target.value;
            setSelectedCity(nextCity);
            if (selectedState && nextCity) {
              handleStateCityApply(selectedState, nextCity);
            }
          }}
        >
          <option value="">{t.location.selectCity}</option>
          {stateObj?.cities.map((ct) => (
            <option key={ct.name} value={ct.name}>
              {ct.name}
            </option>
          ))}
        </Select>

        {showRadius && (
          <Select
            value={String(radiusMeters)}
            aria-label={t.common.radius}
            onChange={(e) => setRadiusMeters(Number(e.target.value))}
          >
            <option value="2000">{t.common.radius}: 2 km</option>
            <option value="5000">{t.common.radius}: 5 km</option>
            <option value="10000">{t.common.radius}: 10 km</option>
            <option value="20000">{t.common.radius}: 20 km</option>
          </Select>
        )}
      </div>

      {locationError && (
        <p role="alert" className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {locationError}
        </p>
      )}

      {selectedLocation && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
          <span>{t.location.selectedArea}:</span>
          <span className="font-medium text-[#0F2744]">{selectedLocation.label}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums text-slate-500">
            {selectedLocation.latitude.toFixed(4)}, {selectedLocation.longitude.toFixed(4)}
          </span>
          {selectedLocation.source === 'browser_geolocation' && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-[#0D7377]">Device GPS</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
