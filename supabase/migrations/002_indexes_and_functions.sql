-- PratikshaIQ Migration 002: Indexes, Security Functions, Queue Aggregation & Triggers

-- Performance Indexes
CREATE INDEX IF NOT EXISTS offices_location_gist_idx ON public.offices USING GIST (location);
CREATE INDEX IF NOT EXISTS offices_lat_lon_idx ON public.offices (latitude, longitude);
CREATE INDEX IF NOT EXISTS offices_state_city_idx ON public.offices (state, city);
CREATE INDEX IF NOT EXISTS offices_category_idx ON public.offices (category);
CREATE INDEX IF NOT EXISTS offices_osm_lookup_idx ON public.offices (osm_type, osm_id);
CREATE INDEX IF NOT EXISTS offices_postal_code_idx ON public.offices (postal_code) WHERE postal_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS queue_reports_office_time_idx
  ON public.queue_reports (office_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS queue_reports_user_time_idx
  ON public.queue_reports (user_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS queue_reports_status_idx
  ON public.queue_reports (report_status, submitted_at DESC);

CREATE INDEX IF NOT EXISTS office_suggestions_status_idx
  ON public.office_suggestions (review_status, created_at DESC);
CREATE INDEX IF NOT EXISTS report_flags_status_idx
  ON public.report_flags (status, created_at DESC);
CREATE INDEX IF NOT EXISTS office_aggregates_office_idx
  ON public.office_aggregates (office_id);

-- Helper: Check if a user holds an active administrator role
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

-- Helper: Auto-update updated_at columns
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

-- Helper: Auto-create profile row when a Supabase Auth user signs up
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
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data ->> 'preferred_language', 'en')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Queue Report Validation, Rate Limiting, Duplicate & Suspicious-Activity Guard
CREATE OR REPLACE FUNCTION public.validate_queue_report_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_suspended BOOLEAN;
  v_duplicate_count INT;
  v_hourly_count INT;
  v_distinct_offices_20m INT;
  v_score SMALLINT := 0;
BEGIN
  -- 1. Block suspended users
  SELECT COALESCE(is_suspended, FALSE) INTO v_suspended
  FROM public.profiles
  WHERE id = NEW.user_id;

  IF v_suspended THEN
    RAISE EXCEPTION 'Account is temporarily suspended from submitting reports.'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Always enforce authoritative server timestamp
  NEW.submitted_at := NOW();
  NEW.created_at := NOW();
  NEW.report_status := 'active';

  -- 3. Prevent duplicate report by same user for same office within 15 minutes
  SELECT COUNT(*) INTO v_duplicate_count
  FROM public.queue_reports
  WHERE user_id = NEW.user_id
    AND office_id = NEW.office_id
    AND submitted_at > NOW() - INTERVAL '15 minutes';

  IF v_duplicate_count > 0 THEN
    RAISE EXCEPTION 'You have already submitted a report for this office within the last 15 minutes.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 4. Hourly rate limit per user (max 8 reports/hour)
  SELECT COUNT(*) INTO v_hourly_count
  FROM public.queue_reports
  WHERE user_id = NEW.user_id
    AND submitted_at > NOW() - INTERVAL '1 hour';

  IF v_hourly_count >= 8 THEN
    RAISE EXCEPTION 'Hourly submission limit reached. Please try again later.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 5. Basic suspicious-activity heuristic (reporting across >2 distinct offices in 20 minutes)
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

-- Core Queue Intelligence Engine (Server/DB Authoritative)
-- Recency Weights:
--   <= 15 min: 1.00
--   <= 30 min: 0.75
--   <= 60 min: 0.45
--   <= 120 min: 0.20
--   > 120 min: excluded
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
  v_variance NUMERIC := 0;
  v_std_dev NUMERIC := 0;
  v_last_report TIMESTAMPTZ := NULL;
  v_recent_30m INT := 0;
  v_crowd_label TEXT := 'unknown';
  v_confidence TEXT := 'no_data';
BEGIN
  -- Deduplicate per user within the 2-hour window (keep most recent active report per user)
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
    -- Map weighted crowd score to discrete crowd level
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

    -- Determine confidence based on independent count, recency, and agreement
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

-- Trigger aggregate recalculation automatically on report changes
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

-- Admin RPC: Approve Citizen Office Suggestion
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

  v_slug := lower(regexp_replace(v_suggestion.office_name || '-' || v_suggestion.city, '[^a-zA-Z0-9]+', '-', 'g'))
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

-- Admin RPC: Reject Citizen Office Suggestion
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

-- PostGIS Proximity Search RPC for Approved Public Offices
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
      o.location,
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
  WHERE o.verification_status = 'approved'
    AND (p_category IS NULL OR p_category = 'all' OR o.category = p_category)
    AND ST_DWithin(
      o.location,
      ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography,
      LEAST(GREATEST(p_radius_meters, 500), 50000)
    )
  ORDER BY distance_meters ASC
  LIMIT LEAST(GREATEST(p_limit, 1), 100);
$$;

-- Anonymized Public View for Queue Reports (no user_id or private PII exposed)
CREATE OR REPLACE VIEW public.public_queue_reports AS
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
WHERE report_status = 'active';

GRANT SELECT ON public.public_queue_reports TO anon, authenticated;

-- Enable Supabase Realtime on live queue aggregates and reports
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.office_aggregates;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.queue_reports;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
