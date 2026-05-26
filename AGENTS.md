# HRIS-APP — Agent instructions

## Pre-push guard (required before every push)

1. Read **`.cursor/local/pre-push-guard/SKILL.md`** and **`memory.md`** (local only — gitignored).
2. Run **Vivid Doctor** audit:
   ```powershell
   powershell -NoProfile -File .cursor/skills/pre-push-guard/scripts/run-production-audit.ps1
   ```
3. Read **`.cursor/local/pre-push-guard/last-run-report.md`** — only push if **`VERDICT: SAFE`**.
4. Rule: **`.cursor/rules/pre-push-guard.mdc`** (always on).
5. **ce-code-review** when `ce-status.ps1` → `CE_STATUS=enabled`.

Do not push on P0 / security findings unless user writes: `push despite critical: <reason>`.

After push: merge **`publish-main` → `main`** (Vercel); redeploy **Render** if `backend/` changed.

Optional git hook: `install-pre-push-hook.ps1`

## Stack

Next.js · FastAPI · Supabase · Render (API) · Vercel (web) · Postmark

## API rate limiting

`RATE_LIMIT_ENABLED` (default **on**). Separate limits: `/auth/login` 20/min, `/auth/me` 120/min. See `backend/middleware/rate_limit.py`.
