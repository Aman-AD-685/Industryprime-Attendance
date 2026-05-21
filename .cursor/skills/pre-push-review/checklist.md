# Pre-Push Checklist (HRIS-APP)

## Security
- [ ] No `.env`, keys, or tokens in diff
- [ ] No hardcoded secrets
- [ ] CORS not `*` in production config
- [ ] Auth on admin/master routes (`require_role`, bearer)
- [ ] Public routes intentional (`/leave/decision`, `/leave/reject`, `/health`)
- [ ] Email decision tokens single-use (`leave.py`)
- [ ] Upload paths validated (PDF, size)
- [ ] Rate limiting enabled in production (`RATE_LIMIT_ENABLED`)

## Frontend performance
- [ ] No new waterfall of serial `useEffect` fetches
- [ ] React Query: reasonable `staleTime` / avoid duplicate keys
- [ ] Large pages: consider `dynamic()` for heavy charts
- [ ] Images: `next/image` where applicable
- [ ] No `console.log` in committed client code
- [ ] Suspense on `useSearchParams` pages

## Backend performance
- [ ] Supabase queries scoped (limit, filters)
- [ ] No N+1 in new loops over employees
- [ ] Pagination on large lists
- [ ] Async for I/O; no blocking PDF work on event loop without care
- [ ] Cron/email: idempotent, log `sent: 0` vs errors

## Code quality
- [ ] No dead files in diff
- [ ] No duplicate logic vs existing helpers
- [ ] Functions &lt; ~80 lines where possible
- [ ] Matches existing naming (IndustryPrime, `apiFetch`, `getStoredUser`)

## Dependencies
- [ ] `npm audit` / `pip` advisories for new packages
- [ ] No duplicate libraries (two PDF libs, etc.)

## DevOps
- [ ] `FRONTEND_URL` set on API host (email links)
- [ ] `NEXT_PUBLIC_API_URL` on Vercel
- [ ] Migrations/SQL documented if schema changed
- [ ] Push target: **`main`** for production frontend
