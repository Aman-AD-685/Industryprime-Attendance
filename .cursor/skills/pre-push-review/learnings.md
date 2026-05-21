# Pre-Push Learnings (HRIS-APP)

Updated by the agent after each review. Do not contradict **Accepted** patterns.

## Accepted patterns

- Dashboard header uses **`AddAttendanceHeaderLink`** (dropdown: Enter Atten. + Upload PDF), not `DashboardHeaderStrip` / `AddAttendanceDialog`.
- **Admin overview** (`/dashboard/admin`) removed; management cards link to `/attendance`, `/employees`, `/dashboard/roles`.
- Leave email **approve** requires **remarks** (`Why approve? (required)`); backend `LeaveEmailApproveBody.remarks` min_length=1.
- Production frontend deploys from GitHub **`main`**; merge `publish-main` → `main` after feature pushes.
- OTP send rate limit exists in `otp_service.py`; global API rate limit via `RateLimitMiddleware`.

## Rejected / do not re-suggest

- Re-adding **Admin overview** section without explicit user request.
- Optional-only approval remarks on email approve flow.
- Stub-only `AddAttendanceDialog` for production dashboard header.

## Performance notes

- `/dashboard` uses **cached session** + **120s staleTime** on admin queries; heavy charts are **dynamic imports**.
- `AppShell` shows UI from **localStorage** immediately; `/auth/me` revalidates in background (5 min session TTL).
- Login audit runs in **BackgroundTasks** (non-blocking).
- `apiFetch` has **12s timeout**; auth `/me` uses **8s**.
- Dashboard widgets mix **mock store** (`dashboardMockStore`) with real `/dashboard/summary` — verify production uses real data paths.

## Security notes

- `allow_origin_regex` for `*.vercel.app` on API — intentional for preview deploys; restrict if multi-tenant abuse is a concern.
- Leave decision links are **public** by design; tokens must stay single-use and short-lived.

## Deploy pitfalls

- Git compare `main...publish-main` showing **0 files** means already merged, not “not pushed”.
- Backend on Render must redeploy separately from Vercel for API changes.
