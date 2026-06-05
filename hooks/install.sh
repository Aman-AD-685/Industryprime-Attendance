#!/usr/bin/env sh
# One-time install: copy repo pre-push hook into .git/hooks/
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/hooks/pre-push"
DEST="$ROOT/.git/hooks/pre-push"

if [ ! -d "$ROOT/.git/hooks" ]; then
  echo "Error: .git/hooks not found. Run this from the repository root after git init/clone."
  exit 1
fi

cp "$SRC" "$DEST"
chmod +x "$DEST"
echo "Installed pre-push hook → .git/hooks/pre-push"
echo "Runs: tsc --noEmit, vitest auth.test.ts, optional ruff before every git push."
