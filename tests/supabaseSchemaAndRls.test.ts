import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import {
  OFFICE_COLUMN_ALIASES,
  OPTIONAL_OFFICE_COLUMNS,
  OPTIONAL_QUEUE_REPORT_COLUMNS,
  QUEUE_REPORT_COLUMN_ALIASES,
  extractMissingSchemaColumn,
  isMissingSchemaTableError,
  runBatchWriteWithColumnFallback,
  runSingleWriteWithColumnFallback,
} from '../src/lib/schemaFallback.ts';

const migrationsDir = path.resolve(process.cwd(), 'supabase', 'migrations');

describe('Supabase SQL Schema, Triggers & RLS Security Verification', () => {
  const sql001 = fs.readFileSync(path.join(migrationsDir, '001_initial_schema.sql'), 'utf8');
  const sql002 = fs.readFileSync(path.join(migrationsDir, '002_indexes_and_functions.sql'), 'utf8');
  const sql003 = fs.readFileSync(path.join(migrationsDir, '003_rls_policies.sql'), 'utf8');
  const sql004 = fs.readFileSync(
    path.join(migrationsDir, '004_ensure_columns_and_reload.sql'),
    'utf8'
  );

  it('defines all required tables with UUID primary keys and PostGIS support', () => {
    expect(sql001).toContain('CREATE EXTENSION IF NOT EXISTS postgis');
    for (const table of [
      'public.profiles',
      'public.admin_roles',
      'public.offices',
      'public.queue_reports',
      'public.office_suggestions',
      'public.report_flags',
      'public.office_aggregates',
    ]) {
      expect(sql001).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    expect(sql001).toContain('offices_osm_source_unique_idx');
  });

  it('includes a complete all-in-one idempotent repair migration covering all 8 tables, FKs, triggers, RPCs, views, RLS, grants, and PostgREST cache reload', () => {
    for (const table of [
      'public.profiles',
      'public.admin_roles',
      'public.offices',
      'public.queue_reports',
      'public.office_suggestions',
      'public.report_flags',
      'public.office_aggregates',
      'public.api_error_logs',
    ]) {
      expect(sql004).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
      expect(sql004).toContain(`ALTER TABLE ${table}`);
      expect(sql004).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    }
    expect(sql004).toContain('ADD COLUMN IF NOT EXISTS district TEXT');
    expect(sql004).toContain('ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION');
    expect(sql004).toContain('ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION');
    expect(sql004).toContain('ADD COLUMN IF NOT EXISTS slug TEXT');
    expect(sql004).toContain('DROP NOT NULL');
    expect(sql004).toContain('recalculate_office_aggregate');
    expect(sql004).toContain('find_nearby_offices');
    expect(sql004).toContain('public_queue_reports');
    expect(sql004).toContain("NOTIFY pgrst, 'reload schema'");
  });

  it('implements server-side rate limiting, duplicate prevention, and aggregate calculation triggers', () => {
    expect(sql002).toContain('validate_queue_report_insert');
    expect(sql002).toContain("INTERVAL '15 minutes'");
    expect(sql002).toContain('recalculate_office_aggregate');
    expect(sql002).toContain('approve_office_suggestion');
    expect(sql002).toContain('reject_office_suggestion');
    expect(sql002).toContain('find_nearby_offices');
    expect(sql002).toContain('public_queue_reports');
  });

  it('enables RLS on every table and blocks direct client writes to office_aggregates and admin_roles', () => {
    for (const table of [
      'public.profiles',
      'public.admin_roles',
      'public.offices',
      'public.queue_reports',
      'public.office_suggestions',
      'public.report_flags',
      'public.office_aggregates',
    ]) {
      expect(sql003).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    }

    // Ensure NO client INSERT/UPDATE/DELETE policies exist on office_aggregates or admin_roles
    expect(sql003).not.toMatch(/ON public\.office_aggregates FOR (INSERT|UPDATE|DELETE)/i);
    expect(sql003).not.toMatch(/ON public\.admin_roles FOR (INSERT|UPDATE|DELETE)/i);

    // Ensure office suggestion approvals require is_admin
    expect(sql002).toContain('IF NOT public.is_admin(auth.uid()) THEN');
  });

  it('recovers gracefully when PostgREST reports a missing table or optional column', async () => {
    expect(
      isMissingSchemaTableError(
        "Could not find the table 'public.profiles' in the schema cache",
        'profiles'
      )
    ).toBe(true);
    expect(
      isMissingSchemaTableError(
        'relation "public.profiles" does not exist',
        'profiles'
      )
    ).toBe(true);
    expect(
      isMissingSchemaTableError(
        "Could not find the 'district' column of 'offices' in the schema cache",
        'profiles'
      )
    ).toBe(false);

    expect(
      extractMissingSchemaColumn(
        "Could not find the 'district' column of 'offices' in the schema cache"
      )
    ).toBe('district');

    const attempts: Record<string, unknown>[] = [];
    const singleResult = await runSingleWriteWithColumnFallback(
      {
        name: 'District Collectorate',
        slug: 'district-collectorate-123',
        district: 'Pune',
        postal_code: '411001',
        state: 'Maharashtra',
      },
      OPTIONAL_OFFICE_COLUMNS,
      async (row) => {
        attempts.push(row);
        if ('district' in row) {
          return {
            data: null,
            error: {
              message: "Could not find the 'district' column of 'offices' in the schema cache",
            },
          };
        }
        return { data: { id: 'uuid-1', slug: String(row.slug) }, error: null };
      }
    );

    expect(singleResult.error).toBeNull();
    expect(singleResult.data).toEqual({ id: 'uuid-1', slug: 'district-collectorate-123' });
    expect(singleResult.strippedColumns).toEqual(['district']);
    expect(attempts).toHaveLength(2);
    expect('district' in attempts[1]).toBe(false);

    const batchResult = await runBatchWriteWithColumnFallback(
      [
        { name: 'Post Office A', slug: 'po-a', district: 'Jaipur' },
        { name: 'Post Office B', slug: 'po-b', district: 'Jaipur' },
      ],
      OPTIONAL_OFFICE_COLUMNS,
      async (rows) => {
        if ('district' in rows[0]) {
          return {
            data: null,
            error: {
              message: "Could not find the 'district' column of 'offices' in the schema cache",
            },
          };
        }
        return { data: rows, error: null };
      }
    );

    expect(batchResult.error).toBeNull();
    expect(batchResult.strippedColumns).toEqual(['district']);

    // Handles missing `latitude`/`longitude` by aliasing to `lat`/`lng` when present,
    // or stripping both cleanly if neither exists in the legacy table.
    const aliasResult = await runSingleWriteWithColumnFallback(
      { name: 'RTO Pune', latitude: 18.52, longitude: 73.85 },
      OPTIONAL_OFFICE_COLUMNS,
      async (row) => {
        if ('latitude' in row) {
          return {
            data: null,
            error: {
              message: "Could not find the 'latitude' column of 'offices' in the schema cache",
            },
          };
        }
        if ('longitude' in row) {
          return {
            data: null,
            error: {
              message: "Could not find the 'longitude' column of 'offices' in the schema cache",
            },
          };
        }
        return { data: row, error: null };
      },
      OFFICE_COLUMN_ALIASES
    );

    expect(aliasResult.error).toBeNull();
    expect(aliasResult.data).toEqual({ name: 'RTO Pune', lat: 18.52, lng: 73.85 });

    // Handles legacy NOT NULL constraints such as `city` being null on raw OSM nodes
    const notNullResult = await runSingleWriteWithColumnFallback(
      { name: 'Gram Panchayat Office', city: null, district: 'Satara', state: 'Maharashtra' },
      OPTIONAL_OFFICE_COLUMNS,
      async (row) => {
        if (!row.city) {
          return {
            data: null,
            error: {
              code: '23502',
              message: 'null value in column "city" of relation "offices" violates not-null constraint',
            },
          };
        }
        return { data: row, error: null };
      }
    );

    expect(notNullResult.error).toBeNull();
    expect(notNullResult.data).toMatchObject({ city: 'Satara', state: 'Maharashtra' });

    // Handles missing `user_id` column in legacy `queue_reports` tables cleanly
    const queueReportResult = await runSingleWriteWithColumnFallback(
      {
        office_id: 'office-uuid-1',
        user_id: 'user-uuid-1',
        queue_size_min: 10,
        queue_size_max: 20,
        waiting_time_min: 15,
        waiting_time_max: 25,
        crowd_level: 'moderate',
      },
      OPTIONAL_QUEUE_REPORT_COLUMNS,
      async (row) => {
        if ('user_id' in row) {
          return {
            data: null,
            error: {
              message: "Could not find the 'user_id' column of 'queue_reports' in the schema cache",
            },
          };
        }
        if ('reported_by' in row) {
          return {
            data: null,
            error: {
              message:
                "Could not find the 'reported_by' column of 'queue_reports' in the schema cache",
            },
          };
        }
        return { data: { id: 'report-uuid-1', ...row }, error: null };
      },
      QUEUE_REPORT_COLUMN_ALIASES
    );

    expect(queueReportResult.error).toBeNull();
    expect(queueReportResult.data).toMatchObject({
      id: 'report-uuid-1',
      office_id: 'office-uuid-1',
      submitted_by: 'user-uuid-1',
    });

    // Handles legacy CHECK constraint on `queue_reports.crowd_level` (e.g. only low/medium/high)
    const checkConstraintResult = await runSingleWriteWithColumnFallback(
      {
        office_id: 'office-uuid-1',
        crowd_level: 'moderate',
      },
      OPTIONAL_QUEUE_REPORT_COLUMNS,
      async (row) => {
        if (!['low', 'medium', 'high'].includes(String(row.crowd_level))) {
          return {
            data: null,
            error: {
              code: '23514',
              message:
                'new row for relation "queue_reports" violates check constraint "queue_reports_crowd_level_check"',
            },
          };
        }
        return { data: { id: 'report-uuid-2', ...row }, error: null };
      },
      QUEUE_REPORT_COLUMN_ALIASES
    );

    expect(checkConstraintResult.error).toBeNull();
    expect(checkConstraintResult.data).toEqual({
      id: 'report-uuid-2',
      office_id: 'office-uuid-1',
      crowd_level: 'medium',
    });
  });

  const liveUrl = process.env.VITE_SUPABASE_URL;
  const liveAnon = process.env.VITE_SUPABASE_ANON_KEY;

  it.skipIf(!liveUrl || !liveAnon)(
    'live Supabase RLS check: rejects unauthenticated writes to office_aggregates and office_suggestions',
    async () => {
      const client = createClient(liveUrl!, liveAnon!);

      const aggInsert = await client.from('office_aggregates').insert({
        office_id: '00000000-0000-0000-0000-000000000000',
        current_crowd_level: 'low',
        confidence_level: 'high',
        recent_report_count: 99,
      });
      expect(aggInsert.error).not.toBeNull();

      const approveCall = await client.rpc('approve_office_suggestion', {
        p_suggestion_id: '00000000-0000-0000-0000-000000000000',
      });
      expect(approveCall.error).not.toBeNull();
    }
  );
});
