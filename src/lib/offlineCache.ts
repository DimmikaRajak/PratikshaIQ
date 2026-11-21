import type { Office } from '../types/domain';

const CACHE_KEY = 'pratikshaiq_osm_discovery_cache_v1';
const OFFICE_INDEX_KEY = 'pratikshaiq_known_offices_v1';

interface CachedDiscoveryBundle {
  key: string;
  fetchedAt: string;
  offices: Office[];
}

/**
 * Stores genuine previously retrieved OpenStreetMap discovery results locally
 * so citizens can still access them if external Overpass servers experience downtime.
 * Never fabricates or seeds fake offices.
 */
export function saveDiscoveryCache(cacheKey: string, offices: Office[]): void {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    const parsed: Record<string, CachedDiscoveryBundle> = raw ? JSON.parse(raw) : {};
    const keys = Object.keys(parsed);
    if (keys.length >= 12) {
      delete parsed[keys[0]];
    }
    parsed[cacheKey] = {
      key: cacheKey,
      fetchedAt: new Date().toISOString(),
      offices,
    };
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(parsed));

    // Also index individual offices by slug & id for resilient Office Details navigation
    const indexRaw = window.localStorage.getItem(OFFICE_INDEX_KEY);
    const indexMap: Record<string, Office> = indexRaw ? JSON.parse(indexRaw) : {};
    for (const office of offices) {
      indexMap[office.id] = office;
      indexMap[office.slug] = office;
    }
    const indexKeys = Object.keys(indexMap);
    if (indexKeys.length > 300) {
      for (const oldKey of indexKeys.slice(0, indexKeys.length - 300)) {
        delete indexMap[oldKey];
      }
    }
    window.localStorage.setItem(OFFICE_INDEX_KEY, JSON.stringify(indexMap));
  } catch {
    // Ignore quota/private-mode storage errors
  }
}

export function readDiscoveryCache(cacheKey: string): CachedDiscoveryBundle | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: Record<string, CachedDiscoveryBundle> = JSON.parse(raw);
    return parsed[cacheKey] ?? null;
  } catch {
    return null;
  }
}

export function readCachedOfficeByIdOrSlug(idOrSlug: string): Office | null {
  try {
    const raw = window.localStorage.getItem(OFFICE_INDEX_KEY);
    if (!raw) return null;
    const map: Record<string, Office> = JSON.parse(raw);
    return map[idOrSlug] ?? null;
  } catch {
    return null;
  }
}

export function readAllCachedOffices(): Office[] {
  try {
    const raw = window.localStorage.getItem(OFFICE_INDEX_KEY);
    if (!raw) return [];
    const map: Record<string, Office> = JSON.parse(raw);
    const uniqueById = new Map<string, Office>();
    for (const office of Object.values(map)) {
      if (office?.id) uniqueById.set(office.id, office);
    }
    return Array.from(uniqueById.values());
  } catch {
    return [];
  }
}
