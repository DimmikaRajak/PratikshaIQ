import { supabase, isSupabaseConfigured, getSupabaseConfigError } from './supabase';
import { readDiscoveryCache, saveDiscoveryCache } from './offlineCache';
import {
  OPTIONAL_QUEUE_REPORT_COLUMNS,
  OPTIONAL_REPORT_FLAG_COLUMNS,
  OPTIONAL_SUGGESTION_COLUMNS,
  QUEUE_REPORT_COLUMN_ALIASES,
  REPORT_FLAG_COLUMN_ALIASES,
  SUGGESTION_COLUMN_ALIASES,
  isMissingSchemaTableError,
  runSingleWriteWithColumnFallback,
} from './schemaFallback';
import type {
  GeoLocationResult,
  Office,
  OfficeAggregate,
  OfficeCategory,
  OfficeSuggestion,
  QueueReport,
  ReportFlag,
  ReportableCrowdLevel,
  UserProfile,
} from '../types/domain';

export interface DiscoverResponse {
  offices: Office[];
  cached: boolean;
  offlineFallback?: boolean;
  fetchedAt?: string;
  sourceNote?: string;
}

export async function searchIndiaLocations(
  query: string,
  state?: string
): Promise<GeoLocationResult[]> {
  const params = new URLSearchParams({ q: query });
  if (state) params.set('state', state);
  const res = await fetch(`/api/location/search?${params.toString()}`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Location search failed.');
  }
  return data.results || [];
}

export async function reverseGeocodeIndia(
  lat: number,
  lon: number
): Promise<GeoLocationResult> {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lon) });
  const res = await fetch(`/api/location/reverse?${params.toString()}`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Reverse geocoding failed.');
  }
  return data.location;
}

export async function discoverNearbyOffices(params: {
  lat: number;
  lon: number;
  radius: number;
  category?: string;
  state?: string;
  city?: string;
}): Promise<DiscoverResponse> {
  const cacheKey = `${params.lat.toFixed(2)}:${params.lon.toFixed(2)}:${params.radius}:${params.category || 'all'}`;
  const query = new URLSearchParams({
    lat: String(params.lat),
    lon: String(params.lon),
    radius: String(params.radius),
  });
  if (params.category && params.category !== 'all') query.set('category', params.category);
  if (params.state) query.set('state', params.state);
  if (params.city) query.set('city', params.city);

  try {
    const res = await fetch(`/api/offices/discover?${query.toString()}`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to discover offices.');
    }
    const offices: Office[] = data.offices || [];
    saveDiscoveryCache(cacheKey, offices);
    return {
      offices,
      cached: Boolean(data.cached),
      fetchedAt: data.fetchedAt,
      sourceNote: data.sourceNote,
    };
  } catch (err) {
    // Offline/API failure resilience: return previously retrieved genuine OSM records if cached
    const localCached = readDiscoveryCache(cacheKey);
    if (localCached) {
      return {
        offices: localCached.offices,
        cached: true,
        offlineFallback: true,
        fetchedAt: localCached.fetchedAt,
      };
    }
    throw err;
  }
}

function normalizeOfficeRow(
  row: Record<string, unknown>,
  explicitAggregate?: OfficeAggregate | null
): Office {
  const aggRaw =
    explicitAggregate !== undefined
      ? explicitAggregate
      : Array.isArray(row.office_aggregates)
        ? row.office_aggregates[0]
        : row.office_aggregates;
  const rawLat = row.latitude ?? row.lat;
  const rawLon = row.longitude ?? row.lng ?? row.lon;
  return {
    ...(row as unknown as Office),
    id: String(row.id),
    name: String(row.name || 'Public Office'),
    slug: String(row.slug || row.id),
    category: (row.category as OfficeCategory) || 'government_office',
    state: String(row.state || 'India'),
    latitude: rawLat !== undefined && rawLat !== null ? Number(rawLat) : 0,
    longitude: rawLon !== undefined && rawLon !== null ? Number(rawLon) : 0,
    source: (row.source as Office['source']) || 'osm',
    verification_status: (row.verification_status as Office['verification_status']) || 'approved',
    aggregate: aggRaw ? (aggRaw as OfficeAggregate) : null,
  };
}

