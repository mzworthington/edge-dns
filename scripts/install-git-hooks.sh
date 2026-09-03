#!/bin/sh
# Point this clone at versioned hooks in .githooks/ (no husky in this repo).
set -eu
ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
if [ ! -d "$ROOT/.git" ]; then
  exit 0
fi
git -C "$ROOT" config core.hooksPath .githooks
chmod +x "$ROOT/.githooks/commit-msg"
