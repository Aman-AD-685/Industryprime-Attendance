# HRIS-APP — Agent instructions

## Ponytail (lazy senior dev — default: full)

Always-on: **`.cursor/rules/ponytail.mdc`**. Before coding, climb the 7-rung ladder (YAGNI → reuse codebase → stdlib → native → installed dep → one line → minimum). Say `ponytail lite` / `ultra` / `off` in chat.

- **Before done** (coding tasks): ponytail-review on session diff + **Ponytail review** block in reply (`.cursor/skills/ponytail-review/SKILL.md`).
- **Pre-push step 2b**: ponytail-review on push diff — **advisory P2/P3 only** (see `.cursor/skills/pre-push-compound-review/PONYTAIL.md`).
- Ponytail does **not** replace CE or Vivid Doctor for security/correctness.

Compact ladder (same as upstream Ponytail):

1. Does this need to exist? (YAGNI)
2. Already in this codebase? Reuse it.
3. Stdlib does it? Use it.
4. Native platform feature? Use it.
5. Installed dependency? Use it.
6. One line? One line.
7. Minimum code that works.

Not lazy about: security, trust-boundary validation, data-loss errors, accessibility, explicit requests.

## Pre-push guard (required before every push)

1. Read **`.cursor/local/pre-push-guard/SKILL.md`** and **`memory.md`** (local only — gitignored).
2. Run **Vivid Doctor** audit:
   ```powershell
   powershell -NoProfile -File .cursor/skills/pre-push-guard/scripts/run-production-audit.ps1
   ```
3. **Step 2b (Ponytail):** ponytail-review on push diff — advisory P2/P3 only (`.cursor/skills/pre-push-compound-review/PONYTAIL.md`). Does not block push.
4. Read **`.cursor/local/pre-push-guard/last-run-report.md`** — only push if **`VERDICT: SAFE`**.
5. Rule: **`.cursor/rules/pre-push-guard.mdc`** (always on).
6. **ce-code-review** when `ce-status.ps1` → `CE_STATUS=enabled`.

Do not push on P0 / security findings unless user writes: `push despite critical: <reason>`.

After push: merge **`publish-main` → `main`** (Vercel); redeploy **Render** if `backend/` changed.

Optional git hooks:
- PowerShell: `install-pre-push-hook.ps1` (Vivid Doctor audit)
- Shell (login Vitest + tsc): `sh hooks/install.sh` → `.git/hooks/pre-push`
- Auth regression: `cd web && npm run test:auth`

## Stack

Next.js · FastAPI · Supabase · Render (API) · Vercel (web) · Postmark

## API rate limiting

`RATE_LIMIT_ENABLED` (default **on**). Separate limits: `/auth/login` 20/min, `/auth/me` 120/min. See `backend/middleware/rate_limit.py`.
