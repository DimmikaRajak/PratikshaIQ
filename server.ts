import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildOverpassQuery, mapOverpassElementToOffice } from './src/lib/osmMapper.ts';
import type { OverpassElement } from './src/lib/osmMapper.ts';
import {
  OFFICE_COLUMN_ALIASES,
  OPTIONAL_OFFICE_COLUMNS,
  OPTIONAL_QUEUE_REPORT_COLUMNS,
  OPTIONAL_REPORT_FLAG_COLUMNS,
  OPTIONAL_SUGGESTION_COLUMNS,
  QUEUE_REPORT_COLUMN_ALIASES,
  REPORT_FLAG_COLUMN_ALIASES,
  SUGGESTION_COLUMN_ALIASES,
  runBatchWriteWithColumnFallback,
  runSingleWriteWithColumnFallback,
} from './src/lib/schemaFallback.ts';
import type { Office } from './src/types/domain.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const distPath = path.resolve(__dirname, 'dist');
const hasDistBuild = fs.existsSync(path.join(distPath, 'index.html'));
const isDevLifecycle =
  process.env.npm_lifecycle_event === 'dev' || process.env.NODE_ENV === 'development';
const IS_PROD =
  process.env.NODE_ENV === 'production' || (!isDevLifecycle && hasDistBuild);

const OSM_USER_AGENT = process.env.OSM_CONTACT_EMAIL
  ? `PratikshaIQ/1.0 (${process.env.OSM_CONTACT_EMAIL})`
  : 'PratikshaIQ/1.0 (Pan-India Civic Queue Intelligence Platform)';

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

// Optional Supabase Admin Client (strictly server-side, never exposed to browser)
const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

const supabaseAdmin: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

// Simple bounded in-memory TTL cache to protect public OSM infrastructure
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class BoundedTtlCache<T> {
  private store = new Map<string, CacheEntry<T>>();
  private maxEntries: number;

  constructor(maxEntries = 300) {
    this.maxEntries = maxEntries;
  }

  get(key: string): T | null {
    const hit = this.store.get(key);
    if (!hit) return null;
    if (Date.now() > hit.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return hit.value;
  }

  set(key: string, value: T, ttlMs: number): void {
    if (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey) this.store.delete(oldestKey);
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }
}

const geocodeCache = new BoundedTtlCache<unknown>(400);
const discoveryCache = new BoundedTtlCache<Office[]>(300);

// Per-IP sliding window rate limiter
const rateBuckets = new Map<string, number[]>();
function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const timestamps = (rateBuckets.get(key) || []).filter((t) => now - t < windowMs);
  if (timestamps.length >= maxRequests) {
    rateBuckets.set(key, timestamps);
    return false;
  }
  timestamps.push(now);
  rateBuckets.set(key, timestamps);
  return true;
}

