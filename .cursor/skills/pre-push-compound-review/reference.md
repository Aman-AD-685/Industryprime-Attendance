# Pre-push reference checklist (HRIS-APP)

Use with **Step 3 — Native deep audit**. Severity: **P0** blocks push, **P1** fix before push, **P2/P3** document.

## Security

- [ ] No `.env`, keys, tokens, or `backend/.env` with real values in diff
- [ ] No hardcoded secrets in `web/` or `backend/`
- [ ] CORS: intentional `*.vercel.app` regex in `backend/main.py` — not `*` for all origins in prod
- [ ] Bearer auth on admin routes (`require_role`, `get_auth_context`)
- [ ] Public routes intentional: `/leave/decision`, `/leave/reject`, `/login`, `/attendance-entry`, `proxy.ts` whitelist
- [ ] Email decision tokens: verify + single-use JTI in `leave.py`
- [ ] File uploads: PDF/size validation on attendance upload paths
- [ ] `RATE_LIMIT_ENABLED` in production backend env

## Frontend (`web/`)

- [ ] `proxy.ts` public paths match `leaveEmailPublicPaths` + AppShell `isPublicRoute`
- [ ] No hydration mismatch: avoid `window`/`localStorage` in `useState` initializers for SSR shells
- [ ] `useSearchParams` pages wrapped in `Suspense`
- [ ] React Query: sensible `staleTime`; avoid aggressive `refetchInterval` on dashboard
- [ ] Heavy charts: `dynamic()` import where used
- [ ] `effectiveApiBase()` / `leaveEmailDecisionApiBase()` for cross-origin API
- [ ] No committed `console.log` noise

## Backend (`backend/`)

- [ ] Supabase queries: filters, limits, no unbounded `select *` in new code
- [ ] No N+1 over employees in new loops
- [ ] Leave/dashboard services: auth checks on tenant-scoped data
- [ ] Background work for slow I/O (email audit, etc.)
- [ ] SQL migrations documented under `backend/database/` if schema changed

## DevOps

- [ ] `FRONTEND_URL` on Render for email links
- [ ] Vercel: `NEXT_PUBLIC_API_URL`, `BACKEND_PROXY_TARGET`
- [ ] Push production UI via **`main`**
- [ ] Do not stage `web/.next`, `__pycache__`, `.pyc`

## Performance hotspots (investigate if touched)

| Area | Files |
|------|--------|
| Admin dashboard KPIs | `web/lib/hooks/useAdminDashboard.ts`, `web/app/dashboard/page.tsx` |
| Session / shell | `web/components/layout/AppShell.tsx`, `web/lib/auth.ts` |
| Leave summary | `web/app/leave/page.tsx`, `backend/services/leave_service.py` |
| Me dashboard late count | `backend/services/me_dashboard_service.py` |
| API proxy / cold start | `web/app/api/[[...slug]]/route.ts`, Render |
