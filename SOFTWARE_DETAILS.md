# IndustryPrime-Attendance — Software Details

This document describes the **HRIS-APP** codebase: purpose, architecture, technology stack, features, data model, configuration, and operational behavior. It reflects the application as implemented in this repository.

---

## 1. Product overview

**IndustryPrime-Attendance** is a **Human Resource Information System (HRIS)** web application focused on **attendance**, with supporting modules for **employees**, **leave**, **payroll**, **reports**, and **user administration**. It targets organizations that need:

- A **logged-in web workspace** for admins and employees (role-based navigation).
- **Monthly attendance grids** per employee with IN/OUT times, derived status, and persistence in a database.
- A **public “Add Attendance”** flow (optional secret key) for submitting IN/OUT without full app login, merged into the same monthly views.
- A **dashboard** with high-level KPIs sourced from the database, with periodic refresh while the page is open.

The product name and metadata appear in the Next.js app as **IndustryPrime-Attendance** (browser title, layout metadata).

---

## 2. High-level architecture

The repository is a **monorepo** with two main parts:

| Area | Path | Role |
|------|------|------|
| **Frontend** | `web/` | Next.js (App Router) SPA: UI, client-side auth storage, API calls. |
| **Backend** | `backend/` | FastAPI REST API: auth, business rules, Supabase access. |

**Request flow (typical):**

1. Browser loads the Next.js app (port **3000** by default).
2. Authenticated pages call the API via **`/api/...`** on the **same origin**. A **catch-all Route Handler** (`web/app/api/[[...slug]]/route.ts`) forwards each request at **runtime** to FastAPI using **`BACKEND_PROXY_TARGET`** or, if unset, **`NEXT_PUBLIC_API_URL`** when it is an absolute `http(s)` URL—otherwise **`http://127.0.0.1:8000`** for local dev. This avoids baking a wrong backend URL into the build (a common Vercel login failure).
3. FastAPI validates **JWT** (backend-owned auth), applies **role / ownership** rules, and talks to **Supabase** using the **REST (PostgREST)** interface with the **service role** key (server-side only).

**Public attendance entry** uses `publicApiFetch` against `/api` as well, so the public page stays same-origin.

---

## 3. Technology stack

### 3.1 Frontend (`web/`)

- **Framework:** Next.js **16.x** (App Router).
- **UI:** React **19**, TypeScript **5**, **Tailwind CSS v4**.
- **Fonts:** Geist Sans / Geist Mono (Google Fonts via `next/font`).
- **Theming:** Light/dark via `localStorage` + `document.documentElement.classList` (`dark` class), initialized in `layout.tsx` before paint.
- **HTTP:** `fetch` wrappers in `web/lib/api.ts` (`apiFetch` with bearer token, `publicApiFetch` for unauthenticated public routes).
- **Auth persistence:** `localStorage` keys `industryprime.authToken`, `industryprime.authUser`; optional short-lived cookie `industryprime_token`; custom event `industryprime-auth-change` for cross-component sync.

### 3.2 Backend (`backend/`)

- **Framework:** **FastAPI**.
- **Server:** **Uvicorn** (see `requirements.txt`: `uvicorn[standard]`).
- **HTTP client:** **requests** to Supabase PostgREST (no heavy Supabase Python SDK requirement—important for Windows environments without MSVC build tools for optional native deps).
- **Config:** **`python-dotenv`** loads **`backend/.env`** (path resolved relative to `main.py` / package layout).

### 3.3 Data platform

