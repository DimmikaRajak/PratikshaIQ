/**
 * Helpers for gracefully handling PostgREST schema-cache drift when an existing
 * Supabase table is missing tables or columns (e.g. `district`, `latitude`,
 * `user_id`, `public.profiles`) or uses alternate column names (`lat`/`lng`,
 * `reported_by`/`wait_time`/`queue_size`).
 */

export const OPTIONAL_OFFICE_COLUMNS = new Set<string>([
  'slug',
  'category',
  'address',
  'city',
  'district',
  'state',
  'postal_code',
  'latitude',
  'longitude',
  'lat',
  'lng',
  'lon',
  'source',
  'osm_type',
  'osm_id',
  'official_website',
  'phone',
  'verification_status',
]);

export const OFFICE_COLUMN_ALIASES: Readonly<Record<string, string>> = {
  latitude: 'lat',
  longitude: 'lng',
  lng: 'lon',
};

export const OPTIONAL_SUGGESTION_COLUMNS = new Set<string>([
  'suggested_by',
  'user_id',
  'office_name',
  'name',
  'category',
  'address',
  'city',
  'district',
  'state',
  'postal_code',
  'latitude',
  'longitude',
  'lat',
  'lng',
  'lon',
  'official_website',
  'phone',
  'review_status',
  'status',
]);

export const SUGGESTION_COLUMN_ALIASES: Readonly<Record<string, string>> = {
  suggested_by: 'user_id',
  office_name: 'name',
  latitude: 'lat',
  longitude: 'lng',
  lng: 'lon',
  review_status: 'status',
};

export const OPTIONAL_QUEUE_REPORT_COLUMNS = new Set<string>([
  'user_id',
  'reported_by',
  'submitted_by',
  'created_by',
  'reporter_id',
  'author_id',
  'profile_id',
  'queue_size_min',
  'queue_size_max',
  'queue_size',
  'queue_length',
  'people_count',
  'waiting_time_min',
  'waiting_time_max',
  'waiting_time',
  'wait_time',
  'estimated_wait_minutes',
  'crowd_level',
  'crowd_status',
  'note',
  'notes',
  'comment',
  'report_status',
  'suspicious_score',
  'submitted_at',
]);

export const QUEUE_REPORT_COLUMN_ALIASES: Readonly<Record<string, string>> = {
  user_id: 'reported_by',
  reported_by: 'submitted_by',
  submitted_by: 'created_by',
  created_by: 'reporter_id',
  reporter_id: 'author_id',
  author_id: 'profile_id',
  waiting_time_min: 'waiting_time',
  waiting_time: 'wait_time',
  wait_time: 'estimated_wait_minutes',
  queue_size_min: 'queue_size',
  queue_size: 'queue_length',
  crowd_level: 'crowd_status',
  note: 'notes',
  notes: 'comment',
};

export const OPTIONAL_PROFILE_COLUMNS = new Set<string>([
  'display_name',
  'full_name',
  'name',
  'avatar_url',
  'preferred_language',
  'is_suspended',
]);

export const PROFILE_COLUMN_ALIASES: Readonly<Record<string, string>> = {
  display_name: 'full_name',
  full_name: 'name',
};

export const OPTIONAL_REPORT_FLAG_COLUMNS = new Set<string>([
  'reported_by',
  'user_id',
  'reason',
  'note',
  'status',
]);

export const REPORT_FLAG_COLUMN_ALIASES: Readonly<Record<string, string>> = {
  reported_by: 'user_id',
  reason: 'note',
};

/**
 * Returns true when PostgREST (PGRST205) or PostgreSQL (42P01) reports that a
 * table does not exist or is missing from PostgREST's schema cache.
 */
export function isMissingSchemaTableError(
  message: string | null | undefined,
  tableName?: string
): boolean {
  if (!message) return false;

  const pgrstMatch = message.match(
    /Could not find the table '([a-zA-Z0-9_.]+)' in the schema cache/i
  );
  if (pgrstMatch?.[1]) {
    if (!tableName) return true;
    const found = pgrstMatch[1].toLowerCase();
    const target = tableName.toLowerCase();
    return found === target || found === `public.${target}` || found.endsWith(`.${target}`);
  }

  const pgMatch = message.match(/relation "([a-zA-Z0-9_.]+)" does not exist/i);
  if (pgMatch?.[1]) {
    if (!tableName) return true;
    const found = pgMatch[1].toLowerCase();
    const target = tableName.toLowerCase();
    return found === target || found === `public.${target}` || found.endsWith(`.${target}`);
  }

  return false;
}

