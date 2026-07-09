---
name: ponytail-review
description: >
  Review diff for over-engineering only: delete, stdlib, native, yagni, shrink.
  Use when user says "ponytail review", before marking implementation done,
  or on pre-push diff (advisory). Not for security/correctness — use CE / pre-push guard.
---

# ponytail-review

Hunt **unnecessary complexity** in the diff. Correctness, security, and performance → CE / Vivid Doctor, not here.

## Format (one line per finding)

```
path/to/file.py:L88: yagni: helper with one caller. Inline at call site.
```

Tags: `delete:` | `stdlib:` | `native:` | `yagni:` | `shrink:`

End with: `net: -N lines possible.` or **`Lean already. Ship.`**

## HRIS — mandatory reply block (after implementation)

When you changed code in this session, append to your final reply:

```markdown
### Ponytail review
- Status: ran
- Net removable: -12 lines possible | Lean already. Ship.
- Cuts applied: removed unused helper X
- Remaining: (optional)
```

- **Small safe cuts** → apply in same session
- **Larger refactors** → list; ask before applying

## Pre-push (step 2b)

Advisory only on push diff. Include findings in Pre-Push Report under **Ponytail (P2/P3)**. Never block push alone.

## Boundaries

- Do not flag minimal smoke tests or assert self-checks for deletion
- Lists findings; applies only small safe cuts when doing phase-2 review
- `stop ponytail-review` / report-only → skip apply step