export async function fetchDatabaseOffices(filters?: {
  search?: string;
  category?: string;
  state?: string;
  city?: string;
  postalCode?: string;
  limit?: number;
  offset?: number;
}): Promise<{ offices: Office[]; total: number }> {
  if (!supabase || !isSupabaseConfigured) {
    return { offices: [], total: 0 };
  }

  let query = supabase
    .from('offices')
    .select('*, office_aggregates(*)', { count: 'exact' })
    .eq('verification_status', 'approved')
    .order('updated_at', { ascending: false });

  if (filters?.category && filters.category !== 'all') {
    query = query.eq('category', filters.category);
  }
  if (filters?.state) {
    query = query.ilike('state', `%${filters.state}%`);
  }
  if (filters?.city) {
    query = query.ilike('city', `%${filters.city}%`);
  }
  if (filters?.postalCode) {
    query = query.eq('postal_code', filters.postalCode.trim());
  }
  if (filters?.search && filters.search.trim().length > 0) {
    const term = filters.search.trim().replace(/[,%]/g, '');
    query = query.or(
      `name.ilike.%${term}%,city.ilike.%${term}%,address.ilike.%${term}%,postal_code.ilike.%${term}%`
    );
  }

  const limit = filters?.limit ?? 24;
  const offset = filters?.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  let { data, count, error } = await query;

  // Fallback for older schemas missing `verification_status`, `updated_at`, or `office_aggregates`
  if (error) {
    let fallbackQuery = supabase
      .from('offices')
      .select('*', { count: 'exact' })
      .range(offset, offset + limit - 1);
    if (filters?.search && filters.search.trim().length > 0) {
      const term = filters.search.trim().replace(/[,%]/g, '');
      fallbackQuery = fallbackQuery.ilike('name', `%${term}%`);
    }
    const fallbackRes = await fallbackQuery;
    if (fallbackRes.error) {
      if (isMissingSchemaTableError(fallbackRes.error.message, 'offices')) {
        return { offices: [], total: 0 };
      }
      throw new Error(error.message);
    }
    data = fallbackRes.data;
    count = fallbackRes.count;
  }

  const offices: Office[] = (data || []).map((row: Record<string, unknown>) =>
    normalizeOfficeRow(row)
  );

  return { offices, total: count ?? offices.length };
}

export async function fetchRecentlyReportedOffices(limit = 8): Promise<Office[]> {
  if (!supabase || !isSupabaseConfigured) return [];

  const { data, error } = await supabase
    .from('office_aggregates')
    .select('*, offices(*)')
    .gt('recent_report_count', 0)
    .order('last_report_at', { ascending: false })
    .limit(limit);

  if (!error && data) {
    return data
      .filter((row: Record<string, unknown>) => Boolean(row.offices))
      .map((row: Record<string, unknown>) => {
        const officeRow = row.offices as Record<string, unknown>;
        return normalizeOfficeRow(officeRow, {
          office_id: String(row.office_id),
          current_crowd_level: row.current_crowd_level as OfficeAggregate['current_crowd_level'],
          estimated_waiting_minutes:
            row.estimated_waiting_minutes !== null ? Number(row.estimated_waiting_minutes) : null,
          average_queue_size:
            row.average_queue_size !== null ? Number(row.average_queue_size) : null,
          confidence_level: row.confidence_level as OfficeAggregate['confidence_level'],
          recent_report_count: Number(row.recent_report_count),
          last_report_at: (row.last_report_at as string) || null,
          calculated_at: String(row.calculated_at),
        });
      });
  }

  // Fallback when `office_aggregates` table or FK join isn't present yet:
  // read recent active reports and hydrate their offices directly.
  const reportsRes = await supabase
    .from('queue_reports')
    .select('office_id, submitted_at')
    .order('submitted_at', { ascending: false })
    .limit(limit * 3);

  if (reportsRes.error || !reportsRes.data || reportsRes.data.length === 0) {
    return [];
  }

  const officeIds = Array.from(
    new Set(
      reportsRes.data
        .map((r: Record<string, unknown>) => String(r.office_id || ''))
        .filter(Boolean)
    )
  ).slice(0, limit);

  if (officeIds.length === 0) return [];

  const officesRes = await supabase.from('offices').select('*').in('id', officeIds);
  if (officesRes.error || !officesRes.data) return [];

  const byId = new Map<string, Office>();
  for (const row of officesRes.data as Record<string, unknown>[]) {
    const normalized = normalizeOfficeRow(row, null);
    byId.set(normalized.id, normalized);
  }

  return officeIds.map((id) => byId.get(id)).filter((o): o is Office => Boolean(o));
}