/**
 * Extracts the missing column name from PostgREST (PGRST204) or PostgreSQL
 * undefined-column errors, or returns null if the error is unrelated.
 */
export function extractMissingSchemaColumn(message: string | null | undefined): string | null {
  if (!message) return null;

  // PostgREST schema cache error:
  // "Could not find the 'user_id' column of 'queue_reports' in the schema cache"
  const pgrstMatch = message.match(
    /Could not find the '([a-zA-Z0-9_]+)' column of '[^']+' in the schema cache/i
  );
  if (pgrstMatch?.[1]) {
    return pgrstMatch[1];
  }

  // Direct PostgreSQL error:
  // 'column "user_id" of relation "queue_reports" does not exist'
  // or 'column queue_reports.user_id does not exist'
  const pgRelMatch = message.match(
    /column "([a-zA-Z0-9_]+)"(?: of relation "[^"]+")? does not exist/i
  );
  if (pgRelMatch?.[1]) {
    return pgRelMatch[1];
  }

  const pgDotMatch = message.match(/column [a-zA-Z0-9_]+\.([a-zA-Z0-9_]+) does not exist/i);
  if (pgDotMatch?.[1]) {
    return pgDotMatch[1];
  }

  return null;
}

/**
 * Extracts the column name from PostgreSQL NOT NULL constraint violations (23502):
 * 'null value in column "city" of relation "offices" violates not-null constraint'
 */
export function extractNotNullViolationColumn(
  message: string | null | undefined
): string | null {
  if (!message) return null;
  const match = message.match(
    /null value in column "([a-zA-Z0-9_]+)"(?: of relation "[^"]+")? violates not-null constraint/i
  );
  return match?.[1] ?? null;
}

export function omitColumn<T extends Record<string, unknown>>(
  row: T,
  column: string
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (key !== column) {
      next[key] = value;
    }
  }
  return next;
}

function replaceOrOmitColumn(
  row: Record<string, unknown>,
  missingCol: string,
  aliases: Readonly<Record<string, string>> | undefined,
  triedColumns: Set<string>
): Record<string, unknown> {
  const value = row[missingCol];
  const next = omitColumn(row, missingCol);
  const alias = aliases?.[missingCol];
  if (alias && !triedColumns.has(alias) && !(alias in next)) {
    next[alias] = value;
  }
  return next;
}

function resolveNotNullFallback(
  row: Record<string, unknown>,
  column: string,
  customDefaults?: (row: Record<string, unknown>, col: string) => unknown
): unknown {
  if (customDefaults) {
    const val = customDefaults(row, column);
    if (val !== null && val !== undefined) return val;
  }

  const city = typeof row.city === 'string' && row.city.trim() ? row.city.trim() : null;
  const district =
    typeof row.district === 'string' && row.district.trim() ? row.district.trim() : null;
  const state = typeof row.state === 'string' && row.state.trim() ? row.state.trim() : 'India';
  const name = typeof row.name === 'string' && row.name.trim() ? row.name.trim() : 'Public Office';

  switch (column) {
    case 'city':
      return city || district || state || 'India';
    case 'district':
      return district || city || state || 'India';
    case 'state':
      return state || 'India';
    case 'address':
      return [city, district, state].filter(Boolean).join(', ') || name;
    case 'category':
      return 'government_office';
    case 'source':
      return 'osm';
    case 'verification_status':
      return 'approved';
    case 'report_status':
      return 'active';
    case 'status':
      return 'active';
    case 'crowd_level':
    case 'crowd_status':
      return 'moderate';
    case 'submitted_at':
    case 'reported_at':
    case 'created_at':
      return new Date().toISOString();
    case 'latitude':
    case 'lat':
      return 20.5937;
    case 'longitude':
    case 'lng':
    case 'lon':
      return 78.9629;
    case 'queue_size':
    case 'queue_length':
    case 'queue_size_min':
    case 'queue_size_max':
    case 'people_count':
    case 'waiting_time':
    case 'wait_time':
    case 'waiting_time_min':
    case 'waiting_time_max':
    case 'estimated_wait_minutes':
    case 'suspicious_score':
      return 0;
    default:
      return '';
  }
}

