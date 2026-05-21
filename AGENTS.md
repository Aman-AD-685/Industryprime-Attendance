# HRIS-APP — Agent instructions

## Pre-push review (required)

Before **commit**, **push**, or **deploy**, run the project skill:

- **Skill:** `.cursor/skills/pre-push-review/SKILL.md`
- **Rule:** `.cursor/rules/pre-push-review.mdc`
- **Compound Engineering:** invoke **ce-code-review** (`mode:report-only` before push)

Verdict must be **✅ Production Push Safe** or user must acknowledge **❌ Push Blocked** issues.

Production frontend (Vercel) tracks Git branch **`main`**. Merge `publish-main` into `main` after feature work.

## Stack

Next.js · FastAPI · Supabase · Render (API) · Vercel (web) · Postmark

## API rate limiting

`RATE_LIMIT_ENABLED` (default on) and `RATE_LIMIT_PER_MINUTE` in `backend/.env`. See `backend/middleware/rate_limit.py`.
