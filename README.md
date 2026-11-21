# PratikshaIQ — Know the Queue. Plan Your Visit.

**PratikshaIQ** is a Pan-India civic-tech web application that helps Indian citizens discover nearby government offices and public service centres across all **28 States and 8 Union Territories**, check real citizen-submitted crowd conditions, estimate waiting times, understand historical peak visiting hours, and contribute live waiting-time reports.

Every dynamic metric is grounded in real OpenStreetMap discovery data, real Supabase PostgreSQL records, or deterministic calculations over genuine citizen reports. When data is absent or insufficient, PratikshaIQ displays an honest empty state.

---

## 1. Architecture Overview

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui-style primitives (`class-variance-authority` + `tailwind-merge`), React Router v7, TanStack Query v5, Recharts, Lucide icons, and custom English + Hindi (`en` / `hi`) i18n architecture extensible to additional Indian languages.
- **Maps & Pan-India Discovery**: Leaflet + OpenStreetMap tiles, server-proxied Nominatim geocoding (cities, districts, localities, 6-digit PIN codes, reverse geocoding), server-proxied Overpass API discovery across multiple mirrors with TTL caching, rate limiting, and browser offline cache fallback for previously retrieved records.
- **Backend & Server Proxy (`server.ts`)**: Express server hosting Vite dev middleware (development) or static `dist/` (production), plus secure server-side API routes:
  - `GET /api/health` — integration configuration status (booleans only).
  - `GET /api/location/search` — rate-limited, cached Pan-India Nominatim geocoder.
  - `GET /api/location/reverse` — reverse geocoder for explicit-consent browser geolocation.
  - `GET /api/offices/discover` — rate-limited, grid-cached Overpass API query with mirror fallback and Supabase upsert/merge.
  - `POST /api/offices/ensure-osm` — authenticated endpoint ensuring an OSM-discovered office exists in Supabase before attaching a queue report.
  - `POST /api/ai/visit-brief` — optional server-side Google Gemini (`@google/genai`, `gemini-4-hydrogen`) visit preparation checklist grounded strictly in real office details. Core queue features remain 100% functional if AI is unavailable.
- **Database, Auth & Realtime (Supabase)**:
  - PostgreSQL + PostGIS spatial indexing (`ST_DWithin` / `ST_Distance`).
  - Supabase Email OTP / Magic Link authentication (no manual password storage).
  - Row Level Security (RLS) enforced on every table.
  - Authoritative PostgreSQL triggers & `SECURITY DEFINER` functions for rate limiting, 15-minute duplicate report prevention, suspicious-activity scoring, recency-weighted queue aggregation, and admin-only office suggestion approvals.
  - Supabase Realtime subscriptions on `queue_reports` and `office_aggregates`.

---

## 2. Local Installation

```bash
npm install
cp .env.example .env
```

---

## 3. Supabase Project Setup & SQL Migrations

1. Create a free or paid project at [https://supabase.com](https://supabase.com).
2. Open the **SQL Editor** in your Supabase Dashboard and execute the migration files in order:
   1. `supabase/migrations/001_initial_schema.sql` (PostGIS, UUID tables, constraints, OSM deduplication index)
   2. `supabase/migrations/002_indexes_and_functions.sql` (spatial & btree indexes, rate-limit trigger, weighted queue intelligence function, admin RPCs, anonymized `public_queue_reports` view, Realtime publication)
   3. `supabase/migrations/003_rls_policies.sql` (strict RLS across all tables)
3. *(Optional)* Deploy the scheduled/webhook aggregate expiration Edge Function:
   ```bash
   supabase functions deploy recalculate-aggregate
   ```
4. **Assigning an Administrator (Secure Backend-Only Path)**:
   There is no open administrator registration route. After your admin user signs in once via Email OTP, grant admin access directly in the Supabase SQL Editor:
   ```sql
   INSERT INTO public.admin_roles (user_id, role)
   VALUES ('<USER_UUID_FROM_AUTH_USERS>', 'super_admin');
   ```

---

## 4. Authentication Setup

1. In Supabase Dashboard → **Authentication → Providers → Email**, enable **Email** sign-in and disable **Confirm email** so new accounts sign in immediately without an email verification step (or configure `SUPABASE_SERVICE_ROLE_KEY` on the server so `POST /api/auth/register` creates confirmed accounts directly).
2. Under **Authentication → URL Configuration**:
   - Set **Site URL** to your deployment URL (e.g., `http://localhost:3000` locally or your production URL).
   - Add `<YOUR_URL>/dashboard` to **Redirect URLs**.

---

## 5. Environment Variables

Configure `.env` (never commit secrets to version control):

| Variable | Scope | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Client & Server | Your Supabase project URL (`https://<ref>.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Client (RLS-enforced) | Supabase public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** | Used strictly in `server.ts` to upsert OSM offices and log API errors. Never prefix with `VITE_`. |
| `GEMINI_API_KEY` | **Server only** | Optional Google Gemini API key for grounded visit preparation checklists. |
| `APP_URL` | Server | Public URL of the application. |
| `OSM_CONTACT_EMAIL` | Server (optional) | Contact email included in Nominatim/Overpass `User-Agent` header per OSM usage policy. |

---

## 6. Local Development & Testing

```bash
# Start full-stack Express + Vite dev server on port 3000
npm run dev

# Run TypeScript type check
npm run lint

# Run automated test suite (Queue Intelligence, Historical Analytics, OSM/India, Schema/RLS)
npm test

# Production build
npm run build

# Start production server
NODE_ENV=production npm start
```

---

## 7. Production Deployment

- **Node / Cloud Run / Render / Fly.io**: Run `npm run build` and start with `NODE_ENV=production node server.ts` on `PORT=3000` (or injected `PORT`).
- **Vercel**: Deploy frontend + serverless proxy routes or host `server.ts` as a Node runtime service with environment variables configured in the hosting dashboard.
- Keep `SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY` strictly in server-side secret storage.

---

## 8. External API Limitations & Data Honesty

- **OpenStreetMap Coverage**: OpenStreetMap is community-maintained and does not yet include every government office across India (especially newer service centres or rural panchayat offices). PratikshaIQ clearly distinguishes **OpenStreetMap Mapped** offices from **Citizen-Submitted (Approved)** offices and provides a citizen suggestion workflow.
- **Nominatim & Overpass Usage Policies**: Public OSM endpoints enforce strict rate limits. PratikshaIQ enforces client debouncing (500ms), server-side per-IP rate limits, grid-rounded TTL caching, mirror fallback, and local caching of previously retrieved discovery results so previously fetched offices remain usable during upstream downtime.
- **No Guaranteed Waiting Times**: Queue status is computed strictly from recent active citizen reports (expiring after 2 hours). Historical peak hours require a minimum of 10 genuine observations before displaying patterns.