/**
 * Extracts the constraint name from PostgreSQL CHECK constraint violations (23514):
 * 'new row for relation "queue_reports" violates check constraint "queue_reports_crowd_level_check"'
 */
export function extractCheckConstraintName(
  message: string | null | undefined
): string | null {
  if (!message) return null;
  const match = message.match(/violates check constraint "([a-zA-Z0-9_]+)"/i);
  return match?.[1] ?? null;
}

const CROWD_LEVEL_FALLBACKS: Readonly<Record<string, readonly string[]>> = {
  very_low: ['low', 'Low', 'LOW'],
  low: ['Low', 'LOW'],
  moderate: ['medium', 'Medium', 'MEDIUM', 'Moderate', 'MODERATE', 'normal', 'Normal'],
  high: ['High', 'HIGH'],
  very_high: ['high', 'High', 'HIGH', 'severe', 'Severe', 'critical', 'Critical'],
};

const CATEGORY_FALLBACKS: readonly string[] = [
  'government_office',
  'government',
  'other_public_office',
  'other',
];

function nextCheckConstraintFallback(
  row: Record<string, unknown>,
  constraintName: string,
  triedValues: Map<string, Set<string>>,
  initialValues: Map<string, string>
): { column: string; value: unknown } | null {
  const lower = constraintName.toLowerCase();

  if (lower.includes('crowd')) {
    const col = 'crowd_level' in row ? 'crowd_level' : 'crowd_status' in row ? 'crowd_status' : null;
    if (!col) return null;
    const currentVal = String(row[col] ?? '').trim();
    if (!initialValues.has(col)) {
      initialValues.set(col, currentVal);
    }
    const used = triedValues.get(col) ?? new Set<string>([currentVal]);
    used.add(currentVal);
    triedValues.set(col, used);

    const normalizedKey = (initialValues.get(col) || currentVal)
      .toLowerCase()
      .replace(/\s+/g, '_');
    const candidates = CROWD_LEVEL_FALLBACKS[normalizedKey] ?? [
      'moderate',
      'medium',
      'low',
      'high',
      'Medium',
      'Moderate',
      'Low',
      'High',
    ];
    for (const candidate of candidates) {
      if (!used.has(candidate)) {
        used.add(candidate);
        return { column: col, value: candidate };
      }
    }
    return null;
  }

  if (lower.includes('category') && 'category' in row) {
    const col = 'category';
    const currentVal = String(row[col] ?? '').trim();
    const used = triedValues.get(col) ?? new Set<string>([currentVal]);
    used.add(currentVal);
    triedValues.set(col, used);

    for (const candidate of CATEGORY_FALLBACKS) {
      if (!used.has(candidate)) {
        used.add(candidate);
        return { column: col, value: candidate };
      }
    }
    return null;
  }

  return null;
}

export interface SupabaseWriteResult<T> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

/**
 * Executes a single-row Supabase write and retries while:
 * 1) stripping (or aliasing) missing columns reported by PostgREST's schema cache,
 * 2) backfilling safe non-null values if a legacy table has stricter NOT NULL constraints, and
 * 3) adapting legacy CHECK constraint values (e.g. crowd_level `moderate` -> `medium`, `very_high` -> `high`).
 */
