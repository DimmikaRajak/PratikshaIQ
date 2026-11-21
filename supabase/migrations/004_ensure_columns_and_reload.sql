-- PratikshaIQ Migration 004: Complete All-in-One Idempotent Database Repair & Setup
-- Safe to run on ANY fresh OR pre-existing Supabase project.
-- Creates all missing tables, adds every required column, relaxes legacy NOT NULL / CHECK
-- conflicts, ensures foreign keys, indexes, triggers, RPC functions, public view, RLS policies,
-- table grants, Realtime publication, aggregate backfill, and reloads PostgREST schema cache.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================================
-- 1. PUBLIC.PROFILES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  preferred_language TEXT NOT NULL DEFAULT 'en',
  is_suspended BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS preferred_language TEXT NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill profile rows for existing authenticated users
INSERT INTO public.profiles (id, display_name, preferred_language)
SELECT
  u.id,
  COALESCE(
    NULLIF(TRIM(u.raw_user_meta_data ->> 'display_name'), ''),
    NULLIF(TRIM(u.raw_user_meta_data ->> 'full_name'), ''),
    SPLIT_PART(COALESCE(u.email, ''), '@', 1)
  ),
  CASE WHEN u.raw_user_meta_data ->> 'preferred_language' = 'hi' THEN 'hi' ELSE 'en' END
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 2. PUBLIC.ADMIN_ROLES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.admin_roles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'moderator',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.admin_roles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'moderator',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE OR REPLACE FUNCTION public.is_admin(uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_roles WHERE user_id = uid
  );
$$;

-- ============================================================================
-- 3. PUBLIC.OFFICES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.offices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  category TEXT NOT NULL DEFAULT 'government_office',
  address TEXT,
  city TEXT,
  district TEXT,
  state TEXT NOT NULL DEFAULT 'India',
  postal_code TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  location GEOGRAPHY(Point, 4326) GENERATED ALWAYS AS (
    CASE
      WHEN latitude IS NOT NULL AND longitude IS NOT NULL
      THEN ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
      ELSE NULL
    END
  ) STORED,
  source TEXT NOT NULL DEFAULT 'osm',
  osm_type TEXT,
  osm_id BIGINT,
  official_website TEXT,
  phone TEXT,
  verification_status TEXT NOT NULL DEFAULT 'approved',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.offices
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'government_office',
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS district TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT NOT NULL DEFAULT 'India',
  ADD COLUMN IF NOT EXISTS postal_code TEXT,
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'osm',
  ADD COLUMN IF NOT EXISTS osm_type TEXT,
  ADD COLUMN IF NOT EXISTS osm_id BIGINT,
  ADD COLUMN IF NOT EXISTS official_website TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Relax legacy NOT NULL constraints & stale CHECK constraints on public.offices,
-- migrate legacy lat/lng/lon coordinates, add PostGIS location column, and backfill slugs.
DO $$
DECLARE
  col_rec RECORD;
  chk_rec RECORD;