export async function fetchOfficeByIdOrSlug(idOrSlug: string): Promise<Office | null> {
  if (!supabase || !isSupabaseConfigured) return null;

  const isId =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug) ||
    /^\d+$/.test(idOrSlug);

  const primary = await supabase
    .from('offices')
    .select('*, office_aggregates(*)')
    .eq(isId ? 'id' : 'slug', idOrSlug)
    .maybeSingle();

  if (!primary.error && primary.data) {
    return normalizeOfficeRow(primary.data as Record<string, unknown>);
  }

  // Fallback when `office_aggregates` FK join or `slug` column isn't available yet
  const fallback = await supabase
    .from('offices')
    .select('*')
    .eq(isId ? 'id' : 'slug', idOrSlug)
    .maybeSingle();

  if (fallback.error || !fallback.data) return null;

  const officeRow = fallback.data as Record<string, unknown>;
  const aggRes = await supabase
    .from('office_aggregates')
    .select('*')
    .eq('office_id', String(officeRow.id))
    .maybeSingle();

  return normalizeOfficeRow(
    officeRow,
    !aggRes.error && aggRes.data ? (aggRes.data as OfficeAggregate) : null
  );
}

function normalizeCrowdLevel(raw: unknown): QueueReport['crowd_level'] {
  const key = String(raw ?? 'moderate').trim().toLowerCase().replace(/\s+/g, '_');
  if (key === 'very_low') return 'very_low';
  if (key === 'low') return 'low';
  if (key === 'moderate' || key === 'medium' || key === 'normal') return 'moderate';
  if (key === 'high') return 'high';
  if (key === 'very_high' || key === 'severe' || key === 'critical') return 'very_high';
  return 'moderate';
}

function normalizeQueueReportRow(row: Record<string, unknown>): QueueReport {
  const waitFallback = Number(
    row.wait_time ?? row.waiting_time ?? row.estimated_wait_minutes ?? 0
  );
  const queueFallback = Number(row.queue_size ?? row.queue_length ?? row.people_count ?? 0);

  return {
    id: String(row.id),
    office_id: String(row.office_id),
    queue_size_min: Number(row.queue_size_min ?? queueFallback),
    queue_size_max: Number(row.queue_size_max ?? queueFallback),
    waiting_time_min: Number(row.waiting_time_min ?? waitFallback),
    waiting_time_max: Number(row.waiting_time_max ?? waitFallback),
    crowd_level: normalizeCrowdLevel(row.crowd_level ?? row.crowd_status),
    note:
      typeof row.note === 'string'
        ? row.note
        : typeof row.notes === 'string'
          ? row.notes
          : typeof row.comment === 'string'
            ? row.comment
            : null,
    submitted_at: String(row.submitted_at || row.reported_at || row.created_at || new Date().toISOString()),
    report_status: (row.report_status as QueueReport['report_status']) || 'active',
  };
}

export async function fetchOfficeReports(officeId: string, limit = 150): Promise<QueueReport[]> {
  if (!supabase || !isSupabaseConfigured) return [];
  if (!officeId || officeId.startsWith('osm-')) return [];

  const viewRes = await supabase
    .from('public_queue_reports')
    .select(
      'id, office_id, queue_size_min, queue_size_max, waiting_time_min, waiting_time_max, crowd_level, note, submitted_at, report_status'
    )
    .eq('office_id', officeId)
    .order('submitted_at', { ascending: false })
    .limit(limit);

  if (!viewRes.error && viewRes.data) {
    return (viewRes.data as Record<string, unknown>[]).map(normalizeQueueReportRow);
  }

  // Fallback when `public_queue_reports` view hasn't been created yet:
  // query `queue_reports` directly omitting `user_id`.
  const directRes = await supabase
    .from('queue_reports')
    .select(
      'id, office_id, queue_size_min, queue_size_max, waiting_time_min, waiting_time_max, crowd_level, note, submitted_at, report_status'
    )
    .eq('office_id', officeId)
    .order('submitted_at', { ascending: false })
    .limit(limit);

  if (!directRes.error && directRes.data) {
    return (directRes.data as Record<string, unknown>[])
      .map(normalizeQueueReportRow)
      .filter((r) => !r.report_status || r.report_status === 'active');
  }

  // Final fallback for older queue_reports schemas missing optional columns
  const minimalRes = await supabase
    .from('queue_reports')
    .select('*')
    .eq('office_id', officeId)
    .limit(limit);

  if (minimalRes.error) {
    if (isMissingSchemaTableError(minimalRes.error.message, 'queue_reports')) return [];
    throw new Error(viewRes.error?.message || minimalRes.error.message);
  }

  return (minimalRes.data || [])
    .map((row: Record<string, unknown>) => normalizeQueueReportRow(row))
    .filter((r) => !r.report_status || r.report_status === 'active')
    .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());
}

