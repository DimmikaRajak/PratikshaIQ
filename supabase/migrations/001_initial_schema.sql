-- PratikshaIQ Migration 001: Initial Database Schema
-- Requires PostgreSQL 15+ with PostGIS (standard on Supabase)

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS postgis;

-- 1. User Profiles (linked 1:1 with Supabase Auth users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT CHECK (display_name IS NULL OR char_length(display_name) <= 100),
  avatar_url TEXT CHECK (avatar_url IS NULL OR avatar_url ~ '^https?://'),
  preferred_language TEXT NOT NULL DEFAULT 'en' CHECK (preferred_language IN ('en', 'hi')),
  is_suspended BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Administrator Roles (assigned strictly via trusted backend/SQL, never via open signup)
CREATE TABLE IF NOT EXISTS public.admin_roles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'super_admin', 'moderator')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Public Offices Directory (OSM mapped + approved citizen suggestions)
CREATE TABLE IF NOT EXISTS public.offices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(trim(name)) >= 2),
  slug TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'government_office',
    'municipal_corporation',
    'municipal_council',
    'gram_panchayat',
    'post_office',
    'police_station',
    'government_hospital',
    'district_collector',
    'tehsil_office',
    'sub_registrar',
    'court',
    'rto_office',
    'service_centre',
    'other_public_office'
  )),
  address TEXT,
  city TEXT,
  district TEXT,
  state TEXT NOT NULL,
  postal_code TEXT CHECK (postal_code IS NULL OR postal_code ~ '^[1-9][0-9]{5}$'),
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN 6.0 AND 38.5),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN 68.0 AND 98.0),
  location GEOGRAPHY(Point, 4326) GENERATED ALWAYS AS (
    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
  ) STORED,
  source TEXT NOT NULL CHECK (source IN ('osm', 'citizen_suggestion', 'official_import')),
  osm_type TEXT CHECK (osm_type IS NULL OR osm_type IN ('node', 'way', 'relation')),
  osm_id BIGINT,
  official_website TEXT CHECK (official_website IS NULL OR official_website ~ '^https?://'),
  phone TEXT CHECK (phone IS NULL OR char_length(phone) <= 40),
  verification_status TEXT NOT NULL DEFAULT 'approved' CHECK (verification_status IN ('approved', 'pending', 'archived')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Deduplicate OpenStreetMap imports cleanly
CREATE UNIQUE INDEX IF NOT EXISTS offices_osm_source_unique_idx
  ON public.offices (source, osm_type, osm_id)
  WHERE osm_id IS NOT NULL;

-- 4. Citizen Queue Reports (real citizen observations)
CREATE TABLE IF NOT EXISTS public.queue_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  queue_size_min INT NOT NULL CHECK (queue_size_min >= 0 AND queue_size_min <= 500),
  queue_size_max INT NOT NULL CHECK (queue_size_max >= queue_size_min AND queue_size_max <= 1000),
  waiting_time_min INT NOT NULL CHECK (waiting_time_min >= 0 AND waiting_time_min <= 600),
  waiting_time_max INT NOT NULL CHECK (waiting_time_max >= waiting_time_min AND waiting_time_max <= 720),
  crowd_level TEXT NOT NULL CHECK (crowd_level IN ('very_low', 'low', 'moderate', 'high', 'very_high')),
  note TEXT CHECK (note IS NULL OR char_length(note) <= 500),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  report_status TEXT NOT NULL DEFAULT 'active' CHECK (report_status IN ('active', 'flagged', 'hidden', 'rejected')),
  suspicious_score SMALLINT NOT NULL DEFAULT 0 CHECK (suspicious_score BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Citizen Office Suggestions (pending admin verification)
CREATE TABLE IF NOT EXISTS public.office_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suggested_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  office_name TEXT NOT NULL CHECK (char_length(trim(office_name)) >= 2),
  category TEXT NOT NULL CHECK (category IN (
    'government_office',
    'municipal_corporation',
    'municipal_council',
    'gram_panchayat',
    'post_office',
    'police_station',
    'government_hospital',
    'district_collector',
    'tehsil_office',
    'sub_registrar',
    'court',
    'rto_office',
    'service_centre',
    'other_public_office'
  )),
  address TEXT NOT NULL CHECK (char_length(trim(address)) >= 5),
  city TEXT NOT NULL,
  district TEXT,
  state TEXT NOT NULL,
  postal_code TEXT CHECK (postal_code IS NULL OR postal_code = '' OR postal_code ~ '^[1-9][0-9]{5}$'),
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN 6.0 AND 38.5),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN 68.0 AND 98.0),
  official_website TEXT CHECK (official_website IS NULL OR official_website = '' OR official_website ~ '^https?://'),
  phone TEXT CHECK (phone IS NULL OR char_length(phone) <= 40),
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  reviewer_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Report Accuracy Flags
CREATE TABLE IF NOT EXISTS public.report_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.queue_reports(id) ON DELETE CASCADE,
  reported_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (char_length(trim(reason)) BETWEEN 5 AND 500),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'dismissed', 'action_taken')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (report_id, reported_by)
);

-- 7. System-Calculated Office Queue Aggregates (never writable by clients directly)
CREATE TABLE IF NOT EXISTS public.office_aggregates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID UNIQUE NOT NULL REFERENCES public.offices(id) ON DELETE CASCADE,
  current_crowd_level TEXT NOT NULL DEFAULT 'unknown' CHECK (current_crowd_level IN (
    'very_low', 'low', 'moderate', 'high', 'very_high', 'unknown'
  )),
  estimated_waiting_minutes NUMERIC(6, 1),
  average_queue_size NUMERIC(6, 1),
  confidence_level TEXT NOT NULL DEFAULT 'no_data' CHECK (confidence_level IN (
    'high', 'medium', 'low', 'no_data'
  )),
  recent_report_count INT NOT NULL DEFAULT 0 CHECK (recent_report_count >= 0),
  last_report_at TIMESTAMPTZ,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. API Error & Data Quality Logs (for admin monitoring)
CREATE TABLE IF NOT EXISTS public.api_error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  error_message TEXT NOT NULL,
  status_code INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
