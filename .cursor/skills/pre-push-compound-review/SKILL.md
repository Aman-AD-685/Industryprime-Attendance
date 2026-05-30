---
name: pre-push-compound-review
description: >-
  Mandatory 7-step production gate before git push or deploy for HRIS-APP. Uses memory,
  daily journals, PowerShell scope scripts, ce-code-review (report-only), native audit,
  production smoke tests, and verdict. Use when user says push, commit and push, deploy,
  go live, pre-push review, end of day, log today, sync training, or production readiness.
---

# Pre-push compound review (HRIS-APP)

Act as senior staff engineer + security auditor + performance engineer. **Never `git push` until this workflow completes and verdict is safe** (unless user overrides with `push despite critical: <reason>`).

**Repo root:** `c:\HRIS-APP` (adjust if worktree differs).

**Production:** Vercel → branch **`main`**. API → **Render**. Merge `publish-main` → `main` after feature pushes.

## When to run

| Trigger | Action |
|---------|--------|
| push, git push, commit and push | Full steps 0–7 |
| deploy, go live, production push | Full steps 0–7 |
| end of day, log today, sync training | Steps 0, 6 (+ optional push) |
| why is it slow | Performance section in `memory.md` + `reference.md` |

## Workflow

```text
0. Read memory.md + today’s journal + last 3 journal days
1. collect-push-scope.ps1
2. ce-status.ps1 → ce-code-review (report-only) if enabled
3. Native audit on changed files (reference.md)
4. Production smoke (memory.md table)
5. Pre-Push Report + verdict
6. append-daily-log.ps1 + update memory.md if needed
7. git add / commit / push (only if safe)
```

### Step 0 — Training context

Read:

- `.cursor/skills/pre-push-compound-review/memory.md`
- `.cursor/skills/pre-push-compound-review/daily-journal/YYYY-MM-DD.md` (today)
- Last **3** `daily-journal/*.md` files (by date)

Honor **Accepted**, **Rejected**, and **Repository landmines**.

### Step 1 — Collect push scope

From repo root:

```powershell
powershell -NoProfile -File .cursor/skills/pre-push-compound-review/scripts/collect-push-scope.ps1
```

Scope = staged + unstaged + commits ahead of `origin/<tracking-branch>`.

### Step 2 — Compound Engineering

```powershell
powershell -NoProfile -File .cursor/skills/pre-push-compound-review/scripts/ce-status.ps1
```

- If output contains `CE_STATUS=enabled` → run **ce-code-review** on diff `origin/<base>...HEAD` with **report-only** (no auto-edits unless user asks).
- If `disabled` → note in report: `Compound Engineering: not available (plugin disabled)`.

Merge CE findings with Step 3; dedupe by file + issue.

### Step 3 — Native deep audit

Audit every file in scope using `reference.md`. Map findings to **P0 / P1 / P2 / P3**.

**P1 default:** fix in this session before push when reasonable; do not only list homework.

### Step 4 — Production smoke

Run applicable rows from `memory.md` → **Production smoke**. Record pass/fail per command.

Minimum for any `web/` change: `npm run build`.

Minimum for any `backend/` change: `python -c "from main import app"` (use project venv).

### Step 5 — Pre-Push Report

Use this structure:

```markdown
# Pre-Push Report — <branch> @ <short-sha>

## Summary
- Files in scope: N
- Compound Engineering: ran | skipped | not available
- Production smoke: passed | failed (list commands)

## Findings
(For each issue: Severity P0–P3, File, Problem, Fix — or "None material")

## Scores
Security: /100 | Performance: /100 | Maintainability: /100 | Scalability: /100
Deployment risk: Low | Medium | High

## Verdict
✅ Production Push Safe
```
OR `❌ Push Blocked — Critical Issues Found` with numbered P0 fixes.

| Verdict | Push? |
|---------|-------|
| ✅ Production Push Safe | Yes |
| ❌ Push Blocked | No |
| User: `push despite critical: …` | Yes, log override in journal |

### Step 6 — Journal and memory

```powershell
powershell -NoProfile -File .cursor/skills/pre-push-compound-review/scripts/append-daily-log.ps1 -Section "Git activity" -Message "Pushed <sha> to origin/<branch>"
```

Update `memory.md` when user accepts/rejects a pattern or a landmine is confirmed.

Optional:

```powershell
powershell -NoProfile -File .cursor/skills/pre-push-compound-review/scripts/summarize-day.ps1
```

### Step 7 — Git

1. Stage only intended paths (never `.env`, `web/.next`, `__pycache__`).
2. Commit with clear message if needed.
3. `git push`
4. Remind: merge to **`main`** for Vercel; redeploy **Render** if API changed.

## Never commit

- `.env`, credentials, tokens
- `web/.next/`, `node_modules/`, `backend/**/__pycache__/`
- Accidental build artifacts

## Additional resources

- [reference.md](reference.md) — audit checklist
- [memory.md](memory.md) — learned rules
- [daily-journal/](daily-journal/) — day logs
- [docs/PRE_PUSH_GUIDE.md](../../../docs/PRE_PUSH_GUIDE.md) — team one-pager
