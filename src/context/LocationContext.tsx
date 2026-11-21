import React, { createContext, useContext, useState, useCallback } from 'react';
import type { SelectedLocation } from '../types/domain';
import { reverseGeocodeIndia } from '../lib/api';

interface LocationContextValue {
  selectedLocation: SelectedLocation | null;
  userCoords: { latitude: number; longitude: number } | null;
  radiusMeters: number;
  detectingLocation: boolean;
  locationError: string | null;
  setSelectedLocation: (loc: SelectedLocation | null) => void;
  setRadiusMeters: (radius: number) => void;
  requestCurrentLocation: () => Promise<void>;
  clearLocationError: () => void;
}

const LocationContext = createContext<LocationContextValue | undefined>(undefined);

const LAST_LOC_KEY = 'pratikshaiq_last_location_v1';

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [selectedLocation, setSelectedLocationState] = useState<SelectedLocation | null>(() => {
    try {
      const saved = window.localStorage.getItem(LAST_LOC_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as SelectedLocation;
        // Only restore manually selected locations; never pretend browser geolocation permission was already granted
        if (parsed && parsed.source !== 'browser_geolocation') {
          return parsed;
        }
      }
    } catch {
      // Ignore storage error
    }
    return null;
  });

  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(
    null
  );
  const [radiusMeters, setRadiusMeters] = useState<number>(5000);
  const [detectingLocation, setDetectingLocation] = useState<boolean>(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const setSelectedLocation = useCallback((loc: SelectedLocation | null) => {
    setSelectedLocationState(loc);
    setLocationError(null);
    try {
      if (loc && loc.source !== 'browser_geolocation') {
        window.localStorage.setItem(LAST_LOC_KEY, JSON.stringify(loc));
      }
    } catch {
      // Ignore
    }
  }, []);

  const requestCurrentLocation = useCallback(async () => {
    if (!('geolocation' in navigator)) {
      setLocationError('Geolocation is not supported by this browser. Search any Indian city or PIN code manually.');
      return;
    }

    setDetectingLocation(true);
    setLocationError(null);

    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 60000,
        });
      });

      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;

      if (lat < 6.0 || lat > 38.5 || lon < 68.0 || lon > 98.0) {
        setLocationError(
          'Your detected coordinates are outside India. Please select an Indian state, city, or PIN code manually.'
        );
        return;
      }

      setUserCoords({ latitude: lat, longitude: lon });

      try {
        const resolved = await reverseGeocodeIndia(lat, lon);
        const label =
          [resolved.city, resolved.state].filter(Boolean).join(', ') ||
          resolved.display_name.split(',').slice(0, 2).join(', ');
        setSelectedLocationState({
          label,
          latitude: lat,
          longitude: lon,
          city: resolved.city,
          state: resolved.state,
          source: 'browser_geolocation',
        });
      } catch {
        setSelectedLocationState({
          label: `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
          latitude: lat,
          longitude: lon,
          source: 'browser_geolocation',
        });
      }
    } catch (err) {
      const geoErr = err as GeolocationPositionError;
      if (geoErr?.code === 1) {
        setLocationError(
          'Location permission denied. You can search any Indian city, district, locality, or 6-digit PIN code manually.'
        );
      } else {
        setLocationError(
          'Could not detect your current location. Please search your city or PIN code manually.'
        );
      }
    } finally {
      setDetectingLocation(false);
    }
  }, []);

  return (
    <LocationContext.Provider
      value={{
        selectedLocation,
        userCoords,
        radiusMeters,
        detectingLocation,
        locationError,
        setSelectedLocation,
        setRadiusMeters,
        requestCurrentLocation,
        clearLocationError: () => setLocationError(null),
      }}
    >
      {children}
    </LocationContext.Provider>
  );
}

export function useLocationContext(): LocationContextValue {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useLocationContext must be used within LocationProvider');
  return ctx;
}
