# Pre-push guard (HRIS-APP)

## Local-only (never in git)

- `.cursor/local/pre-push-guard/SKILL.md`
- `.cursor/local/pre-push-guard/memory.md`
- `.cursor/local/pre-push-guard/daily-journal/`
- `.cursor/local/pre-push-guard/last-run-report.md`

## In repo (scripts only)

Run **Vivid Doctor** before every push:

```powershell
powershell -NoProfile -File .cursor/skills/pre-push-guard/scripts/run-production-audit.ps1
```

Install git hook (optional):

```powershell
powershell -NoProfile -File .cursor/skills/pre-push-guard/scripts/install-pre-push-hook.ps1
```