BEGIN
  -- Drop NOT NULL on any non-identity, non-generated column other than `id` and `name` so OSM records never fail
  FOR col_rec IN
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'offices'
      AND is_nullable = 'NO'
      AND COALESCE(is_identity, 'NO') = 'NO'
      AND COALESCE(is_generated, 'NEVER') = 'NEVER'
      AND column_name NOT IN ('id', 'name')
  LOOP
    EXECUTE format('ALTER TABLE public.offices ALTER COLUMN %I DROP NOT NULL', col_rec.column_name);
  END LOOP;

  -- Drop legacy check constraints on category/source/verification_status that might reject valid OSM values
  FOR chk_rec IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.offices'::regclass
      AND contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE public.offices DROP CONSTRAINT IF EXISTS %I', chk_rec.conname);
  END LOOP;

  -- Backfill latitude/longitude from legacy lat/lng or lon columns if present
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'offices' AND column_name = 'lat'
  ) THEN
    EXECUTE 'UPDATE public.offices SET latitude = lat WHERE latitude IS NULL AND lat IS NOT NULL';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'offices' AND column_name = 'lng'
  ) THEN
    EXECUTE 'UPDATE public.offices SET longitude = lng WHERE longitude IS NULL AND lng IS NOT NULL';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'offices' AND column_name = 'lon'
  ) THEN
    EXECUTE 'UPDATE public.offices SET longitude = lon WHERE longitude IS NULL AND lon IS NOT NULL';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'offices' AND column_name = 'location'
  ) THEN
    ALTER TABLE public.offices
      ADD COLUMN location GEOGRAPHY(Point, 4326) GENERATED ALWAYS AS (
        CASE
          WHEN latitude IS NOT NULL AND longitude IS NOT NULL
          THEN ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
          ELSE NULL
        END
      ) STORED;
  END IF;

  -- Backfill defaults on any legacy rows
  UPDATE public.offices SET state = 'India' WHERE state IS NULL OR trim(state) = '';
  UPDATE public.offices SET source = 'osm' WHERE source IS NULL OR trim(source) = '';
  UPDATE public.offices SET category = 'government_office' WHERE category IS NULL OR trim(category) = '';
  UPDATE public.offices SET verification_status = 'approved' WHERE verification_status IS NULL OR trim(verification_status) = '';
  UPDATE public.offices
  SET slug = lower(regexp_replace(COALESCE(name, 'office'), '[^a-zA-Z0-9]+', '-', 'g'))
             || '-' || substr(id::text, 1, 8)
  WHERE slug IS NULL OR trim(slug) = '';
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS offices_slug_unique_idx ON public.offices (slug);
CREATE UNIQUE INDEX IF NOT EXISTS offices_osm_source_unique_idx
  ON public.offices (source, osm_type, osm_id)
  WHERE osm_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS offices_location_gist_idx ON public.offices USING GIST (location);
CREATE INDEX IF NOT EXISTS offices_lat_lon_idx ON public.offices (latitude, longitude);
CREATE INDEX IF NOT EXISTS offices_state_city_idx ON public.offices (state, city);
CREATE INDEX IF NOT EXISTS offices_category_idx ON public.offices (category);
CREATE INDEX IF NOT EXISTS offices_osm_lookup_idx ON public.offices (osm_type, osm_id);
CREATE INDEX IF NOT EXISTS offices_postal_code_idx ON public.offices (postal_code) WHERE postal_code IS NOT NULL;

-- ============================================================================
-- 4. PUBLIC.QUEUE_REPORTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.queue_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  queue_size_min INT NOT NULL DEFAULT 0,
  queue_size_max INT NOT NULL DEFAULT 0,
  waiting_time_min INT NOT NULL DEFAULT 0,
  waiting_time_max INT NOT NULL DEFAULT 0,
  crowd_level TEXT NOT NULL DEFAULT 'moderate',
  note TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  report_status TEXT NOT NULL DEFAULT 'active',
  suspicious_score SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.queue_reports
  ADD COLUMN IF NOT EXISTS office_id UUID,
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS queue_size_min INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS queue_size_max INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS waiting_time_min INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS waiting_time_max INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS crowd_level TEXT NOT NULL DEFAULT 'moderate',
  ADD COLUMN IF NOT EXISTS note TEXT,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS report_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS suspicious_score SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
DECLARE
  col_rec RECORD;
  chk_rec RECORD;
