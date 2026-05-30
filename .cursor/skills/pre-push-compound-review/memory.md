# Pre-push memory (HRIS-APP)

Distilled rules from reviews and user feedback. The agent must read this at **Step 0** every push. Do not contradict **Accepted** or re-suggest **Rejected**.

## Accepted patterns

- Dashboard header uses **`AddAttendanceHeaderLink`** (Enter Atten. + Upload PDF), not `DashboardHeaderStrip` / `AddAttendanceDialog`.
- **Admin overview** (`/dashboard/admin`) removed; use sidebar for Attendance / Employees / Roles.
- Management dashboard: no trend chart, department breakdown, pending-leave widget, or three management cards; **Approve Leave** shows **monthly approved** list via `/leave/requests?status=approved`.
- Leave email **approve** requires **remarks**; backend `LeaveEmailApproveBody.remarks` min_length=1.
- Email approve/reject: **`web/proxy.ts`** + **`isLeaveEmailPublicPath`** — no session cookie required on `/leave/decision`, `/leave/reject`.
- Production leave email: **`leaveEmailDecisionApiBase()`** (direct Render URL), 60s timeout + retry — not Vercel `/api` proxy alone.
- Local dev: `/api` proxy targets **`http://127.0.0.1:8000`** when `NODE_ENV=development`.
- User dashboard **late arrivals**: recompute from check-in after **9:31**, exclude weekends/holidays/approved leave — not raw `late_minutes` only.
- Production frontend: GitHub **`main`** → Vercel; merge **`publish-main` → `main`** after feature pushes.
- Backend deploy: **Render** separate from Vercel; API env `FRONTEND_URL`, `BACKEND_PROXY_TARGET` / `NEXT_PUBLIC_API_URL`.
- Global API rate limit: `RateLimitMiddleware` + `RATE_LIMIT_ENABLED`.
- Root layout: **native `<script>`** for theme init — not `next/script` inside `<head>` (React 19).
- `AppShell` session: initial state `user=null`, `loadingSession=true` to avoid hydration mismatch.

## Rejected suggestions

- Re-adding **Admin overview** without explicit user request.
- Optional-only approval remarks on email approve.
- Stub-only `AddAttendanceDialog` on production dashboard header.
- `next/script` with `beforeInteractive` inside `<head>` in App Router layout.

## Repository landmines

- `web/proxy.ts` matcher `/leave/:path*` redirects unauthenticated users to `/login` unless path is in `isLeaveEmailPublicPath`.
- Git compare `main...publish-main` showing **0 files** = already merged, not “not pushed”.
- `dashboardMockStore` fallbacks can mask API failures in dev — verify real endpoints in production.
- Render cold start: first email-decision or KPI call may need retry; do not treat as auth failure.

## Production smoke (HRIS-APP)

| Step | Command | When |
|------|---------|------|
| Frontend build | `cd web && npm run build` | `web/` touched |
| Frontend lint | `cd web && npm run lint` | `web/` touched (note: repo may have pre-existing lint debt) |
| Backend import | `cd backend && .\.venv\Scripts\python.exe -c "from main import app"` | `backend/` touched |
| Backend tests | `cd backend && .\.venv\Scripts\python.exe -m pytest tests/ -q` | `backend/` or tests touched |
| Git hygiene | No `.env`, `__pycache__`, `web/.next`, credentials staged | Always |

## Training synthesis

- P1 issues: fix in the same session when feasible before push; do not only report.
- P0 blocks push: secrets in diff, broken auth on protected routes, missing public-route whitelist for email leave links.
- Post-deploy: hard refresh, test `/dashboard`, email leave link in incognito, `/leave` admin flows.
