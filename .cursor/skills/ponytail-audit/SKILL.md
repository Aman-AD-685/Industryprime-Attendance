---
name: ponytail-audit
description: >
  Whole-repo over-engineering audit (ranked delete/simplify list). Use when user
  says "ponytail audit", "find bloat", "what can we delete from this repo".
  Report only — does not apply fixes.
---

# ponytail-audit

Same tags as ponytail-review: `delete:` `stdlib:` `native:` `yagni:` `shrink:`

Scan the repo (not just diff). Rank biggest cuts first.

```
src/foo.py:L12-38: stdlib: custom date parse. Use datetime / Intl.
```

End with `net: -N lines, -N deps possible.` or **`Lean already. Ship.`**

Does not apply fixes. Correctness/security → CE / pre-push guard.