export async function runSingleWriteWithColumnFallback<T>(
  initialPayload: Record<string, unknown>,
  optionalColumns: ReadonlySet<string>,
  execute: (payload: Record<string, unknown>) => PromiseLike<SupabaseWriteResult<T>>,
  aliases?: Readonly<Record<string, string>>,
  notNullDefaults?: (row: Record<string, unknown>, col: string) => unknown
): Promise<SupabaseWriteResult<T> & { strippedColumns: string[] }> {
  let currentPayload: Record<string, unknown> = { ...initialPayload };
  const strippedColumns: string[] = [];
  const triedColumns = new Set<string>(Object.keys(initialPayload));
  const backfilledNotNull = new Set<string>();
  const triedCheckValues = new Map<string, Set<string>>();
  const initialCheckValues = new Map<string, string>();
  const maxAttempts = optionalColumns.size + Object.keys(aliases || {}).length + 24;

  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    const result = await execute(currentPayload);
    if (!result.error) {
      return { ...result, strippedColumns };
    }

    const checkName = extractCheckConstraintName(result.error.message);
    if (checkName) {
      const nextVal = nextCheckConstraintFallback(
        currentPayload,
        checkName,
        triedCheckValues,
        initialCheckValues
      );
      if (nextVal) {
        currentPayload = {
          ...currentPayload,
          [nextVal.column]: nextVal.value,
        };
        continue;
      }
    }

    const notNullCol = extractNotNullViolationColumn(result.error.message);
    if (notNullCol && !backfilledNotNull.has(notNullCol)) {
      backfilledNotNull.add(notNullCol);
      currentPayload = {
        ...currentPayload,
        [notNullCol]: resolveNotNullFallback(currentPayload, notNullCol, notNullDefaults),
      };
      continue;
    }

    const missingCol = extractMissingSchemaColumn(result.error.message);
    if (
      !missingCol ||
      !optionalColumns.has(missingCol) ||
      !(missingCol in currentPayload)
    ) {
      return { ...result, strippedColumns };
    }

    strippedColumns.push(missingCol);
    const alias = aliases?.[missingCol];
    currentPayload = replaceOrOmitColumn(currentPayload, missingCol, aliases, triedColumns);
    if (alias) triedColumns.add(alias);
  }

  return {
    data: null,
    error: { message: 'Exceeded schema fallback retry limit.' },
    strippedColumns,
  };
}

/**
 * Executes a batch Supabase write and retries while:
 * 1) stripping (or aliasing) missing columns reported by PostgREST's schema cache,
 * 2) backfilling safe non-null values if a legacy table has stricter NOT NULL constraints, and
 * 3) adapting legacy CHECK constraint values.
 */
export async function runBatchWriteWithColumnFallback<T>(
  initialRows: Record<string, unknown>[],
  optionalColumns: ReadonlySet<string>,
  execute: (rows: Record<string, unknown>[]) => PromiseLike<SupabaseWriteResult<T>>,
  aliases?: Readonly<Record<string, string>>,
  notNullDefaults?: (row: Record<string, unknown>, col: string) => unknown
): Promise<SupabaseWriteResult<T> & { strippedColumns: string[] }> {
  let currentRows = initialRows.map((row) => ({ ...row }));
  const strippedColumns: string[] = [];
  const triedColumns = new Set<string>(
    initialRows.length > 0 ? Object.keys(initialRows[0]) : []
  );
  const backfilledNotNull = new Set<string>();
  const triedCheckValues = new Map<string, Set<string>>();
  const initialCheckValues = new Map<string, string>();
  const maxAttempts = optionalColumns.size + Object.keys(aliases || {}).length + 24;

  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    const result = await execute(currentRows);
    if (!result.error) {
      return { ...result, strippedColumns };
    }

    const checkName = extractCheckConstraintName(result.error.message);
    if (checkName && currentRows.length > 0) {
      const nextVal = nextCheckConstraintFallback(
        currentRows[0],
        checkName,
        triedCheckValues,
        initialCheckValues
      );
      if (nextVal) {
        currentRows = currentRows.map((row) => ({
          ...row,
          [nextVal.column]: nextVal.value,
        }));
        continue;
      }
    }

    const notNullCol = extractNotNullViolationColumn(result.error.message);
    if (notNullCol && !backfilledNotNull.has(notNullCol) && currentRows.length > 0) {
      backfilledNotNull.add(notNullCol);
      currentRows = currentRows.map((row) => {
        if (row[notNullCol] !== null && row[notNullCol] !== undefined) return row;
        return {
          ...row,
          [notNullCol]: resolveNotNullFallback(row, notNullCol, notNullDefaults),
        };
      });
      continue;
    }

    const missingCol = extractMissingSchemaColumn(result.error.message);
    if (
      !missingCol ||
      !optionalColumns.has(missingCol) ||
      currentRows.length === 0 ||
      !(missingCol in currentRows[0])
    ) {
      return { ...result, strippedColumns };
    }

    strippedColumns.push(missingCol);
    const alias = aliases?.[missingCol];
    currentRows = currentRows.map((row) =>
      replaceOrOmitColumn(row, missingCol, aliases, triedColumns)
    );
    if (alias) triedColumns.add(alias);
  }

  return {
    data: null,
    error: { message: 'Exceeded schema fallback retry limit.' },
    strippedColumns,
  };
}
