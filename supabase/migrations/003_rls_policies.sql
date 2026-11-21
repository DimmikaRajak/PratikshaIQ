-- PratikshaIQ Migration 003: Strict Row Level Security (RLS) Policies

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_aggregates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_error_logs ENABLE ROW LEVEL SECURITY;

-- 1. PROFILES
-- Users can read and update only their own profile (cannot self-unsuspend).
-- Admins can read all profiles and toggle suspension status.
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

-- 2. ADMIN ROLES
-- Users can check their own admin row; NO client insert/update/delete allowed.
DROP POLICY IF EXISTS "admin_roles_select_self_or_admin" ON public.admin_roles;
CREATE POLICY "admin_roles_select_self_or_admin"
  ON public.admin_roles FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- 3. OFFICES
-- Public can read approved offices. Only admins or trusted service_role can mutate offices.
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

-- 4. QUEUE REPORTS
-- Users can read their own history; admins can read all reports; public uses public_queue_reports view or active rows.
-- Note: Direct SELECT on queue_reports for anon/authenticated is allowed for active rows so historical analytics work,
-- while client queries explicitly omit user_id and profiles never expose private email/PII.
DROP POLICY IF EXISTS "queue_reports_select_active_own_or_admin" ON public.queue_reports;
CREATE POLICY "queue_reports_select_active_own_or_admin"
  ON public.queue_reports FOR SELECT
  USING (
    report_status = 'active'
    OR auth.uid() = user_id
    OR public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "queue_reports_authenticated_insert" ON public.queue_reports;
CREATE POLICY "queue_reports_authenticated_insert"
  ON public.queue_reports FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = user_id
    AND report_status = 'active'
  );

-- Users CANNOT modify or delete another person's reports; only admins can moderate status
DROP POLICY IF EXISTS "queue_reports_admin_update" ON public.queue_reports;
CREATE POLICY "queue_reports_admin_update"
  ON public.queue_reports FOR UPDATE
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "queue_reports_admin_delete" ON public.queue_reports;
CREATE POLICY "queue_reports_admin_delete"
  ON public.queue_reports FOR DELETE
  USING (public.is_admin(auth.uid()));

-- 5. OFFICE SUGGESTIONS
-- Authenticated users can submit pending suggestions and view their own.
-- Only admins can view all suggestions and approve/reject.
DROP POLICY IF EXISTS "office_suggestions_select_own_or_admin" ON public.office_suggestions;
CREATE POLICY "office_suggestions_select_own_or_admin"
  ON public.office_suggestions FOR SELECT
  USING (auth.uid() = suggested_by OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "office_suggestions_authenticated_insert" ON public.office_suggestions;
CREATE POLICY "office_suggestions_authenticated_insert"
  ON public.office_suggestions FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = suggested_by
    AND review_status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
  );

DROP POLICY IF EXISTS "office_suggestions_admin_update" ON public.office_suggestions;
CREATE POLICY "office_suggestions_admin_update"
  ON public.office_suggestions FOR UPDATE
  USING (public.is_admin(auth.uid()));

-- 6. REPORT FLAGS
-- Authenticated users can flag inaccurate reports and view their own flags.
-- Only admins can view all flags and update review status.
DROP POLICY IF EXISTS "report_flags_select_own_or_admin" ON public.report_flags;
CREATE POLICY "report_flags_select_own_or_admin"
  ON public.report_flags FOR SELECT
  USING (auth.uid() = reported_by OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "report_flags_authenticated_insert" ON public.report_flags;
CREATE POLICY "report_flags_authenticated_insert"
  ON public.report_flags FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = reported_by
    AND status = 'open'
  );

DROP POLICY IF EXISTS "report_flags_admin_update" ON public.report_flags;
CREATE POLICY "report_flags_admin_update"
  ON public.report_flags FOR UPDATE
  USING (public.is_admin(auth.uid()));

-- 7. OFFICE AGGREGATES
-- Public read-only! Zero client INSERT/UPDATE/DELETE policies.
-- Updated strictly via SECURITY DEFINER DB triggers or trusted service_role Edge Functions.
DROP POLICY IF EXISTS "office_aggregates_public_select" ON public.office_aggregates;
CREATE POLICY "office_aggregates_public_select"
  ON public.office_aggregates FOR SELECT
  USING (TRUE);

-- 8. API ERROR LOGS
-- Strictly admin-only read; written by backend service_role only.
DROP POLICY IF EXISTS "api_error_logs_admin_select" ON public.api_error_logs;
CREATE POLICY "api_error_logs_admin_select"
  ON public.api_error_logs FOR SELECT
  USING (public.is_admin(auth.uid()));
