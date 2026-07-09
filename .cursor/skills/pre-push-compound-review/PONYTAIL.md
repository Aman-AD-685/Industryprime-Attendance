# Ponytail + pre-push (HRIS-APP)

Ponytail keeps diffs lean; **Compound Engineering** and **Vivid Doctor** keep them safe.

## Pre-push workflow (with Ponytail)

```text
0. Read .cursor/local/pre-push-guard/memory.md
1. collect-push-scope.ps1
2. run-production-audit.ps1  → VERDICT: SAFE required
2b. ponytail-review on PUSH DIFF (advisory P2/P3 — does NOT block push)
3. ce-code-review report-only if CE_STATUS=enabled
4–8. Report, memory, journal, git push if SAFE
```

## Phase 1 — While writing

Applies to: fix, build, implement, add, update, create, write, wire, refactor.

- Climb the 7-rung ladder (`.cursor/rules/ponytail.mdc`)
- Search repo for existing helpers first
- Deletion over addition; fewest files

Still **not** lazy about: security, boundary validation, data-loss errors, accessibility, explicit user requests.

## Phase 2 — Before done (implementation)

Before saying "done" on a coding task:

1. Run **ponytail-review** on files changed in the session
2. Apply small safe cuts in the same session
3. Add to the reply:

```markdown
### Ponytail review
- Status: ran
- Net removable: …
- Cuts applied: …
- Remaining: …
```

Skipped: pure Q&A, report-only, no diff.

## Phase 3 — Pre-push (step 2b)

On `git push` / deploy:

- Review the **same scope as the push diff** with ponytail-review tags
- Record under **Ponytail (advisory)** in the Pre-Push Report
- **Never** block push on Ponytail alone — only Vivid Doctor P0 / CE P0–P1 block

## Tags

| Tag | Meaning |
|-----|---------|
| `delete:` | Dead / speculative code |
| `stdlib:` | Reinventing stdlib |
| `native:` | Platform already has it |
| `yagni:` | Abstraction with one use |
| `shrink:` | Same logic, fewer lines |

## Intensity

| Mode | Chat trigger |
|------|----------------|
| lite | `ponytail lite` |
| full | default |
| ultra | `ponytail ultra` |
| off | `ponytail off` / `stop ponytail` |

## `ponytail:` comments in code

Document deliberate shortcuts and when to upgrade:

```python
# ponytail: employee list capped at 5000; paginate if roster grows
```
