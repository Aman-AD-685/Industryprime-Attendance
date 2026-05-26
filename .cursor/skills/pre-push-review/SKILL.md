---
name: pre-push-review
description: >-
  Mandatory production readiness audit before any git push or deploy. Scans security,
  performance, code quality, and DevOps risks; integrates Compound Engineering ce-code-review;
  blocks push on critical issues. Use when the user says push, commit, deploy, go live,
  pre-push review, why is the app slow, or production readiness.
---

# Pre-Push Review (legacy — short)

> **Prefer:** `.cursor/skills/pre-push-compound-review/SKILL.md` (7-step gate, scripts, journal, `memory.md`).  
> Rule: `.cursor/rules/pre-push-compound-review.mdc` · Guide: `docs/PRE_PUSH_GUIDE.md`

Act as senior staff engineer + security auditor + performance engineer. **Never push until this workflow completes.**

## When to run

- User asks to **commit**, **push**, **deploy**, or **go live**
- User asks **why pages are slow** or **loading is long**
- Before opening a PR (pair with **ce-code-review**)

## Workflow (in order)

```
1. Read learnings     → .cursor/skills/pre-push-review/learnings.md
2. Scope the diff     → git status; git diff; git log -5 --oneline
3. Compound review    → ce-code-review (mode:report-only if push not approved yet)
4. Project checklist  → checklist.md (security, perf, quality, DevOps)
5. Performance pass   → dashboard + auth + heavy routes (see below)
6. Verdict            → ✅ Production Push Safe | ❌ Push Blocked
7. Update learnings   → append accepted fixes / rejected suggestions
```

### Compound Engineering

Invoke the **ce-code-review** skill on the branch diff:

- Before push: `mode:report-only` (read-only findings)
- After user approves fixes: optional full review without report-only

Merge CE findings into this skill’s output format. Deduplicate by file + issue.

### Git push rule

| Verdict | Action |
|---------|--------|
| **❌ Push Blocked** | Critical/high security, secrets in diff, broken build, missing auth on sensitive route |
| **✅ Production Push Safe** | No critical issues; medium/low documented with follow-ups |

**Deployment reminder (this repo):** Vercel uses **`main`**. After pushing `publish-main`, merge into `main` or production will not update.

## Performance analyzer (HRIS-APP)

When asked why software is slow, check these **known patterns**:

| Area | Likely cause | Where |
|------|----------------|-------|
| Dashboard load | Many parallel queries + 30s `refetchInterval` on KPI/trend/dept/late | `web/lib/hooks/useAdminDashboard.ts`, `web/app/dashboard/page.tsx` |
| Session gate | `getCurrentUser()` on every protected navigation | `web/components/layout/AppShell.tsx` |
| Leave page | Full `leave/summary` per year/month | `web/app/leave/page.tsx` |
| Backend cold start | Render free tier spin-up | Deploy config, not code |
| No global rate limit | Abuse / burst traffic (mitigated after `RateLimitMiddleware`) | `backend/middleware/rate_limit.py` |

For each slow page: list network waterfall, heaviest component, API latency, bundle (large client components).

## Required output format

For **each** issue:

```markdown
## ISSUE
Severity: critical | high | medium | low
File:
Problem:

## WHY IT HAPPENS

## IMPACT

## FIX

## OPTIMIZED CODE
(optional snippet)

## RISK LEVEL

## PERFORMANCE/SECURITY BENEFIT
```

End with:

```markdown
# Go-Live Readiness
- Passed: …
- Failed: …
- Security score: /10
- Performance score: /10
- Maintainability score: /10
- Scalability score: /10
- Deployment risk: low | medium | high

## VERDICT
✅ Production Push Safe
```
or `❌ Push Blocked — Critical Issues Found` with numbered fixes.

## Self-learning

After every review:

1. Read `learnings.md`
2. If user **accepts** a fix → add pattern under **Accepted**
3. If user **rejects** → add under **Rejected** (do not suggest again)
4. Never re-suggest removed patterns (e.g. `DashboardHeaderStrip`, optional approve remarks)

## Stack context

Next.js · React · TypeScript · FastAPI · Supabase · PostgreSQL · Render · Vercel · Postmark · Tailwind

## Additional resources

- [checklist.md](checklist.md) — full audit categories
- [learnings.md](learnings.md) — repository memory
