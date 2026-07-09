---
name: ponytail-help
description: >
  Ponytail quick reference for HRIS-APP / Cursor. Trigger: "ponytail help",
  "what ponytail commands", "how do I use ponytail". One-shot card; does not change mode.
---

# Ponytail help (Cursor — instruction only)

No `/plugin` menu in Cursor. **Say in chat:**

| You say | What happens |
|---------|----------------|
| `ponytail review` | Review current / session diff |
| `ponytail audit` | Whole-repo bloat scan |
| `ponytail help` | This card |
| `ponytail lite` / `ultra` / `off` | Change intensity |
| `stop ponytail` | Back to normal mode |

## Levels

| Level | Behavior |
|-------|----------|
| **lite** | Build asked; mention lazier option in one line |
| **full** | 7-rung ladder enforced (default) |
| **ultra** | Strict YAGNI |
| **off** | Paused until `/ponytail` or `ponytail full` |

## Files in this repo

| Piece | Path |
|-------|------|
| Always-on rule | `.cursor/rules/ponytail.mdc` |
| Main skill | `.cursor/skills/ponytail/SKILL.md` |
| Diff review | `.cursor/skills/ponytail-review/SKILL.md` |
| Repo audit | `.cursor/skills/ponytail-audit/SKILL.md` |
| Pre-push + workflow | `.cursor/skills/pre-push-compound-review/PONYTAIL.md` |

## Ponytail vs Compound Engineering

| | Ponytail | CE / pre-push guard |
|--|----------|---------------------|
| Focus | Bloat, YAGNI, smaller diff | Bugs, security, standards |
| Blocks push? | No (advisory P2/P3) | Yes on P0/P1 |

Source: [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) (MIT)