async function logApiErrorToSupabase(
  service: string,
  endpoint: string,
  errorMessage: string,
  statusCode?: number
): Promise<void> {
  if (!supabaseAdmin) return;
  try {
    await supabaseAdmin.from('api_error_logs').insert({
      service,
      endpoint,
      error_message: errorMessage.slice(0, 500),
      status_code: statusCode ?? null,
    });
  } catch {
    // Non-blocking error telemetry
  }
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = 15000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function persistDiscoveredOfficesToSupabase(offices: Office[]): Promise<Office[]> {
  if (!supabaseAdmin || offices.length === 0) return offices;

  const osmOffices = offices.filter((o) => o.source === 'osm' && o.osm_type && o.osm_id);
  if (osmOffices.length === 0) return offices;

  try {
    const client = supabaseAdmin;
    const osmIds = osmOffices.map((o) => o.osm_id as number);
    const slugs = osmOffices.map((o) => o.slug);

    const payload: Record<string, unknown>[] = osmOffices.map((o) => {
      const safeState = o.state?.trim() || 'India';
      const safeCity = o.city?.trim() || o.district?.trim() || safeState;
      const safeAddress =
        o.address?.trim() ||
        [o.city, o.district, safeState].filter(Boolean).join(', ') ||
        o.name;

      return {
        name: o.name,
        slug: o.slug,
        category: o.category,
        address: safeAddress,
        city: safeCity,
        district: o.district,
        state: safeState,
        postal_code: o.postal_code,
        latitude: o.latitude,
        longitude: o.longitude,
        source: 'osm',
        osm_type: o.osm_type,
        osm_id: o.osm_id,
        official_website: o.official_website,
        phone: o.phone,
        verification_status: 'approved',
      };
    });

    // Upsert by unique slug (non-partial constraint) and gracefully alias/drop any
    // columns missing from an older Supabase schema cache (e.g. `district`, `latitude`).
    const upsertRes = await runBatchWriteWithColumnFallback(
      payload,
      OPTIONAL_OFFICE_COLUMNS,
      (rows) => {
        const hasSlug = rows.length > 0 && 'slug' in rows[0];
        if (hasSlug) {
          return client
            .from('offices')
            .upsert(rows, { onConflict: 'slug', ignoreDuplicates: true });
        }
        return client.from('offices').insert(rows);
      },
      OFFICE_COLUMN_ALIASES
    );

    // If `slug` exists but doesn't have a unique constraint on a legacy table (PG 42P10),
    // fall back to inserting only offices whose name does not already exist.
    if (upsertRes.error && upsertRes.error.code === '42P10') {
      const names = osmOffices.map((o) => o.name);
      const { data: existingByName } = await client
        .from('offices')
        .select('name')
        .in('name', names);
      const existingNames = new Set(
        (existingByName || []).map((r) => String((r as Record<string, unknown>).name || '').toLowerCase())
      );
      const freshRows = payload.filter(
        (row) => !existingNames.has(String(row.name || '').toLowerCase())
      );
      if (freshRows.length > 0) {
        await runBatchWriteWithColumnFallback(
          freshRows,
          OPTIONAL_OFFICE_COLUMNS,
          (rows) => client.from('offices').insert(rows),
          OFFICE_COLUMN_ALIASES
        );
      }
    } else if (upsertRes.error) {
      await logApiErrorToSupabase(
        'supabase',
        'persistDiscoveredOffices',
        upsertRes.error.message
      );
    }

    // Fetch canonical UUIDs + real aggregates from Supabase
    const names = osmOffices.map((o) => o.name);
    let dbRows: Record<string, unknown>[] | null = null;

    const byOsmRes = await client
      .from('offices')
      .select('*, office_aggregates(*)')
      .eq('source', 'osm')
      .in('osm_id', osmIds);
    if (!byOsmRes.error && byOsmRes.data && byOsmRes.data.length > 0) {
      dbRows = byOsmRes.data as Record<string, unknown>[];
    }

    if (!dbRows || dbRows.length === 0) {
      const bySlugRes = await client
        .from('offices')
        .select('*, office_aggregates(*)')
        .in('slug', slugs);
      if (!bySlugRes.error && bySlugRes.data && bySlugRes.data.length > 0) {
        dbRows = bySlugRes.data as Record<string, unknown>[];
      }
    }

    if (!dbRows || dbRows.length === 0) {
      const byNameRes = await client
        .from('offices')
        .select('*')
        .in('name', names);
      if (!byNameRes.error && byNameRes.data && byNameRes.data.length > 0) {
        dbRows = byNameRes.data as Record<string, unknown>[];
      }
    }

    if (!dbRows || dbRows.length === 0) return offices;

    const byOsmKey = new Map<string, Record<string, unknown>>();
    const bySlug = new Map<string, Record<string, unknown>>();
    const byName = new Map<string, Record<string, unknown>>();
    for (const row of dbRows) {
      if (row.osm_type && row.osm_id) {
        byOsmKey.set(`${row.osm_type}-${row.osm_id}`, row);
      }
      if (row.slug) {
        bySlug.set(String(row.slug), row);
      }
      if (row.name) {
        byName.set(String(row.name).toLowerCase(), row);
      }
    }

    return offices.map((o) => {
      const matched =
        byOsmKey.get(`${o.osm_type}-${o.osm_id}`) ||
        bySlug.get(o.slug) ||
        byName.get(o.name.toLowerCase());
      if (!matched) return o;
      const aggRaw = Array.isArray(matched.office_aggregates)
        ? matched.office_aggregates[0]
        : matched.office_aggregates;
      return {
        ...o,
        id: String(matched.id),
        slug: String(matched.slug || o.slug),
        aggregate: aggRaw ? (aggRaw as Office['aggregate']) : null,
      };
    });
  } catch (err) {
    await logApiErrorToSupabase(
      'supabase',
      'persistDiscoveredOffices',
      err instanceof Error ? err.message : 'Upsert error'
    );
    return offices;
  }
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '256kb' }));

  // 1. Health & configuration inspection endpoint (exposes booleans only, never keys)
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      integrations: {
        supabaseClientConfigured: Boolean(
          process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY
        ),
        supabaseServiceRoleConfigured: Boolean(supabaseAdmin),
        geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
        openStreetMapEnabled: true,
      },
    });
  });

  // 2. Pan-India Geocoding Search via Real Nominatim API (cities, districts, localities, PIN codes)
  const searchSchema = z.object({
    q: z.string().trim().min(2).max(120),
    state: z.string().trim().max(80).optional(),
  });

  app.get('/api/location/search', async (req, res) => {
    const clientIp = req.ip || 'unknown';
    if (!checkRateLimit(`geo:${clientIp}`, 25, 60_000)) {
      res.status(429).json({ error: 'Too many location searches. Please pause briefly.' });
      return;
    }

    const parsed = searchSchema.safeParse({
      q: typeof req.query.q === 'string' ? req.query.q : '',
      state: typeof req.query.state === 'string' ? req.query.state : undefined,
    });

    if (!parsed.success) {
      res.status(400).json({ error: 'Please enter at least 2 characters to search.' });
      return;
    }

    const { q, state } = parsed.data;
    const queryText = state ? `${q}, ${state}, India` : `${q}, India`;
    const cacheKey = `search:${queryText.toLowerCase()}`;
    const cached = geocodeCache.get(cacheKey);
    if (cached) {
      res.json({ results: cached, cached: true });
      return;
    }

    try {
      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.searchParams.set('q', queryText);
      url.searchParams.set('countrycodes', 'in');
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('addressdetails', '1');
      url.searchParams.set('limit', '8');

      const upstream = await fetchWithTimeout(
        url.toString(),
        {
          headers: {
            'User-Agent': OSM_USER_AGENT,
            'Accept-Language': 'en-IN,en;q=0.9',
          },
        },
        10_000
      );

      if (!upstream.ok) {
        await logApiErrorToSupabase(
          'nominatim',
          '/api/location/search',
          `Nominatim returned HTTP ${upstream.status}`,
          upstream.status
        );
        res.status(502).json({
          error: 'Location search service is temporarily busy. Try selecting a state and city below.',
        });
        return;
      }

      const raw = (await upstream.json()) as Array<Record<string, unknown>>;
      const results = raw.map((item) => {
        const addr = (item.address as Record<string, string> | undefined) || {};
        return {
          display_name: String(item.display_name || ''),
          latitude: Number(item.lat),
          longitude: Number(item.lon),
          city: addr.city || addr.town || addr.village || addr.county || undefined,
          district: addr.state_district || addr.county || undefined,
          state: addr.state || undefined,
          postal_code: addr.postcode || undefined,
          osm_id: item.osm_id ? Number(item.osm_id) : undefined,
          osm_type: item.osm_type ? String(item.osm_type) : undefined,
        };
      });

      geocodeCache.set(cacheKey, results, 15 * 60 * 1000);
      res.json({ results, cached: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error';
      await logApiErrorToSupabase('nominatim', '/api/location/search', message);
      res.status(503).json({
        error: 'Unable to reach OpenStreetMap Nominatim service right now.',
      });
    }
  });

  // 3. Reverse Geocoding via Real Nominatim API (called only after browser geolocation consent)
  const reverseSchema = z.object({
    lat: z.coerce.number().min(6.0).max(38.5),
    lon: z.coerce.number().min(68.0).max(98.0),
  });

  app.get('/api/location/reverse', async (req, res) => {
    const clientIp = req.ip || 'unknown';
    if (!checkRateLimit(`rev:${clientIp}`, 15, 60_000)) {
      res.status(429).json({ error: 'Rate limit exceeded for reverse geocoding.' });
      return;
    }

    const parsed = reverseSchema.safeParse({ lat: req.query.lat, lon: req.query.lon });
    if (!parsed.success) {
      res.status(400).json({
        error: 'Coordinates are outside India or invalid. Please search an Indian location manually.',
      });
      return;
    }

    const { lat, lon } = parsed.data;
    const cacheKey = `rev:${lat.toFixed(3)},${lon.toFixed(3)}`;
    const cached = geocodeCache.get(cacheKey);
    if (cached) {
      res.json({ location: cached, cached: true });
      return;
    }

    try {
      const url = new URL('https://nominatim.openstreetmap.org/reverse');
      url.searchParams.set('lat', String(lat));
      url.searchParams.set('lon', String(lon));
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('addressdetails', '1');

      const upstream = await fetchWithTimeout(
        url.toString(),
        {
          headers: {
            'User-Agent': OSM_USER_AGENT,
            'Accept-Language': 'en-IN,en;q=0.9',
          },
        },
        10_000
      );

      if (!upstream.ok) {
        res.status(502).json({ error: 'Reverse geocoding temporarily unavailable.' });
        return;
      }

      const item = (await upstream.json()) as Record<string, unknown>;
      const addr = (item.address as Record<string, string> | undefined) || {};
      const location = {
        display_name: String(item.display_name || `${lat.toFixed(4)}, ${lon.toFixed(4)}`),
        latitude: lat,
        longitude: lon,
        city: addr.city || addr.town || addr.village || addr.suburb || undefined,
        district: addr.state_district || addr.county || undefined,
        state: addr.state || undefined,
        postal_code: addr.postcode || undefined,
      };

      geocodeCache.set(cacheKey, location, 30 * 60 * 1000);
      res.json({ location, cached: false });
    } catch {
      res.status(503).json({ error: 'Unable to resolve address for coordinates right now.' });
    }
  });

  // 4. Real OpenStreetMap Overpass Discovery + Supabase Merge
  const discoverSchema = z.object({
    lat: z.coerce.number().min(6.0).max(38.5),
    lon: z.coerce.number().min(68.0).max(98.0),
    radius: z.coerce.number().min(500).max(25000).default(5000),
    category: z.string().trim().max(40).optional(),
    state: z.string().trim().max(80).optional(),
    city: z.string().trim().max(80).optional(),
  });

  app.get('/api/offices/discover', async (req, res) => {
    const clientIp = req.ip || 'unknown';
    if (!checkRateLimit(`discover:${clientIp}`, 20, 60_000)) {
      res.status(429).json({
        error: 'Discovery rate limit reached. Please wait a moment before searching again.',
      });
      return;
    }

    const parsed = discoverSchema.safeParse({
      lat: req.query.lat,
      lon: req.query.lon,
      radius: req.query.radius ?? 5000,
      category: typeof req.query.category === 'string' ? req.query.category : undefined,
      state: typeof req.query.state === 'string' ? req.query.state : undefined,
      city: typeof req.query.city === 'string' ? req.query.city : undefined,
    });

    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid coordinates or search radius for India.' });
      return;
    }

    const { lat, lon, radius, category, state, city } = parsed.data;
    // Grid-round cache key (~1 km) to responsibly minimize Overpass load
    const gridKey = `osm:${lat.toFixed(2)}:${lon.toFixed(2)}:${Math.round(radius / 500) * 500}:${category || 'all'}`;
    const cached = discoveryCache.get(gridKey);

    let offices: Office[] | null = cached;
    let fromCache = Boolean(cached);
    let lastError = '';

    if (!offices) {
      const ql = buildOverpassQuery(lat, lon, radius, category);

      try {
        const payload = await Promise.any(
          OVERPASS_ENDPOINTS.map(async (endpoint) => {
            const upstream = await fetchWithTimeout(
              endpoint,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                  'User-Agent': OSM_USER_AGENT,
                },
                body: `data=${encodeURIComponent(ql)}`,
              },
              6_500
            );
            if (!upstream.ok) {
              throw new Error(
                `Overpass mirror (${new URL(endpoint).hostname}) returned HTTP ${upstream.status}`
              );
            }
            return (await upstream.json()) as { elements?: OverpassElement[] };
          })
        );

        const elements = payload.elements || [];
        const seen = new Set<string>();
        const mapped: Office[] = [];
        for (const el of elements) {
          const key = `${el.type}-${el.id}`;
          if (seen.has(key)) continue;
          seen.add(key);

          const office = mapOverpassElementToOffice(
            el,
            lat,
            lon,
            state || 'India',
            city || null
          );
          if (!office) continue;
          if (category && category !== 'all' && office.category !== category) {
            continue;
          }
          mapped.push(office);
        }

        mapped.sort((a, b) => (a.distance_meters ?? 0) - (b.distance_meters ?? 0));
        offices = await persistDiscoveredOfficesToSupabase(mapped);
        discoveryCache.set(gridKey, offices, 20 * 60 * 1000);
        fromCache = false;
      } catch (err) {
        lastError = err instanceof Error ? err.message : 'Overpass mirrors timed out';
        await logApiErrorToSupabase('overpass', 'concurrent_mirrors', lastError);
      }
    }

    // Real OpenStreetMap Nominatim bounded-box fallback if Overpass mirrors are congested
    if (!offices) {
      try {
        const latDelta = Math.min(0.22, Math.max(0.025, radius / 111_000));
        const lonDelta = latDelta / Math.max(0.3, Math.cos((lat * Math.PI) / 180));
        const viewbox = `${(lon - lonDelta).toFixed(4)},${(lat + latDelta).toFixed(4)},${(lon + lonDelta).toFixed(4)},${(lat - latDelta).toFixed(4)}`;

        const categoryTerms: Record<string, string[]> = {
          all: ['post office', 'police station', 'government office', 'municipal'],
          post_office: ['post office'],
          police_station: ['police station'],
          court: ['court'],
          government_hospital: ['government hospital'],
          municipal_corporation: ['municipal corporation'],
          municipal_council: ['municipal council'],
          gram_panchayat: ['gram panchayat'],
          district_collector: ['collector office'],
          tehsil_office: ['tehsil office'],
          sub_registrar: ['sub registrar'],
          rto_office: ['RTO office'],
          service_centre: ['seva kendra'],
          government_office: ['government office'],
          other_public_office: ['government office'],
        };

        const queries = categoryTerms[category || 'all'] || categoryTerms.all;
        const nomResults: Office[] = [];
        const seenOsm = new Set<string>();

        for (const term of queries.slice(0, 3)) {
          const url = new URL('https://nominatim.openstreetmap.org/search');
          url.searchParams.set('q', term);
          url.searchParams.set('countrycodes', 'in');
          url.searchParams.set('viewbox', viewbox);
          url.searchParams.set('bounded', '1');
          url.searchParams.set('format', 'jsonv2');
          url.searchParams.set('addressdetails', '1');
          url.searchParams.set('extratags', '1');
          url.searchParams.set('limit', '12');

          const nomRes = await fetchWithTimeout(
            url.toString(),
            { headers: { 'User-Agent': OSM_USER_AGENT, 'Accept-Language': 'en-IN,en;q=0.9' } },
            8000
          );
          if (!nomRes.ok) continue;

          const items = (await nomRes.json()) as Array<Record<string, unknown>>;
          for (const item of items) {
            const osmType =
              item.osm_type === 'node' || item.osm_type === 'way' || item.osm_type === 'relation'
                ? item.osm_type
                : 'node';
            const osmId = Number(item.osm_id || 0);
            if (!osmId) continue;
            const key = `${osmType}-${osmId}`;
            if (seenOsm.has(key)) continue;
            seenOsm.add(key);

            const addr = (item.address as Record<string, string> | undefined) || {};
            const extra = (item.extratags as Record<string, string> | undefined) || {};
            const itemName = String(item.name || '').trim() || String(item.display_name || '').split(',')[0].trim();

            const mappedOffice = mapOverpassElementToOffice(
              {
                type: osmType,
                id: osmId,
                lat: Number(item.lat),
                lon: Number(item.lon),
                tags: {
                  ...extra,
                  name: itemName,
                  amenity: String(item.type || ''),
                  'addr:full': String(item.display_name || ''),
                  'addr:city': addr.city || addr.town || addr.village || '',
                  'addr:district': addr.state_district || addr.county || '',
                  'addr:state': addr.state || state || 'India',
                  'addr:postcode': addr.postcode || '',
                },
              },
              lat,
              lon,
              state || 'India',
              city || null
            );

            if (mappedOffice) {
              nomResults.push(mappedOffice);
            }
          }
        }

        if (nomResults.length > 0) {
          nomResults.sort((a, b) => (a.distance_meters ?? 0) - (b.distance_meters ?? 0));
          offices = await persistDiscoveredOfficesToSupabase(nomResults);
          discoveryCache.set(gridKey, offices, 20 * 60 * 1000);
          fromCache = false;
        }
      } catch (nomErr) {
        await logApiErrorToSupabase(
          'nominatim_fallback',
          '/api/offices/discover',
          nomErr instanceof Error ? nomErr.message : 'Fallback failed'
        );
      }
    }

    if (!offices) {
      // Fallback: if Supabase is configured, still serve previously stored approved offices in radius
      if (supabaseAdmin) {
        const { data: fallbackRows } = await supabaseAdmin.rpc('find_nearby_offices', {
          p_lat: lat,
          p_lon: lon,
          p_radius_meters: radius,
          p_category: category && category !== 'all' ? category : null,
          p_limit: 60,
        });

        if (fallbackRows && fallbackRows.length > 0) {
          const fallbackOffices: Office[] = fallbackRows.map((row: Record<string, unknown>) => ({
            id: String(row.id),
            name: String(row.name),
            slug: String(row.slug),
            category: row.category as Office['category'],
            address: (row.address as string) || null,
            city: (row.city as string) || null,
            district: (row.district as string) || null,
            state: String(row.state),
            postal_code: (row.postal_code as string) || null,
            latitude: Number(row.latitude),
            longitude: Number(row.longitude),
            source: row.source as Office['source'],
            osm_type: (row.osm_type as Office['osm_type']) || null,
            osm_id: row.osm_id ? Number(row.osm_id) : null,
            official_website: (row.official_website as string) || null,
            phone: (row.phone as string) || null,
            verification_status: 'approved',
            distance_meters: Number(row.distance_meters),
            aggregate:
              Number(row.recent_report_count || 0) > 0
                ? {
                    office_id: String(row.id),
                    current_crowd_level: row.current_crowd_level as Office['aggregate'] extends infer A
                      ? A extends { current_crowd_level: infer C }
                        ? C
                        : never
                      : never,
                    estimated_waiting_minutes:
                      row.estimated_waiting_minutes !== null
                        ? Number(row.estimated_waiting_minutes)
                        : null,
                    average_queue_size:
                      row.average_queue_size !== null ? Number(row.average_queue_size) : null,
                    confidence_level: row.confidence_level as 'high' | 'medium' | 'low' | 'no_data',
                    recent_report_count: Number(row.recent_report_count),
                    last_report_at: (row.last_report_at as string) || null,
                    calculated_at: new Date().toISOString(),
                  }
                : null,
          }));
          res.json({
            offices: fallbackOffices,
            cached: true,
            sourceNote:
              'External OpenStreetMap Overpass mirrors are currently busy; showing previously stored offices from database.',
          });
          return;
        }
      }

      res.status(503).json({
        error:
          'OpenStreetMap discovery servers are temporarily busy or unreachable. Please retry in a few seconds.',
        details: lastError,
      });
      return;
    }

    // Also merge approved citizen-suggested offices from Supabase within this radius if available
    let mergedOffices = [...offices];
    if (supabaseAdmin) {
      try {
        const { data: dbNearby } = await supabaseAdmin.rpc('find_nearby_offices', {
          p_lat: lat,
          p_lon: lon,
          p_radius_meters: radius,
          p_category: category && category !== 'all' ? category : null,
          p_limit: 60,
        });

        if (dbNearby && Array.isArray(dbNearby)) {
          const existingIds = new Set(mergedOffices.map((o) => o.id));
          const existingOsmKeys = new Set(
            mergedOffices.filter((o) => o.osm_id).map((o) => `${o.osm_type}-${o.osm_id}`)
          );

          for (const row of dbNearby as Record<string, unknown>[]) {
            const id = String(row.id);
            const osmKey = row.osm_id ? `${row.osm_type}-${row.osm_id}` : null;
            if (existingIds.has(id) || (osmKey && existingOsmKeys.has(osmKey))) continue;

            mergedOffices.push({
              id,
              name: String(row.name),
              slug: String(row.slug),
              category: row.category as Office['category'],
              address: (row.address as string) || null,
              city: (row.city as string) || null,
              district: (row.district as string) || null,
              state: String(row.state),
              postal_code: (row.postal_code as string) || null,
              latitude: Number(row.latitude),
              longitude: Number(row.longitude),
              source: row.source as Office['source'],
              osm_type: (row.osm_type as Office['osm_type']) || null,
              osm_id: row.osm_id ? Number(row.osm_id) : null,
              official_website: (row.official_website as string) || null,
              phone: (row.phone as string) || null,
              verification_status: 'approved',
              distance_meters: Number(row.distance_meters),
              aggregate:
                Number(row.recent_report_count || 0) > 0
                  ? {
                      office_id: id,
                      current_crowd_level: row.current_crowd_level as 'very_low' | 'low' | 'moderate' | 'high' | 'very_high' | 'unknown',
                      estimated_waiting_minutes:
                        row.estimated_waiting_minutes !== null
                          ? Number(row.estimated_waiting_minutes)
                          : null,
                      average_queue_size:
                        row.average_queue_size !== null ? Number(row.average_queue_size) : null,
                      confidence_level: row.confidence_level as 'high' | 'medium' | 'low' | 'no_data',
                      recent_report_count: Number(row.recent_report_count),
                      last_report_at: (row.last_report_at as string) || null,
                      calculated_at: new Date().toISOString(),
                    }
                  : null,
            });
          }

          mergedOffices.sort((a, b) => (a.distance_meters ?? 0) - (b.distance_meters ?? 0));
        }
      } catch {
        // Ignore merge errors; still return genuine OSM results
      }
    }

    res.json({
      offices: mergedOffices,
      cached: fromCache,
      fetchedAt: new Date().toISOString(),
      attribution: 'Map data © OpenStreetMap contributors',
    });
  });

  // 5. Ensure an OSM-discovered office exists in Supabase before reporting (requires verified user JWT)
  const ensureOfficeSchema = z.object({
    name: z.string().trim().min(2).max(200),
    slug: z.string().trim().min(2).max(160),
    category: z.string().trim().min(2).max(50),
    address: z.string().max(400).nullable().optional(),
    city: z.string().max(120).nullable().optional(),
    district: z.string().max(120).nullable().optional(),
    state: z.string().trim().min(2).max(100),
    postal_code: z.string().regex(/^[1-9][0-9]{5}$/).nullable().optional(),
    latitude: z.number().min(6.0).max(38.5),
    longitude: z.number().min(68.0).max(98.0),
    source: z.literal('osm'),
    osm_type: z.enum(['node', 'way', 'relation']),
    osm_id: z.number().int().positive(),
    official_website: z.string().url().nullable().optional(),
    phone: z.string().max(40).nullable().optional(),
  });

  app.post('/api/offices/ensure-osm', async (req, res) => {
    if (!supabaseAdmin) {
      res.status(503).json({
        error:
          'Server-side Supabase service role key is not configured. Add SUPABASE_SERVICE_ROLE_KEY to your server environment.',
      });
      return;
    }

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const { data: userData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !userData?.user) {
      res.status(401).json({ error: 'Invalid or expired session token.' });
      return;
    }

    const parsed = ensureOfficeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid OpenStreetMap office payload.' });
      return;
    }

    const body = parsed.data;
    const client = supabaseAdmin;

    const toOfficeRef = (row: Record<string, unknown> | null) =>
      row && row.id
        ? { id: String(row.id), slug: String(row.slug || body.slug) }
        : null;

    const findExistingOffice = async () => {
      const byOsm = await client
        .from('offices')
        .select('*')
        .eq('source', 'osm')
        .eq('osm_type', body.osm_type)
        .eq('osm_id', body.osm_id)
        .maybeSingle();

      if (!byOsm.error && byOsm.data) return toOfficeRef(byOsm.data as Record<string, unknown>);

      const bySlug = await client
        .from('offices')
        .select('*')
        .eq('slug', body.slug)
        .maybeSingle();

      if (!bySlug.error && bySlug.data) return toOfficeRef(bySlug.data as Record<string, unknown>);

      const byName = await client
        .from('offices')
        .select('*')
        .eq('name', body.name)
        .limit(1)
        .maybeSingle();

      if (!byName.error && byName.data) return toOfficeRef(byName.data as Record<string, unknown>);

      return null;
    };

    const existing = await findExistingOffice();
    if (existing) {
      res.json({ office: existing });
      return;
    }

    const safeState = body.state?.trim() || 'India';
    const safeCity = body.city?.trim() || body.district?.trim() || safeState;
    const safeAddress =
      body.address?.trim() ||
      [body.city, body.district, safeState].filter(Boolean).join(', ') ||
      body.name;

    const insertPayload: Record<string, unknown> = {
      name: body.name,
      slug: body.slug,
      category: body.category,
      address: safeAddress,
      city: safeCity,
      district: body.district ?? null,
      state: safeState,
      postal_code: body.postal_code ?? null,
      latitude: body.latitude,
      longitude: body.longitude,
      source: 'osm',
      osm_type: body.osm_type,
      osm_id: body.osm_id,
      official_website: body.official_website ?? null,
      phone: body.phone ?? null,
      verification_status: 'approved',
    };

    const { data: inserted, error: insertErr } = await runSingleWriteWithColumnFallback<
      Record<string, unknown>
    >(
      insertPayload,
      OPTIONAL_OFFICE_COLUMNS,
      (row) => client.from('offices').insert(row).select('*').single(),
      OFFICE_COLUMN_ALIASES
    );

    if (insertErr || !inserted) {
      // Handle race condition where another request inserted the same office concurrently
      if (insertErr?.code === '23505') {
        const raced = await findExistingOffice();
        if (raced) {
          res.json({ office: raced });
          return;
        }
      }
      res.status(500).json({ error: insertErr?.message || 'Failed to save office.' });
      return;
    }

    res.json({ office: toOfficeRef(inserted) });
  });

  // 5b. Authenticated Queue Report Submission Fallback (handles legacy queue_reports schemas & RLS safely)
  const submitReportSchema = z.object({
    office_id: z
      .union([z.string().trim().min(1).max(128), z.number().int().positive()])
      .transform((v) => String(v)),
    queue_size_min: z.number().int().min(0).max(500),
    queue_size_max: z.number().int().min(0).max(1000),
    waiting_time_min: z.number().int().min(0).max(600),
    waiting_time_max: z.number().int().min(0).max(720),
    crowd_level: z.enum(['very_low', 'low', 'moderate', 'high', 'very_high']),
    note: z.string().max(500).nullable().optional(),
  });

  app.post('/api/reports/submit', async (req, res) => {
    if (!supabaseAdmin) {
      res.status(503).json({
        error: 'Server-side Supabase service role key is not configured.',
      });
      return;
    }

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const { data: userData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !userData?.user) {
      res.status(401).json({ error: 'Invalid or expired session token.' });
      return;
    }

    const parsed = submitReportSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid queue report payload.' });
      return;
    }

    const userId = userData.user.id;
    const body = parsed.data;
    const client = supabaseAdmin;

    if (!checkRateLimit(`report:${userId}`, 8, 60 * 60 * 1000)) {
      res.status(429).json({ error: 'Hourly submission limit reached. Please try again later.' });
      return;
    }

    const waitMid = Math.round((body.waiting_time_min + body.waiting_time_max) / 2);
    const queueMid = Math.round((body.queue_size_min + body.queue_size_max) / 2);

    const reportPayload: Record<string, unknown> = {
      office_id: body.office_id,
      user_id: userId,
      queue_size_min: body.queue_size_min,
      queue_size_max: body.queue_size_max,
      waiting_time_min: body.waiting_time_min,
      waiting_time_max: body.waiting_time_max,
      crowd_level: body.crowd_level,
      report_status: 'active',
      note: body.note?.trim() || null,
    };

    const { data: inserted, error: insertErr } = await runSingleWriteWithColumnFallback<
      Record<string, unknown>
    >(
      reportPayload,
      OPTIONAL_QUEUE_REPORT_COLUMNS,
      (row) => client.from('queue_reports').insert(row).select('*').single(),
      QUEUE_REPORT_COLUMN_ALIASES,
      (_row, col) => {
        if (
          ['user_id', 'reported_by', 'submitted_by', 'created_by', 'reporter_id', 'author_id', 'profile_id'].includes(
            col
          )
        ) {
          return userId;
        }
        if (['waiting_time', 'wait_time', 'estimated_wait_minutes', 'wait_minutes'].includes(col)) {
          return waitMid;
        }
        if (['queue_size', 'queue_length', 'people_count', 'queue_count'].includes(col)) {
          return queueMid;
        }
        if (['crowd_level', 'crowd_status'].includes(col)) return body.crowd_level;
        if (col === 'report_status') return 'active';
        return undefined;
      }
    );

    if (insertErr || !inserted) {
      res.status(500).json({ error: insertErr?.message || 'Could not submit queue report.' });
      return;
    }

    // Best-effort recalculate aggregates in case DB trigger is not installed yet
    try {
      await client.rpc('recalculate_office_aggregate', { p_office_id: body.office_id });
    } catch {
      // Non-fatal if RPC is absent
    }

    res.json({ reportId: String(inserted.id) });
  });

  // 5c. Authenticated Office Suggestion Fallback (handles legacy office_suggestions schemas & RLS safely)
  const submitSuggestionSchema = z.object({
    office_name: z.string().trim().min(2).max(160),
    category: z.string().trim().min(2).max(60),
    address: z.string().trim().min(2).max(300),
    city: z.string().trim().min(1).max(100),
    district: z.string().trim().max(100).nullable().optional(),
    state: z.string().trim().min(2).max(100),
    postal_code: z.string().trim().max(12).nullable().optional(),
    latitude: z.number().min(6.0).max(38.5),
    longitude: z.number().min(68.0).max(98.0),
    official_website: z.string().trim().max(300).nullable().optional(),
    phone: z.string().trim().max(40).nullable().optional(),
  });

  app.post('/api/suggestions/submit', async (req, res) => {
    if (!supabaseAdmin) {
      res.status(503).json({ error: 'Server-side Supabase service role key is not configured.' });
      return;
    }

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const { data: userData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !userData?.user) {
      res.status(401).json({ error: 'Invalid or expired session token.' });
      return;
    }

    const parsed = submitSuggestionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid office suggestion payload.' });
      return;
    }

    const userId = userData.user.id;
    if (!checkRateLimit(`suggest:${userId}`, 10, 60 * 60 * 1000)) {
      res.status(429).json({ error: 'Too many suggestions submitted. Please try again later.' });
      return;
    }

    const body = parsed.data;
    const client = supabaseAdmin;
    const suggestionPayload: Record<string, unknown> = {
      suggested_by: userId,
      office_name: body.office_name,
      category: body.category,
      address: body.address,
      city: body.city,
      district: body.district || null,
      state: body.state,
      postal_code: body.postal_code || null,
      latitude: body.latitude,
      longitude: body.longitude,
      official_website: body.official_website || null,
      phone: body.phone || null,
      review_status: 'pending',
    };

    const { data: inserted, error: insertErr } = await runSingleWriteWithColumnFallback<
      Record<string, unknown>
    >(
      suggestionPayload,
      OPTIONAL_SUGGESTION_COLUMNS,
      (row) => client.from('office_suggestions').insert(row).select('*').single(),
      SUGGESTION_COLUMN_ALIASES,
      (_row, col) => {
        if (['suggested_by', 'user_id'].includes(col)) return userId;
        if (['office_name', 'name'].includes(col)) return body.office_name;
        if (['review_status', 'status'].includes(col)) return 'pending';
        return undefined;
      }
    );

    if (insertErr || !inserted) {
      res.status(500).json({ error: insertErr?.message || 'Could not submit office suggestion.' });
      return;
    }

    res.json({ suggestion: inserted });
  });

  // 5d. Authenticated Report Flag Fallback (handles legacy report_flags schemas & RLS safely)
  const submitFlagSchema = z.object({
    report_id: z
      .union([z.string().trim().min(1).max(128), z.number().int().positive()])
      .transform((v) => String(v)),
    reason: z.string().trim().min(5).max(500),
  });

  app.post('/api/flags/submit', async (req, res) => {
    if (!supabaseAdmin) {
      res.status(503).json({ error: 'Server-side Supabase service role key is not configured.' });
      return;
    }

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const { data: userData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !userData?.user) {
      res.status(401).json({ error: 'Invalid or expired session token.' });
      return;
    }

    const parsed = submitFlagSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Please provide a clear reason (at least 5 characters).' });
      return;
    }

    const userId = userData.user.id;
    if (!checkRateLimit(`flag:${userId}`, 15, 60 * 60 * 1000)) {
      res.status(429).json({ error: 'Too many flags submitted. Please try again later.' });
      return;
    }

    const body = parsed.data;
    const client = supabaseAdmin;

    const { error: insertErr } = await runSingleWriteWithColumnFallback(
      {
        report_id: body.report_id,
        reported_by: userId,
        reason: body.reason,
        status: 'open',
      },
      OPTIONAL_REPORT_FLAG_COLUMNS,
      (row) => client.from('report_flags').insert(row),
      REPORT_FLAG_COLUMN_ALIASES,
      (_row, col) => {
        if (['reported_by', 'user_id'].includes(col)) return userId;
        if (['reason', 'note'].includes(col)) return body.reason;
        if (col === 'status') return 'open';
        return undefined;
      }
    );

    if (insertErr) {
      res.status(500).json({ error: insertErr.message });
      return;
    }

    res.json({ ok: true });
  });

  // 6. Optional Server-Side Gemini AI Visit Preparation Assistant
  // Strictly grounded in real office metadata and computed statistics — never invents queue data.
  const aiBriefSchema = z.object({
    officeName: z.string().trim().min(2).max(160),
    category: z.string().trim().min(2).max(60),
    city: z.string().trim().max(100).optional(),
    state: z.string().trim().max(100).optional(),
    language: z.enum(['en', 'hi']).default('en'),
    recentReportCount: z.number().int().min(0).default(0),
    estimatedWaitingMinutes: z.number().nullable().optional(),
    currentCrowdLevel: z.string().optional(),
    hasHistoricalData: z.boolean().default(false),
  });

  app.post('/api/ai/visit-brief', async (req, res) => {
    const clientIp = req.ip || 'unknown';
    if (!checkRateLimit(`ai:${clientIp}`, 10, 60_000)) {
      res.status(429).json({ error: 'Too many visit brief requests. Please wait a minute.' });
      return;
    }

    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
      res.status(503).json({
        error:
          'Optional AI visit preparation is unavailable because GEMINI_API_KEY is not configured on the server.',
      });
      return;
    }

    const parsed = aiBriefSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid office information for visit preparation brief.' });
      return;
    }

    const info = parsed.data;
    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const langInstruction =
        info.language === 'hi'
          ? 'Respond in clear, respectful Hindi (Devanagari script).'
          : 'Respond in clear, concise Indian English.';

      const queueContext =
        info.recentReportCount > 0
          ? `Real citizen reports in the last 2 hours: ${info.recentReportCount} report(s), crowd level "${info.currentCrowdLevel}", calculated estimate ${info.estimatedWaitingMinutes ?? 'N/A'} minutes.`
          : 'There are currently NO recent citizen queue reports for this office.';

      const prompt = [
        `Office: ${info.officeName}`,
        `Category: ${info.category}`,
        `Location: ${[info.city, info.state].filter(Boolean).join(', ') || 'India'}`,
        `Live Queue Context: ${queueContext}`,
        `Historical Pattern Available: ${info.hasHistoricalData ? 'Yes' : 'No'}`,
        '',
        'Provide a concise civic visit preparation checklist (4-5 short bullet points max, under 140 words total) covering:',
        '1. Common identity/address documents citizens typically carry for this Indian public office category (remind them to verify exact requirements on the official portal).',
        '2. Practical preparation tips (photocopies, pen, appointment printout if applicable).',
        '3. If live queue context has no reports, explicitly state that no live queue data is available and invite them to report their actual wait time after visiting.',
        'STRICT RULES: Do NOT invent opening hours, phone numbers, counter numbers, guaranteed waiting times, or fake crowd predictions.',
      ].join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction: `You are a factual civic visit preparation assistant for Indian citizens using PratikshaIQ. ${langInstruction} Never fabricate statistics, queue lengths, or official hours.`,
        },
      });

      const text = (response.text || '').trim();
      if (!text) {
        res.status(502).json({ error: 'AI service returned an empty response.' });
        return;
      }

      res.json({
        brief: text,
        disclaimer:
          info.language === 'hi'
            ? 'यह सामान्य तैयारी मार्गदर्शन है। कृपया आधिकारिक सरकारी वेबसाइट पर दस्तावेज़ और समय की पुष्टि करें।'
            : 'General preparation guidance only. Verify exact document requirements and official timings directly with the office.',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gemini request failed';
      await logApiErrorToSupabase('gemini', '/api/ai/visit-brief', msg);
      res.status(502).json({
        error: 'Unable to generate optional AI visit brief right now. Core queue features remain available.',
      });
    }
  });

  // 6b. Direct Account Registration without Email Confirmation (when SUPABASE_SERVICE_ROLE_KEY is configured)
  const registerSchema = z.object({
    email: z.string().trim().email().max(254),
    password: z.string().min(6).max(128),
    displayName: z.string().trim().max(100).optional(),
  });

  app.post('/api/auth/register', async (req, res) => {
    const clientIp = req.ip || 'unknown';
    if (!checkRateLimit(`register:${clientIp}`, 8, 60 * 60_000)) {
      res.status(429).json({ error: 'Too many registration attempts. Please try again later.' });
      return;
    }

    if (!supabaseAdmin) {
      res.status(503).json({ error: 'Server registration fallback unavailable.' });
      return;
    }

    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Please provide a valid email and password (at least 6 characters).' });
      return;
    }

    const { email, password, displayName } = parsed.data;
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: displayName ? { display_name: displayName } : undefined,
    });

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.status(201).json({ userId: data.user.id });
  });

  // 7. Mount Vite Dev Middleware OR serve production static build
  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PratikshaIQ server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start PratikshaIQ server:', err);
  process.exit(1);
});
