@AGENTS.md

# HRIS-APP — Claude Code notes

Everything in AGENTS.md above applies (ponytail ladder, pre-push guard). This file adds
what is specific to running Claude Code in this repo.

## Layout

- `backend/` — FastAPI (Python), Supabase-backed. Tests with pytest (`backend/pytest.ini`).
- `web/` — Next.js app (App Router, Supabase, TanStack Query). Has its own `CLAUDE.md`.
- `mobile/` — empty placeholder.
- Deploy: Vercel for `web/`, Render for `backend/` (`render.yaml`).

## Commands

- Web dev: `cd web && npm run dev`
- Web lint: `cd web && npm run lint`
- Web CI check (lint + build): `cd web && npm run test:ci`
- Web e2e: `cd web && npm run test:e2e`
- Backend tests: `cd backend && pytest`
- Backend single test: `cd backend && pytest tests/<file>.py -k <name>`

## Workflow

- Default branch is `main`. Never commit directly to it — create a feature branch first.
- Follow the pre-push guard in AGENTS.md before any push; do not push on P0 or security findings.
- After push: merge `publish-main` into `main`, and redeploy Render if `backend/` changed.
- Ask me before adding a dependency or changing database schema.

## Never

- Never read or print `backend/.env`, `web/.env.local`, or any real `.env` file.
  Read the matching `.env.example` to learn variable names instead.
- Never run destructive database commands (drop, truncate, or delete without a filter).
- Never run `git push --force`.
- Never commit a secret, key, or token — if you find one committed, report the file and line only.

## Shared agent config (single source of truth)

This repo's agent rules are written for Cursor and shared with Claude Code — do not
duplicate them, edit the originals:

@.cursor/rules/ponytail.mdc
@.cursor/rules/pre-push-guard.mdc

`.cursor/rules/pre-push-review.mdc` and `.cursor/rules/pre-push-compound-review.mdc` are
legacy pointers and are deliberately not loaded.

Skills in `.cursor/skills/` are mirrored as thin stubs under `.claude/skills/` so Claude
Code can trigger them; each stub reads the Cursor file. When you change a skill, change
the file under `.cursor/skills/` only.