BEGIN
  -- Relax any legacy NOT NULL constraints on queue_reports columns other than id and office_id
  FOR col_rec IN
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'queue_reports'
      AND is_nullable = 'NO'
      AND COALESCE(is_identity, 'NO') = 'NO'
      AND COALESCE(is_generated, 'NEVER') = 'NEVER'
      AND column_name NOT IN ('id', 'office_id')
  LOOP
    EXECUTE format('ALTER TABLE public.queue_reports ALTER COLUMN %I DROP NOT NULL', col_rec.column_name);
  END LOOP;

  -- Drop any stale CHECK constraints on queue_reports from an older schema
  FOR chk_rec IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.queue_reports'::regclass
      AND contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE public.queue_reports DROP CONSTRAINT IF EXISTS %I', chk_rec.conname);
  END LOOP;

  -- Backfill user_id from legacy columns if present
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'queue_reports' AND column_name = 'reported_by'
  ) THEN
    EXECUTE 'UPDATE public.queue_reports SET user_id = reported_by WHERE user_id IS NULL AND reported_by IS NOT NULL';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'queue_reports' AND column_name = 'submitted_by'
  ) THEN
    EXECUTE 'UPDATE public.queue_reports SET user_id = submitted_by WHERE user_id IS NULL AND submitted_by IS NOT NULL';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'queue_reports' AND column_name = 'created_by'
  ) THEN
    EXECUTE 'UPDATE public.queue_reports SET user_id = created_by WHERE user_id IS NULL AND created_by IS NOT NULL';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.queue_reports'::regclass
      AND contype = 'f'
      AND confrelid = 'public.offices'::regclass
  ) THEN
    ALTER TABLE public.queue_reports
      ADD CONSTRAINT queue_reports_office_id_fkey
      FOREIGN KEY (office_id) REFERENCES public.offices(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS queue_reports_office_time_idx
  ON public.queue_reports (office_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS queue_reports_user_time_idx
  ON public.queue_reports (user_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS queue_reports_status_idx
  ON public.queue_reports (report_status, submitted_at DESC);

-- ============================================================================
-- 5. PUBLIC.OFFICE_SUGGESTIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.office_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suggested_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  office_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'government_office',
  address TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  district TEXT,
  state TEXT NOT NULL DEFAULT 'India',
  postal_code TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  official_website TEXT,
  phone TEXT,
  review_status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  reviewer_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.office_suggestions
  ADD COLUMN IF NOT EXISTS suggested_by UUID,
  ADD COLUMN IF NOT EXISTS office_name TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'government_office',
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS district TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT NOT NULL DEFAULT 'India',
  ADD COLUMN IF NOT EXISTS postal_code TEXT,
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS official_website TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reviewed_by UUID,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewer_notes TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
DECLARE
  col_rec RECORD;
BEGIN
  FOR col_rec IN
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'office_suggestions'
      AND is_nullable = 'NO'
      AND COALESCE(is_identity, 'NO') = 'NO'
      AND COALESCE(is_generated, 'NEVER') = 'NEVER'
      AND column_name NOT IN ('id')
  LOOP
    EXECUTE format('ALTER TABLE public.office_suggestions ALTER COLUMN %I DROP NOT NULL', col_rec.column_name);
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS office_suggestions_status_idx
  ON public.office_suggestions (review_status, created_at DESC);

-- ============================================================================
-- 6. PUBLIC.REPORT_FLAGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.report_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.queue_reports(id) ON DELETE CASCADE,
  reported_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.report_flags
  ADD COLUMN IF NOT EXISTS report_id UUID,
  ADD COLUMN IF NOT EXISTS reported_by UUID,
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.report_flags'::regclass
      AND contype = 'f'
      AND confrelid = 'public.queue_reports'::regclass
  ) THEN
    ALTER TABLE public.report_flags
      ADD CONSTRAINT report_flags_report_id_fkey
      FOREIGN KEY (report_id) REFERENCES public.queue_reports(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS report_flags_status_idx
  ON public.report_flags (status, created_at DESC);

-- ============================================================================
-- 7. PUBLIC.OFFICE_AGGREGATES
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.office_aggregates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID UNIQUE NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  current_crowd_level TEXT NOT NULL DEFAULT 'unknown',
  estimated_waiting_minutes NUMERIC(6, 1),
  average_queue_size NUMERIC(6, 1),
  confidence_level TEXT NOT NULL DEFAULT 'no_data',
  recent_report_count INT NOT NULL DEFAULT 0,
  last_report_at TIMESTAMPTZ,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.office_aggregates
  ADD COLUMN IF NOT EXISTS office_id UUID,
  ADD COLUMN IF NOT EXISTS current_crowd_level TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS estimated_waiting_minutes NUMERIC(6, 1),
  ADD COLUMN IF NOT EXISTS average_queue_size NUMERIC(6, 1),
  ADD COLUMN IF NOT EXISTS confidence_level TEXT NOT NULL DEFAULT 'no_data',
  ADD COLUMN IF NOT EXISTS recent_report_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_report_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.office_aggregates'::regclass
      AND contype = 'f'
      AND confrelid = 'public.offices'::regclass
  ) THEN
    ALTER TABLE public.office_aggregates
      ADD CONSTRAINT office_aggregates_office_id_fkey
      FOREIGN KEY (office_id) REFERENCES public.offices(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS office_aggregates_office_id_unique_idx
  ON public.office_aggregates (office_id);

-- ============================================================================
-- 8. PUBLIC.API_ERROR_LOGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.api_error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  error_message TEXT NOT NULL,
  status_code INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.api_error_logs
  ADD COLUMN IF NOT EXISTS service TEXT,
  ADD COLUMN IF NOT EXISTS endpoint TEXT,
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS status_code INT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ============================================================================
-- 9. TRIGGERS, QUEUE INTELLIGENCE ENGINE & RPC FUNCTIONS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS offices_set_updated_at ON public.offices;
CREATE TRIGGER offices_set_updated_at
  BEFORE UPDATE ON public.offices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, preferred_language)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(COALESCE(NEW.email, ''), '@', 1)),
    CASE WHEN NEW.raw_user_meta_data ->> 'preferred_language' = 'hi' THEN 'hi' ELSE 'en' END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.validate_queue_report_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_suspended BOOLEAN := FALSE;
  v_duplicate_count INT := 0;
  v_hourly_count INT := 0;
  v_distinct_offices_20m INT := 0;
  v_score SMALLINT := 0;
BEGIN
  SELECT COALESCE(is_suspended, FALSE) INTO v_suspended
  FROM public.profiles
  WHERE id = NEW.user_id;

  IF v_suspended THEN
    RAISE EXCEPTION 'Account is temporarily suspended from submitting reports.'
      USING ERRCODE = '42501';
  END IF;

  NEW.submitted_at := NOW();
  NEW.created_at := NOW();
  NEW.report_status := 'active';

  SELECT COUNT(*) INTO v_duplicate_count
  FROM public.queue_reports
  WHERE user_id = NEW.user_id
    AND office_id = NEW.office_id
    AND submitted_at > NOW() - INTERVAL '15 minutes';

  IF v_duplicate_count > 0 THEN
    RAISE EXCEPTION 'You have already submitted a report for this office within the last 15 minutes.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT COUNT(*) INTO v_hourly_count
  FROM public.queue_reports
  WHERE user_id = NEW.user_id
    AND submitted_at > NOW() - INTERVAL '1 hour';

  IF v_hourly_count >= 8 THEN
    RAISE EXCEPTION 'Hourly submission limit reached. Please try again later.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT COUNT(DISTINCT office_id) INTO v_distinct_offices_20m
  FROM public.queue_reports
  WHERE user_id = NEW.user_id
    AND office_id <> NEW.office_id
    AND submitted_at > NOW() - INTERVAL '20 minutes';

  IF v_distinct_offices_20m >= 2 THEN
    v_score := LEAST(100, v_score + 45);
  END IF;

  IF NEW.waiting_time_max >= 180 AND NEW.crowd_level IN ('very_low', 'low') THEN
    v_score := LEAST(100, v_score + 35);
  END IF;

  IF NEW.waiting_time_max <= 15 AND NEW.crowd_level = 'very_high' THEN
    v_score := LEAST(100, v_score + 35);
  END IF;

  NEW.suspicious_score := v_score;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS queue_reports_validate_insert ON public.queue_reports;
CREATE TRIGGER queue_reports_validate_insert
  BEFORE INSERT ON public.queue_reports
  FOR EACH ROW EXECUTE FUNCTION public.validate_queue_report_insert();

CREATE OR REPLACE FUNCTION public.recalculate_office_aggregate(p_office_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT := 0;
  v_total_weight NUMERIC := 0;
  v_weighted_wait NUMERIC := 0;
  v_weighted_queue NUMERIC := 0;
  v_weighted_crowd NUMERIC := 0;
  v_std_dev NUMERIC := 0;
  v_last_report TIMESTAMPTZ := NULL;
  v_recent_30m INT := 0;
  v_crowd_label TEXT := 'unknown';
  v_confidence TEXT := 'no_data';
BEGIN
  WITH latest_per_user AS (
    SELECT DISTINCT ON (qr.user_id)
      qr.id,
      qr.user_id,
      (qr.waiting_time_min + qr.waiting_time_max) / 2.0 AS wait_mid,
      (qr.queue_size_min + qr.queue_size_max) / 2.0 AS queue_mid,
      CASE qr.crowd_level
        WHEN 'very_low' THEN 1.0
        WHEN 'low' THEN 2.0
        WHEN 'moderate' THEN 3.0
        WHEN 'high' THEN 4.0
        WHEN 'very_high' THEN 5.0
        ELSE 3.0
      END AS crowd_num,
      qr.submitted_at,
      EXTRACT(EPOCH FROM (NOW() - qr.submitted_at)) / 60.0 AS age_minutes
    FROM public.queue_reports qr
    WHERE qr.office_id = p_office_id
      AND qr.report_status = 'active'
      AND qr.submitted_at >= NOW() - INTERVAL '120 minutes'
    ORDER BY qr.user_id, qr.submitted_at DESC
  ),
  weighted AS (
    SELECT
      *,
      CASE
        WHEN age_minutes <= 15 THEN 1.00
        WHEN age_minutes <= 30 THEN 0.75
        WHEN age_minutes <= 60 THEN 0.45
        ELSE 0.20
      END AS weight
    FROM latest_per_user
  )
  SELECT
    COUNT(*),
    COALESCE(SUM(weight), 0),
    CASE WHEN SUM(weight) > 0 THEN SUM(wait_mid * weight) / SUM(weight) ELSE NULL END,
    CASE WHEN SUM(weight) > 0 THEN SUM(queue_mid * weight) / SUM(weight) ELSE NULL END,
    CASE WHEN SUM(weight) > 0 THEN SUM(crowd_num * weight) / SUM(weight) ELSE NULL END,
    MAX(submitted_at),
    COUNT(*) FILTER (WHERE age_minutes <= 30),
    COALESCE(STDDEV_POP(crowd_num), 0)
  INTO
    v_count,
    v_total_weight,
    v_weighted_wait,
    v_weighted_queue,
    v_weighted_crowd,
    v_last_report,
    v_recent_30m,
    v_std_dev
  FROM weighted;

  IF v_count = 0 THEN
    v_crowd_label := 'unknown';
    v_confidence := 'no_data';
    v_weighted_wait := NULL;
    v_weighted_queue := NULL;
  ELSE
    IF v_weighted_crowd < 1.5 THEN
      v_crowd_label := 'very_low';
    ELSIF v_weighted_crowd < 2.5 THEN
      v_crowd_label := 'low';
    ELSIF v_weighted_crowd < 3.5 THEN
      v_crowd_label := 'moderate';
    ELSIF v_weighted_crowd < 4.5 THEN
      v_crowd_label := 'high';
    ELSE
      v_crowd_label := 'very_high';
    END IF;

    IF v_count >= 4 AND v_recent_30m >= 2 AND v_std_dev <= 0.9 THEN
      v_confidence := 'high';
    ELSIF v_count >= 2 AND v_total_weight >= 1.1 AND v_std_dev <= 1.2 THEN
      v_confidence := 'medium';
    ELSE
      v_confidence := 'low';
    END IF;
  END IF;

  INSERT INTO public.office_aggregates (
    office_id,
    current_crowd_level,
    estimated_waiting_minutes,
    average_queue_size,
    confidence_level,
    recent_report_count,
    last_report_at,
    calculated_at
  ) VALUES (
    p_office_id,
    v_crowd_label,
    CASE WHEN v_weighted_wait IS NULL THEN NULL ELSE ROUND(v_weighted_wait, 1) END,
    CASE WHEN v_weighted_queue IS NULL THEN NULL ELSE ROUND(v_weighted_queue, 1) END,
    v_confidence,
    v_count,
    v_last_report,
    NOW()
  )
  ON CONFLICT (office_id) DO UPDATE SET
    current_crowd_level = EXCLUDED.current_crowd_level,
    estimated_waiting_minutes = EXCLUDED.estimated_waiting_minutes,
    average_queue_size = EXCLUDED.average_queue_size,
    confidence_level = EXCLUDED.confidence_level,
    recent_report_count = EXCLUDED.recent_report_count,
    last_report_at = EXCLUDED.last_report_at,
    calculated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_recalculate_office_aggregate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalculate_office_aggregate(OLD.office_id);
    RETURN OLD;
  ELSE
    PERFORM public.recalculate_office_aggregate(NEW.office_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS queue_reports_recalc_trigger ON public.queue_reports;
CREATE TRIGGER queue_reports_recalc_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.queue_reports
  FOR EACH ROW EXECUTE FUNCTION public.trigger_recalculate_office_aggregate();

CREATE OR REPLACE FUNCTION public.approve_office_suggestion(
  p_suggestion_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_suggestion public.office_suggestions%ROWTYPE;
  v_slug TEXT;
  v_office_id UUID;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Administrator access required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_suggestion
  FROM public.office_suggestions
  WHERE id = p_suggestion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Office suggestion not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_suggestion.review_status <> 'pending' THEN
    RAISE EXCEPTION 'Office suggestion has already been reviewed.' USING ERRCODE = 'P0001';
  END IF;

  v_slug := lower(regexp_replace(v_suggestion.office_name || '-' || COALESCE(v_suggestion.city, 'india'), '[^a-zA-Z0-9]+', '-', 'g'))
            || '-' || substr(gen_random_uuid()::text, 1, 8);

  INSERT INTO public.offices (
    name, slug, category, address, city, district, state, postal_code,
    latitude, longitude, source, official_website, phone,
    verification_status, created_by
  ) VALUES (
    v_suggestion.office_name,
    v_slug,
    v_suggestion.category,
    v_suggestion.address,
    v_suggestion.city,
    v_suggestion.district,
    v_suggestion.state,
    NULLIF(v_suggestion.postal_code, ''),
    v_suggestion.latitude,
    v_suggestion.longitude,
    'citizen_suggestion',
    NULLIF(v_suggestion.official_website, ''),
    NULLIF(v_suggestion.phone, ''),
    'approved',
    v_suggestion.suggested_by
  )
  RETURNING id INTO v_office_id;

  UPDATE public.office_suggestions
  SET
    review_status = 'approved',
    reviewed_by = auth.uid(),
    reviewed_at = NOW(),
    reviewer_notes = p_notes
  WHERE id = p_suggestion_id;

  RETURN v_office_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_office_suggestion(
  p_suggestion_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Administrator access required.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.office_suggestions
  SET
    review_status = 'rejected',
    reviewed_by = auth.uid(),
    reviewed_at = NOW(),
    reviewer_notes = p_notes
  WHERE id = p_suggestion_id AND review_status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending office suggestion not found.' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.find_nearby_offices(DOUBLE PRECISION, DOUBLE PRECISION, INT, TEXT, INT);
CREATE OR REPLACE FUNCTION public.find_nearby_offices(
  p_lat DOUBLE PRECISION,
  p_lon DOUBLE PRECISION,
  p_radius_meters INT DEFAULT 5000,
  p_category TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  category TEXT,
  address TEXT,
  city TEXT,
  district TEXT,
  state TEXT,
  postal_code TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  source TEXT,
  osm_type TEXT,
  osm_id BIGINT,
  official_website TEXT,
  phone TEXT,
  verification_status TEXT,
  distance_meters DOUBLE PRECISION,
  current_crowd_level TEXT,
  estimated_waiting_minutes NUMERIC,
  average_queue_size NUMERIC,
  confidence_level TEXT,
  recent_report_count INT,
  last_report_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    o.id, o.name, o.slug, o.category, o.address, o.city, o.district, o.state,
    o.postal_code, o.latitude, o.longitude, o.source, o.osm_type, o.osm_id,
    o.official_website, o.phone, o.verification_status,
    ST_Distance(
      ST_SetSRID(ST_MakePoint(o.longitude, o.latitude), 4326)::geography,
      ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography
    ) AS distance_meters,
    COALESCE(a.current_crowd_level, 'unknown') AS current_crowd_level,
    a.estimated_waiting_minutes,
    a.average_queue_size,
    COALESCE(a.confidence_level, 'no_data') AS confidence_level,
    COALESCE(a.recent_report_count, 0) AS recent_report_count,
    a.last_report_at
  FROM public.offices o
  LEFT JOIN public.office_aggregates a ON a.office_id = o.id
  WHERE COALESCE(o.verification_status, 'approved') = 'approved'
    AND o.latitude IS NOT NULL
    AND o.longitude IS NOT NULL
    AND (p_category IS NULL OR p_category = 'all' OR o.category = p_category)
    AND ST_DWithin(
      ST_SetSRID(ST_MakePoint(o.longitude, o.latitude), 4326)::geography,
      ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography,
      LEAST(GREATEST(p_radius_meters, 500), 50000)
    )
  ORDER BY distance_meters ASC
  LIMIT LEAST(GREATEST(p_limit, 1), 100);
$$;

-- ============================================================================
-- 10. PUBLIC ANONYMIZED VIEW, GRANTS & ROW LEVEL SECURITY
-- ============================================================================
DROP VIEW IF EXISTS public.public_queue_reports;
CREATE VIEW public.public_queue_reports AS
SELECT
  id,
  office_id,
  queue_size_min,
  queue_size_max,
  waiting_time_min,
  waiting_time_max,
  crowd_level,
  note,
  submitted_at,
  report_status
FROM public.queue_reports
WHERE COALESCE(report_status, 'active') = 'active';

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.offices, public.office_aggregates, public.public_queue_reports TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.admin_roles TO authenticated;
GRANT SELECT, INSERT ON public.queue_reports, public.office_suggestions, public.report_flags TO authenticated;
GRANT SELECT ON public.queue_reports TO anon;
GRANT SELECT ON public.api_error_logs TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_nearby_offices(DOUBLE PRECISION, DOUBLE PRECISION, INT, TEXT, INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_office_suggestion(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_office_suggestion(UUID, TEXT) TO authenticated;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_aggregates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_error_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_select_own_or_admin"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id AND is_suspended = FALSE);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND is_suspended = (SELECT p.is_suspended FROM public.profiles p WHERE p.id = auth.uid())
  );

DROP POLICY IF EXISTS "profiles_admin_update" ON public.profiles;
CREATE POLICY "profiles_admin_update"
  ON public.profiles FOR UPDATE
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admin_roles_select_self_or_admin" ON public.admin_roles;
CREATE POLICY "admin_roles_select_self_or_admin"
  ON public.admin_roles FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "offices_public_select_approved" ON public.offices;
CREATE POLICY "offices_public_select_approved"
  ON public.offices FOR SELECT
  USING (verification_status = 'approved' OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "offices_admin_insert" ON public.offices;
CREATE POLICY "offices_admin_insert"
  ON public.offices FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "offices_admin_update" ON public.offices;
CREATE POLICY "offices_admin_update"
  ON public.offices FOR UPDATE
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "offices_admin_delete" ON public.offices;
CREATE POLICY "offices_admin_delete"
  ON public.offices FOR DELETE
  USING (public.is_admin(auth.uid()));

-- Drop any stale restrictive RLS policies on queue_reports from an older schema
DO $$
DECLARE
  pol_rec RECORD;
BEGIN
  FOR pol_rec IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'queue_reports'
      AND permissive = 'RESTRICTIVE'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.queue_reports', pol_rec.policyname);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "queue_reports_select_active_own_or_admin" ON public.queue_reports;
CREATE POLICY "queue_reports_select_active_own_or_admin"
  ON public.queue_reports FOR SELECT
  USING (
    COALESCE(report_status, 'active') = 'active'
    OR auth.uid() = user_id
    OR public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "queue_reports_authenticated_insert" ON public.queue_reports;
CREATE POLICY "queue_reports_authenticated_insert"
  ON public.queue_reports FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (user_id IS NULL OR auth.uid() = user_id)
    AND COALESCE(report_status, 'active') = 'active'
  );

DROP POLICY IF EXISTS "queue_reports_admin_update" ON public.queue_reports;
CREATE POLICY "queue_reports_admin_update"
  ON public.queue_reports FOR UPDATE
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "queue_reports_admin_delete" ON public.queue_reports;
CREATE POLICY "queue_reports_admin_delete"
  ON public.queue_reports FOR DELETE
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "office_suggestions_select_own_or_admin" ON public.office_suggestions;
CREATE POLICY "office_suggestions_select_own_or_admin"
  ON public.office_suggestions FOR SELECT
  USING (auth.uid() = suggested_by OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "office_suggestions_authenticated_insert" ON public.office_suggestions;
CREATE POLICY "office_suggestions_authenticated_insert"
  ON public.office_suggestions FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = suggested_by AND review_status = 'pending');

DROP POLICY IF EXISTS "office_suggestions_admin_update" ON public.office_suggestions;
CREATE POLICY "office_suggestions_admin_update"
  ON public.office_suggestions FOR UPDATE
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "report_flags_select_own_or_admin" ON public.report_flags;
CREATE POLICY "report_flags_select_own_or_admin"
  ON public.report_flags FOR SELECT
  USING (auth.uid() = reported_by OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "report_flags_authenticated_insert" ON public.report_flags;
CREATE POLICY "report_flags_authenticated_insert"
  ON public.report_flags FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = reported_by AND status = 'open');

DROP POLICY IF EXISTS "report_flags_admin_update" ON public.report_flags;
CREATE POLICY "report_flags_admin_update"
  ON public.report_flags FOR UPDATE
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "office_aggregates_public_select" ON public.office_aggregates;
CREATE POLICY "office_aggregates_public_select"
  ON public.office_aggregates FOR SELECT
  USING (TRUE);

DROP POLICY IF EXISTS "api_error_logs_admin_select" ON public.api_error_logs;
CREATE POLICY "api_error_logs_admin_select"
  ON public.api_error_logs FOR SELECT
  USING (public.is_admin(auth.uid()));

-- ============================================================================
-- 11. REALTIME PUBLICATION, AGGREGATE BACKFILL & POSTGREST SCHEMA RELOAD
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.office_aggregates;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.queue_reports;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT DISTINCT office_id FROM public.queue_reports WHERE office_id IS NOT NULL LOOP
    PERFORM public.recalculate_office_aggregate(r.office_id);
  END LOOP;
END $$;

-- Immediately notify Supabase PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';