export async function submitQueueReport(payload: {
  office: Office;
  queue_size_min: number;
  queue_size_max: number;
  waiting_time_min: number;
  waiting_time_max: number;
  crowd_level: ReportableCrowdLevel;
  note?: string;
}): Promise<{ reportId: string; officeId: string; officeSlug: string }> {
  if (!supabase || !isSupabaseConfigured) {
    throw new Error(getSupabaseConfigError());
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    throw new Error('You must sign in before submitting a queue report.');
  }

  let targetOfficeId = payload.office.id;
  let targetOfficeSlug = payload.office.slug;

  // If this office came directly from OSM and isn't persisted to Supabase yet, ensure it server-side
  const isPersistedOfficeId = Boolean(targetOfficeId) && !targetOfficeId.startsWith('osm-');

  if (!isPersistedOfficeId && payload.office.source === 'osm' && payload.office.osm_type && payload.office.osm_id) {
    const res = await fetch('/api/offices/ensure-osm', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        name: payload.office.name,
        slug: payload.office.slug,
        category: payload.office.category,
        address: payload.office.address,
        city: payload.office.city,
        district: payload.office.district,
        state: payload.office.state || 'India',
        postal_code: payload.office.postal_code,
        latitude: payload.office.latitude,
        longitude: payload.office.longitude,
        source: 'osm',
        osm_type: payload.office.osm_type,
        osm_id: payload.office.osm_id,
        official_website: payload.office.official_website,
        phone: payload.office.phone,
      }),
    });

    const ensured = await res.json();
    if (!res.ok || !ensured.office?.id) {
      throw new Error(
        ensured.error || 'Could not register this OpenStreetMap office in the database.'
      );
    }
    targetOfficeId = String(ensured.office.id);
    targetOfficeSlug = String(ensured.office.slug || payload.office.slug);
  }

  const client = supabase;
  const waitMid = Math.round((payload.waiting_time_min + payload.waiting_time_max) / 2);
  const queueMid = Math.round((payload.queue_size_min + payload.queue_size_max) / 2);

  const reportPayload: Record<string, unknown> = {
    office_id: targetOfficeId,
    user_id: session.user.id,
    queue_size_min: payload.queue_size_min,
    queue_size_max: payload.queue_size_max,
    waiting_time_min: payload.waiting_time_min,
    waiting_time_max: payload.waiting_time_max,
    crowd_level: payload.crowd_level,
    report_status: 'active',
    note: payload.note?.trim() || null,
  };

  const { data, error } = await runSingleWriteWithColumnFallback<Record<string, unknown>>(
    reportPayload,
    OPTIONAL_QUEUE_REPORT_COLUMNS,
    (row) => client.from('queue_reports').insert(row).select('id').single(),
    QUEUE_REPORT_COLUMN_ALIASES,
    (_row, col) => {
      if (
        ['user_id', 'reported_by', 'submitted_by', 'created_by', 'reporter_id', 'author_id', 'profile_id'].includes(
          col
        )
      ) {
        return session.user.id;
      }
      if (['waiting_time', 'wait_time', 'estimated_wait_minutes', 'wait_minutes'].includes(col)) {
        return waitMid;
      }
      if (['queue_size', 'queue_length', 'people_count', 'queue_count'].includes(col)) {
        return queueMid;
      }
      if (['crowd_level', 'crowd_status'].includes(col)) return payload.crowd_level;
      if (col === 'report_status') return 'active';
      return undefined;
    }
  );

  if (!error && data) {
    return {
      reportId: String(data.id),
      officeId: targetOfficeId,
      officeSlug: targetOfficeSlug,
    };
  }

  // If direct client insert failed due to a legacy RLS/schema mismatch (not rate-limit/duplicate),
  // retry through our authenticated server endpoint which validates the user's JWT and enforces limits.
  const errMsg = error?.message || '';
  const isUserLimitError = /already submitted|limit reached|suspended/i.test(errMsg);
  if (!isUserLimitError) {
    const serverRes = await fetch('/api/reports/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        office_id: targetOfficeId,
        queue_size_min: payload.queue_size_min,
        queue_size_max: payload.queue_size_max,
        waiting_time_min: payload.waiting_time_min,
        waiting_time_max: payload.waiting_time_max,
        crowd_level: payload.crowd_level,
        note: payload.note?.trim() || null,
      }),
    }).catch(() => null);

    if (serverRes) {
      const serverData = (await serverRes.json().catch(() => ({}))) as {
        reportId?: string;
        error?: string;
      };
      if (serverRes.ok && serverData.reportId) {
        return {
          reportId: String(serverData.reportId),
          officeId: targetOfficeId,
          officeSlug: targetOfficeSlug,
        };
      }
      if (serverRes.status !== 503 && serverData.error) {
        throw new Error(serverData.error);
      }
    }
  }

  throw new Error(errMsg || 'Could not submit queue report.');
}

