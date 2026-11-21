import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { CrowdLevel, ConfidenceLevel, OfficeCategory } from '../types/domain.ts';
import { OFFICE_CATEGORIES } from '../types/domain.ts';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Haversine distance in meters between two WGS84 coordinates.
 */
export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export function formatDistance(meters: number | null | undefined): string | null {
  if (meters === null || meters === undefined || Number.isNaN(meters)) return null;
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatRelativeTime(isoDate: string | null | undefined, lang: 'en' | 'hi' = 'en'): string {
  if (!isoDate) return lang === 'hi' ? 'कोई रिपोर्ट नहीं' : 'No reports yet';
  const diffMs = Date.now() - new Date(isoDate).getTime();
  if (Number.isNaN(diffMs)) return '';
  const mins = Math.max(0, Math.floor(diffMs / 60000));
  if (mins < 1) return lang === 'hi' ? 'अभी-अभी' : 'Just now';
  if (mins < 60) return lang === 'hi' ? `${mins} मिनट पहले` : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return lang === 'hi' ? `${hrs} घंटे पहले` : `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return lang === 'hi' ? `${days} दिन पहले` : `${days}d ago`;
}

export function getCategoryLabel(category: OfficeCategory, lang: 'en' | 'hi' = 'en'): string {
  const found = OFFICE_CATEGORIES.find((c) => c.value === category);
  if (!found) return category;
  return lang === 'hi' ? found.labelHi : found.labelEn;
}

export function getCrowdMeta(level: CrowdLevel, lang: 'en' | 'hi' = 'en'): {
  label: string;
  textColor: string;
  dotColor: string;
  borderColor: string;
  bgTint: string;
} {
  switch (level) {
    case 'very_low':
      return {
        label: lang === 'hi' ? 'बहुत कम' : 'Very Low',
        textColor: 'text-emerald-800',
        dotColor: 'bg-emerald-600',
        borderColor: 'border-emerald-200',
        bgTint: 'bg-emerald-50',
      };
    case 'low':
      return {
        label: lang === 'hi' ? 'कम' : 'Low',
        textColor: 'text-green-800',
        dotColor: 'bg-green-600',
        borderColor: 'border-green-200',
        bgTint: 'bg-green-50',
      };
    case 'moderate':
      return {
        label: lang === 'hi' ? 'मध्यम' : 'Moderate',
        textColor: 'text-amber-800',
        dotColor: 'bg-amber-500',
        borderColor: 'border-amber-200',
        bgTint: 'bg-amber-50',
      };
    case 'high':
      return {
        label: lang === 'hi' ? 'अधिक' : 'High',
        textColor: 'text-orange-800',
        dotColor: 'bg-orange-600',
        borderColor: 'border-orange-200',
        bgTint: 'bg-orange-50',
      };
    case 'very_high':
      return {
        label: lang === 'hi' ? 'बहुत अधिक' : 'Very High',
        textColor: 'text-red-800',
        dotColor: 'bg-red-600',
        borderColor: 'border-red-200',
        bgTint: 'bg-red-50',
      };
    default:
      return {
        label: lang === 'hi' ? 'अज्ञात' : 'Unknown',
        textColor: 'text-slate-600',
        dotColor: 'bg-slate-400',
        borderColor: 'border-slate-200',
        bgTint: 'bg-slate-50',
      };
  }
}

export function getConfidenceLabel(level: ConfidenceLevel, lang: 'en' | 'hi' = 'en'): string {
  switch (level) {
    case 'high':
      return lang === 'hi' ? 'उच्च विश्वसनीयता' : 'High confidence';
    case 'medium':
      return lang === 'hi' ? 'मध्यम विश्वसनीयता' : 'Medium confidence';
    case 'low':
      return lang === 'hi' ? 'कम विश्वसनीयता' : 'Low confidence';
    default:
      return lang === 'hi' ? 'डेटा उपलब्ध नहीं' : 'No data';
  }
}

/**
 * Validates external URLs to block javascript:/data: injection vectors.
 */
export function sanitizeExternalUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export function buildDirectionsUrl(lat: number, lon: number, name?: string): string {
  const query = name ? `${lat},${lon} (${name})` : `${lat},${lon}`;
  return `https://www.openstreetmap.org/directions?from=&to=${encodeURIComponent(`${lat},${lon}`)}#map=16/${lat}/${lon}&name=${encodeURIComponent(query)}`;
}

export function buildGoogleMapsDirectionsUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lon}`)}`;
}

export function slugifyOffice(name: string, suffix: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${base || 'office'}-${suffix}`;
}