- **Supabase (PostgreSQL)** as the primary database, accessed via **PostgREST** from the backend using:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`  
  The backend uses the **service role** for server-side operations (bypasses RLS where applicable). Row Level Security (RLS) policies exist on several tables for **`authenticated`** clients if accessed directly from Supabase; the app’s main path is through FastAPI.

### 3.4 Other backend dependencies

- **pandas**, **openpyxl** — legacy / Excel-related paths (per comments in codebase; upload flows may have been simplified or removed in favor of manual grids and link entries).

---

## 4. Repository layout (concise)

```
HRIS-APP/
├── backend/
│   ├── main.py                 # FastAPI app, CORS, router mounts
│   ├── requirements.txt
│   ├── database/               # SQL scripts & supabase_client.py
│   ├── dependencies/           # auth_dependency (JWT context)
│   ├── routers/                # attendance, auth, dashboard, employees, leave, months, payroll
│   ├── schemas/                # Pydantic models
│   └── services/               # Business logic
├── web/
│   ├── app/                    # Next.js routes (App Router)
│   ├── components/             # layout (AppShell, Header, Sidebar), attendance, etc.
│   ├── lib/                    # api, auth, envApi
│   ├── next.config.ts          # Next.js config (API proxy is `app/api/[[...slug]]/route.ts`)
│   └── middleware.ts           # route protection hints if present
└── SOFTWARE_DETAILS.md         # This file
```

---

## 5. Frontend application structure

### 5.1 Global layout

- **`web/app/layout.tsx`** — Root HTML, fonts, theme script, wraps all pages in **`AppShell`**.
- **`AppShell`** (`web/components/layout/AppShell.tsx`):
  - **Public routes** (no shell): `/login`, `/signup`, `/attendance-entry`.
  - **Protected routes:** Sidebar + Header + `<main>`; redirects unauthenticated users to `/login`.
  - Session verification uses stored JWT + **`/auth/me`** (or equivalent flow via `getCurrentUser`).

### 5.2 Header (global)

- **`Header.tsx`** includes **`AddAttendanceHeaderLink`**: opens the public attendance entry URL (with optional `?key=` from backend) in a **new tab**, with `from=app` query param so the entry page can show a “Back to dashboard” style affordance.
- Search field, notifications placeholder, theme toggle, user menu.

### 5.3 Sidebar

- Role-filtered navigation: e.g. **`user`** role limited to **Dashboard** and **Attendance**; **`master_admin`** sees **Users**; all relevant roles see **Employees**, **Leave**, **Payroll**, **Reports**, **Settings** as configured in `Sidebar.tsx`.

### 5.4 Notable routes (`web/app/`)

| Route | Purpose |
|-------|---------|
| `/dashboard` | KPI cards (employees, present today, absent, late); auto-refresh interval; copy points users to header **Add Attendance**. |
| `/attendance` | Employee list → drill-down to per-employee month grid. |
| `/attendance/[employeeId]` | Editable month attendance; saves via `POST /attendance/update`. |
| `/attendance-entry` | Public form: employee, date, IN/OUT; `POST /attendance/add`; monthly table with **Edit** to merge OUT onto existing rows. |
| `/employees`, `/leave`, `/payroll`, `/reports`, `/settings`, `/users` | Module pages (scope varies by role). |
| `/login`, `/signup` | Auth flows. |

### 5.5 API base resolution

- **`web/lib/envApi.ts`** — `effectiveApiBase()` prefers same-origin **`/api`** in the browser when `NEXT_PUBLIC_API_URL` points at another origin, so traffic goes through the server proxy and avoids CORS.

---

## 6. Backend API surface

All routers are mounted under prefixes in **`backend/main.py`**:

| Prefix | Router | Purpose |
|--------|--------|---------|
| `/attendance` | `attendance` | Month view, update, public add/list, entry helpers. |
| `/dashboard` | `dashboard` | Summary KPIs, attendance-entry URL builder. |
| `/employees` | `employees` | CRUD-style employee directory. |
| `/leave` | `leave` | Balances, requests, approvals. |
| `/payroll` | `payroll` | Summary / generate. |
| `/auth` | `auth` | Signup, login, me, forgot password, user list, role patch. |
| `/months` | `months` | Which months have data per employee. |

**Legacy:** `POST /login` at root may exist for compatibility (`main.py`).

---

## 7. Authentication and authorization

### 7.1 Auth model

- **Backend-owned JWT** after login/signup (`/auth/login`, `/auth/signup`).
- **`AuthContext`** (`dependencies/auth_dependency.py`): `user_id`, `tenant_id` (placeholder scoped to user id until multi-tenant tables), `email`, `name`, `role`, `access_token`.
- **Roles:** `master_admin`, `admin`, `user` (see `web/lib/auth.ts`).

### 7.2 Attendance-specific rules

- **GET `/attendance/{employee_id}`** — Admins can read any employee; **`user`** can read only if **`employees.email`** matches JWT email.
- **POST `/attendance/update`** — **Admins** (`master_admin`, `admin`) can update any employee; **other roles** may update **only their own** employee row (same email match against `employees` record for `payload.employee_id`).
- **Public routes** under `/attendance/add`, `/attendance/entry/*` — Optional **`ATTENDANCE_ENTRY_SECRET`**; validated in `attendance_link_entry_service.assert_attendance_entry_key`.

---

## 8. Attendance — business rules (implementation summary)

Logic lives primarily in **`backend/services/attendance_management_service.py`** and is mirrored client-side in **`web/app/attendance/[employeeId]/page.tsx`** (`calculateLocal`) for responsive editing.

### 8.1 Calendar and holidays

- **`public.holidays`** (see `backend/database/holidays.sql`): dated holidays; **empty IN/OUT** on that date → **Present**, `status_ot_sf` shows holiday **name**; merged before weekend/Sunday rules where applicable.
- **`GET /attendance/{employee_id}`** returns a **`holidays`** map for the requested month (`YYYY-MM-DD` → name) for UI parity.

### 8.2 Sundays

- **Empty Sunday** (no IN/OUT) → **Present**, labeled **Sunday** (global rule).

### 8.3 Adrija weekend auto-present

- Employees whose email is in **`_WEEKEND_AUTO_PRESENT_EMAILS`** (currently **`adrija@industryprime.com`**) get **empty Saturday and Sunday** treated as **Present** with labels **Saturday** / **Sunday**.
- **Saturday with full IN+OUT** for Adrija uses a **9-hour** scheduled target for shortfall/OT (see below); other employees use **5 hours** on Saturday.

### 8.4 IN without OUT

- **Any day:** if there is **IN** and no **OUT** → **Present** (`P`); **Late** if IN is **strictly after 9:30**; otherwise status **OK** for that partial row.
- Persisted when saving via rules in `update_attendance` / merge with `attendance` table.

### 8.5 Full IN+OUT day

- **Working hours** — span between IN and OUT.
- **Actual hours** — hours from **9:00** to OUT (floor at zero).
- **Late** — lateness vs **9:30** cutoff (hours after 9:30).
- **Shortfall / OT / SF:**
  - **Weekday (Mon–Fri):** target **9h** for shortfall vs actual; **OT** if actual **>** 9; **SF** if shortfall **>** 0; if late, display **Late** for `status_ot_sf` when applicable.
  - **Saturday (not Adrija):** target **5h** (9:00–14:00 notion); **OT** if actual **>** 5.
  - **Saturday (Adrija):** target **9h** for full-day calculations.
- **Stored overtime** in `attendance` persistence uses **`scheduled_hours`** from the calculation when present (not a flat 9 for everyone on Saturday).

### 8.6 Public link entries

- Table **`attendance_link_entries`** (`backend/database/attendance_link_entries.sql`): **`user_id`**, **`date`**, **`in_time`**, **`out_time`**, **`month`**, **`year`**; unique per user+date.
- **`POST /attendance/add`** merges into an existing row (PATCH) if present, so users can add **OUT** later; monthly UI exposes **Edit** to prefill the form.

### 8.7 Month materialization

- **`ensure_month`** loads `attendance` + overlays link entries + applies serialization rules, then attempts to snapshot into **`monthly_attendance`** (best-effort if table missing).

---

## 9. Dashboard KPIs

Implemented in **`backend/services/dashboard_service.py`**:

- **`total_employees`** — count of rows in **`employees`**.
- **`present_today`** — distinct employees with a row in **`attendance`** for **today’s date**, **plus** distinct **`user_id`** in **`attendance_link_entries`** for that date (so public entries count).
- **`absent`** — `max(0, total_employees - present_today)` (simplified model).
- **`late`** — count of **`attendance`** rows for that date with **`late_minutes` > 0** (link-only rows without `late_minutes` do not increment this).

The dashboard page polls **`/dashboard/summary`** on an interval and on tab visibility.

---

## 10. Environment variables (reference)

### Backend (`backend/.env`)

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Supabase project URL (without or with `/rest/v1`; client normalizes). |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key for PostgREST calls from FastAPI. |
| `CORS_ORIGINS` | Optional comma-separated extra allowed origins. |
| `FRONTEND_URL` | Used in CORS and in **`/dashboard/attendance-entry-url`** default base. |
| `ATTENDANCE_ENTRY_SECRET` | If set, public attendance endpoints require matching `?key=` / body `key`. |
| `BACKEND_PROXY_TARGET` | Optional. Preferred server-side proxy target for `/api/*` (same as FastAPI base URL, no trailing slash). |

### Frontend (`web/.env` / `NEXT_PUBLIC_*`)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_API_URL` | Optional absolute API base; `effectiveApiBase()` prefers `/api` in browser when sensible. |

---

## 11. Local development

1. **Supabase:** Run SQL scripts in `backend/database/` as documented in each file (e.g. `phase2_schema.sql`, `payroll_leave_update.sql`, `holidays.sql`, `attendance_link_entries.sql`) in the Supabase SQL editor or `psql`.
2. **Backend:** Create venv, `pip install -r requirements.txt`, set `.env`, run `uvicorn main:app --reload` from `backend/` (or configured cwd).
3. **Frontend:** `cd web && npm install && npm run dev` (port **3000**).
4. On **Vercel**, set **`BACKEND_PROXY_TARGET`** or **`NEXT_PUBLIC_API_URL`** to your public FastAPI base URL (no trailing slash) so `/api/*` proxying works.

---

## 12. Security notes

- **Service role key** must never ship to the browser; only the backend holds it.
- **JWT** in `localStorage` is standard for SPAs but XSS-sensitive; use HTTPS in production and strict CSP where possible.
- **Public attendance** should use **`ATTENDANCE_ENTRY_SECRET`** in production so random visitors cannot post arbitrary rows.
- **RLS** on Supabase tables protects direct PostgREST access from clients; app logic still enforces authorization in FastAPI.

---

## 13. Deployment hints

- **Frontend:** Vercel (or similar) for Next.js; set `BACKEND_PROXY_TARGET` or host FastAPI behind same domain as `/api` reverse proxy.
- **Backend:** Container or process manager with `uvicorn`; set production `CORS_ORIGINS` / `FRONTEND_URL`.
- **Database:** Supabase hosted PostgreSQL; run migrations SQL in order when promoting environments.

---

## 14. Versioning and maintenance

- API version string in **`main.py`**: `1.0.0` (FastAPI metadata).
- **`web/package.json`** version `0.1.0` (private app).

When extending features, prefer:

1. **Pydantic schemas** in `backend/schemas/`.
2. **Services** in `backend/services/` for testable logic.
3. **Thin routers** for HTTP mapping only.
4. **SQL migrations** as additive files under `backend/database/` with clear comments and idempotent patterns (`IF NOT EXISTS`, `ON CONFLICT DO UPDATE`) where appropriate.

---

*This document is generated from the repository structure and key modules as of the last update. For exact request/response shapes, refer to Pydantic models in `backend/schemas/` and route handlers in `backend/routers/`.*