export async function flagQueueReport(reportId: string, reason: string): Promise<void> {
  if (!supabase || !isSupabaseConfigured) {
    throw new Error(getSupabaseConfigError());
  }
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Please sign in to flag a report.');

  const client = supabase;
  const { error } = await runSingleWriteWithColumnFallback(
    {
      report_id: reportId,
      reported_by: session.user.id,
      reason: reason.trim(),
      status: 'open',
    },
    OPTIONAL_REPORT_FLAG_COLUMNS,
    (row) => client.from('report_flags').insert(row),
    REPORT_FLAG_COLUMN_ALIASES
  );

  if (!error) return;

  const serverRes = await fetch('/api/flags/submit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      report_id: reportId,
      reason: reason.trim(),
    }),
  }).catch(() => null);

  if (serverRes && serverRes.ok) return;
  if (serverRes && serverRes.status !== 503) {
    const serverData = (await serverRes.json().catch(() => ({}))) as { error?: string };
    if (serverData.error) throw new Error(serverData.error);
  }

  throw new Error(error.message);
}

export async function fetchMyReports(): Promise<QueueReport[]> {
  if (!supabase || !isSupabaseConfigured) return [];
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const primary = await supabase
    .from('queue_reports')
    .select('*, offices(id, name, slug, category, city, state)')
    .eq('user_id', user.id)
    .order('submitted_at', { ascending: false })
    .limit(100);

  if (!primary.error && primary.data) {
    return primary.data.map((row: Record<string, unknown>) => ({
      ...normalizeQueueReportRow(row),
      office: (row.offices as QueueReport['office']) || null,
    }));
  }

  // Fallback across legacy user-owner columns when `user_id` or FK join isn't present yet
  let rows: Record<string, unknown>[] | null = null;
  for (const ownerCol of [
    'user_id',
    'reported_by',
    'submitted_by',
    'created_by',
    'reporter_id',
    'author_id',
    'profile_id',
  ]) {
    const res = await supabase
      .from('queue_reports')
      .select('*')
      .eq(ownerCol, user.id)
      .limit(100);
    if (!res.error && res.data) {
      rows = res.data as Record<string, unknown>[];
      break;
    }
    if (res.error && isMissingSchemaTableError(res.error.message, 'queue_reports')) {
      return [];
    }
  }

  if (!rows) return [];

  const officeIds = Array.from(
    new Set(rows.map((r) => String(r.office_id || '')).filter(Boolean))
  );
  const officesById = new Map<string, QueueReport['office']>();

  if (officeIds.length > 0) {
    const offRes = await supabase.from('offices').select('*').in('id', officeIds);
    if (!offRes.error && offRes.data) {
      for (const o of offRes.data as Record<string, unknown>[]) {
        officesById.set(String(o.id), {
          id: String(o.id),
          name: String(o.name || 'Public Office'),
          slug: String(o.slug || o.id),
          category: (o.category as OfficeCategory) || 'government_office',
          city: typeof o.city === 'string' ? o.city : null,
          state: String(o.state || 'India'),
        });
      }
    }
  }

  return rows
    .map((row) => ({
      ...normalizeQueueReportRow(row),
      office: officesById.get(String(row.office_id || '')) || null,
    }))
    .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());
}

