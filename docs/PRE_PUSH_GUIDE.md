# Pre-push guard — HRIS-APP

Mandatory gate before every **`git push`**.

## Local-only (never in git)

| Path | Purpose |
|------|---------|
| `.cursor/local/pre-push-guard/SKILL.md` | Full workflow |
| `.cursor/local/pre-push-guard/memory.md` | Learned rules |
| `.cursor/local/pre-push-guard/last-run-report.md` | Latest Vivid Doctor report |

## In repo

| Path | Purpose |
|------|---------|
| `.cursor/rules/pre-push-guard.mdc` | Always-on agent rule |
| `.cursor/skills/pre-push-guard/scripts/` | Audit + scope scripts |

## Run Vivid Doctor manually

```powershell
powershell -NoProfile -File .cursor/skills/pre-push-guard/scripts/run-production-audit.ps1
```

Push only when report shows **`VERDICT: SAFE`**.

## Optional git hook

```powershell
powershell -NoProfile -File .cursor/skills/pre-push-guard/scripts/install-pre-push-hook.ps1
```

## Deploy reminder

- **Vercel** ← branch **`main`**
- **Render** ← redeploy when `backend/` changes
- Workflow: `publish-main` → merge → `main`
