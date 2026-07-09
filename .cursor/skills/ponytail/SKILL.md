---
name: ponytail
description: >
  Lazy senior dev mode for HRIS-APP: YAGNI, reuse codebase, stdlib/native first,
  minimum diff. Modes lite/full (default)/ultra/off. Use on fix/build/add/update/
  create/write/refactor. Say "ponytail", "be lazy", "yagni", "minimal solution".
  Not for pure Q&A without code.
---

# Ponytail (HRIS-APP)

Default mode: **full**. Switch in chat: `ponytail lite` | `ponytail ultra` | `ponytail off` | `stop ponytail`.

Read `.cursor/rules/ponytail.mdc` for the always-on ladder.

## The 7-rung ladder

1. Does this need to exist? → skip (YAGNI)
2. Already in this codebase? → reuse
3. Stdlib does it? → use it
4. Native platform feature? → use it (CSS, `<input type="date">`, etc.)
5. Installed dependency? → use it (no new package)
6. One line? → one line
7. Only then → minimum code that works

## Intensity

| Level | Behavior |
|-------|----------|
| **lite** | Build what's asked; one-line lazier alternative |
| **full** | Ladder enforced; shortest diff (default) |
| **ultra** | YAGNI extreme; challenge extra requirements |
| **off** | Normal agent until re-enabled |

## Phase 2 — before "done" (mandatory when you changed code)

1. Read `.cursor/skills/ponytail-review/SKILL.md`
2. Review **files changed in this task** (not whole repo unless asked)
3. Apply **small safe cuts** (dead code, duplicate util) in the same session
4. End implementation replies with:

```markdown
### Ponytail review
- Status: ran
- Net removable: <net line or "Lean already. Ship.">
- Cuts applied: <list or "none">
- Remaining: <optional follow-ups>
```

Skip when: pure Q&A, user said report-only, or no diff.

## Phase 3 — pre-push (advisory)

On `git push` / deploy: run ponytail-review on **push diff** per `.cursor/skills/pre-push-compound-review/PONYTAIL.md`. **P2/P3 only** — does not block push; Vivid Doctor + CE own P0/P1.

## HRIS conventions to reuse (don't reinvent)

- Auth: `web/lib/auth.ts`, `get_auth_context`, `require_role`
- API: `apiFetch`, `publicApiFetch`, `fetchWithTimeout`
- Permissions: `web/lib/permissions.ts` → `can.*`
- Leave math: `leave_month_balance_snapshot`, `compute_leave_attendance_days_by_months`
- Pre-push: `.cursor/skills/pre-push-guard/` + local `memory.md`

## `ponytail:` comments

```python
# ponytail: paginated scan capped at 500 rows; add index if table grows
```