export async function submitOfficeSuggestion(input: {
  office_name: string;
  category: OfficeCategory;
  address: string;
  city: string;
  district?: string;
  state: string;
  postal_code?: string;
  latitude: number;
  longitude: number;
  official_website?: string;
  phone?: string;
}): Promise<OfficeSuggestion> {
  if (!supabase || !isSupabaseConfigured) {
    throw new Error(getSupabaseConfigError());
  }
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Please sign in to suggest a public office.');

  const client = supabase;
  const suggestionPayload: Record<string, unknown> = {
    suggested_by: session.user.id,
    office_name: input.office_name.trim(),
    category: input.category,
    address: input.address.trim(),
    city: input.city.trim(),
    district: input.district?.trim() || null,
    state: input.state.trim(),
    postal_code: input.postal_code?.trim() || null,
    latitude: input.latitude,
    longitude: input.longitude,
    official_website: input.official_website?.trim() || null,
    phone: input.phone?.trim() || null,
    review_status: 'pending',
  };

  const { data, error } = await runSingleWriteWithColumnFallback<unknown>(
    suggestionPayload,
    OPTIONAL_SUGGESTION_COLUMNS,
    (row) => client.from('office_suggestions').insert(row).select('*').single(),
    SUGGESTION_COLUMN_ALIASES
  );

  if (!error && data) {
    return data as OfficeSuggestion;
  }

  const serverRes = await fetch('/api/suggestions/submit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      office_name: input.office_name.trim(),
      category: input.category,
      address: input.address.trim(),
      city: input.city.trim(),
      district: input.district?.trim() || null,
      state: input.state.trim(),
      postal_code: input.postal_code?.trim() || null,
      latitude: input.latitude,
      longitude: input.longitude,
      official_website: input.official_website?.trim() || null,
      phone: input.phone?.trim() || null,
    }),
  }).catch(() => null);

  if (serverRes) {
    const serverData = (await serverRes.json().catch(() => ({}))) as {
      suggestion?: OfficeSuggestion;
      error?: string;
    };
    if (serverRes.ok && serverData.suggestion) {
      return serverData.suggestion;
    }
    if (serverRes.status !== 503 && serverData.error) {
      throw new Error(serverData.error);
    }
  }

  throw new Error(error?.message || 'Could not submit office suggestion.');
}

export async function fetchMyOfficeSuggestions(): Promise<OfficeSuggestion[]> {
  if (!supabase || !isSupabaseConfigured) return [];
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('office_suggestions')
    .select('*')
    .eq('suggested_by', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    if (isMissingSchemaTableError(error.message, 'office_suggestions')) return [];
    throw new Error(error.message);
  }
  return (data || []) as OfficeSuggestion[];
}

// Optional Gemini AI visit preparation brief
export async function requestAiVisitBrief(payload: {
  officeName: string;
  category: string;
  city?: string | null;
  state?: string | null;
  language: 'en' | 'hi';
  recentReportCount: number;
  estimatedWaitingMinutes?: number | null;
  currentCrowdLevel?: string;
  hasHistoricalData: boolean;
}): Promise<{ brief: string; disclaimer: string }> {
  const res = await fetch('/api/ai/visit-brief', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      officeName: payload.officeName,
      category: payload.category,
      city: payload.city || undefined,
      state: payload.state || undefined,
      language: payload.language,
      recentReportCount: payload.recentReportCount,
      estimatedWaitingMinutes: payload.estimatedWaitingMinutes ?? null,
      currentCrowdLevel: payload.currentCrowdLevel,
      hasHistoricalData: payload.hasHistoricalData,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'AI visit preparation is currently unavailable.');
  }
  return data;
}

// Admin API helpers (all strictly enforced by Supabase RLS + SECURITY DEFINER admin RPCs)
export async function fetchAdminDashboardData(): Promise<{
  pendingSuggestions: OfficeSuggestion[];
  openFlags: ReportFlag[];
  suspiciousReports: QueueReport[];
  apiErrors: Array<{
    id: string;
    service: string;
    endpoint: string;
    error_message: string;
    status_code: number | null;
    created_at: string;
  }>;
  stats: {
    totalApprovedOffices: number;
    totalReports: number;
    pendingSuggestionsCount: number;
    openFlagsCount: number;
  };
  profiles: UserProfile[];
}> {
  if (!supabase || !isSupabaseConfigured) {
    throw new Error(getSupabaseConfigError());
  }

  const [
    suggestionsRes,
    flagsRes,
    suspiciousRes,
    errorsRes,
    officesCountRes,
    reportsCountRes,
    profilesRes,
  ] = await Promise.all([
    supabase
      .from('office_suggestions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('report_flags')
      .select('*, queue_reports(*)')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('queue_reports')
      .select('*, offices(id, name, slug, category, city, state)')
      .gte('suspicious_score', 30)
      .order('submitted_at', { ascending: false })
      .limit(30),
    supabase
      .from('api_error_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('offices')
      .select('id', { count: 'exact', head: true })
      .eq('verification_status', 'approved'),
    supabase.from('queue_reports').select('id', { count: 'exact', head: true }),
    supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(40),
  ]);

  const pendingSuggestions = (!suggestionsRes.error ? suggestionsRes.data || [] : []) as OfficeSuggestion[];
  const openFlags = ((!flagsRes.error ? flagsRes.data || [] : []) as Array<Record<string, unknown>>).map((row) => ({
    ...(row as unknown as ReportFlag),
    queue_report: (row.queue_reports as QueueReport) || null,
  }));

  const suspiciousReports = ((!suspiciousRes.error ? suspiciousRes.data || [] : []) as Array<Record<string, unknown>>).map(
    (row) => ({
      ...(row as unknown as QueueReport),
      office: (row.offices as QueueReport['office']) || null,
    })
  );

  return {
    pendingSuggestions,
    openFlags,
    suspiciousReports,
    apiErrors: (!errorsRes.error ? errorsRes.data || [] : []) as Array<{
      id: string;
      service: string;
      endpoint: string;
      error_message: string;
      status_code: number | null;
      created_at: string;
    }>,
    stats: {
      totalApprovedOffices: !officesCountRes.error ? (officesCountRes.count ?? 0) : 0,
      totalReports: !reportsCountRes.error ? (reportsCountRes.count ?? 0) : 0,
      pendingSuggestionsCount: pendingSuggestions.filter((s) => s.review_status === 'pending').length,
      openFlagsCount: openFlags.filter((f) => f.status === 'open').length,
    },
    profiles: (!profilesRes.error ? profilesRes.data || [] : []) as UserProfile[],
  };
}

export async function adminApproveSuggestion(suggestionId: string, notes?: string): Promise<string> {
  if (!supabase) throw new Error(getSupabaseConfigError());
  const { data, error } = await supabase.rpc('approve_office_suggestion', {
    p_suggestion_id: suggestionId,
    p_notes: notes || null,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function adminRejectSuggestion(suggestionId: string, notes?: string): Promise<void> {
  if (!supabase) throw new Error(getSupabaseConfigError());
  const { error } = await supabase.rpc('reject_office_suggestion', {
    p_suggestion_id: suggestionId,
    p_notes: notes || null,
  });
  if (error) throw new Error(error.message);
}

export async function adminModerateReport(
  reportId: string,
  status: 'active' | 'hidden' | 'rejected',
  flagId?: string
): Promise<void> {
  if (!supabase) throw new Error(getSupabaseConfigError());
  const { error } = await supabase
    .from('queue_reports')
    .update({ report_status: status })
    .eq('id', reportId);
  if (error) throw new Error(error.message);

  if (flagId) {
    await supabase
      .from('report_flags')
      .update({ status: status === 'active' ? 'dismissed' : 'action_taken' })
      .eq('id', flagId);
  }
}

export async function adminToggleUserSuspension(
  userId: string,
  suspend: boolean
): Promise<void> {
  if (!supabase) throw new Error(getSupabaseConfigError());
  const { error } = await supabase
    .from('profiles')
    .update({ is_suspended: suspend })
    .eq('id', userId);
  if (error) throw new Error(error.message);
}
