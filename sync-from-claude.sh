#!/usr/bin/env bash
#
# sync-from-claude.sh
#
# Copies the latest source files from the Claude Cowork outputs folder
# (where Claude writes updates) into THIS project folder, so the local
# `npm start` / `npm run build:win-portable` runs the latest code.
#
# What it does:
#   - Auto-discovers the most recently modified Cowork "dfsq-practice"
#     folder under ~/Library/Application Support/Claude/, so it keeps
#     working even when Claude sessions rotate.
#   - Copies source, assets, README and package.json across.
#   - Excludes node_modules/, dist/, package-lock.json and user-data/.
#   - Shows you exactly what changed.
#
# Usage:
#   ./sync-from-claude.sh
#
# Run from inside the project folder, e.g. ~/dfsq. Safe to run repeatedly.
#

set -euo pipefail

# ------------------------------------------------------------------------
# 1) Where are we, and where should we copy from?
# ------------------------------------------------------------------------
HERE="$(cd "$(dirname "$0")" && pwd)"
COWORK_ROOT="$HOME/Library/Application Support/Claude/local-agent-mode-sessions"

if [ ! -d "$COWORK_ROOT" ]; then
  echo "ERROR: Couldn't find $COWORK_ROOT"
  echo "       Has Claude written anything to your Mac yet?"
  exit 1
fi

# Find the most-recently-modified dfsq-practice folder under any Cowork
# session. `ls -td` sorts by mtime descending.
SOURCE="$(ls -td "$COWORK_ROOT"/*/*/*/outputs/dfsq-practice 2>/dev/null | head -1 || true)"
if [ -z "$SOURCE" ] || [ ! -d "$SOURCE" ]; then
  echo "ERROR: Couldn't find a dfsq-practice folder inside any Claude session."
  echo "       Searched: $COWORK_ROOT/*/*/*/outputs/dfsq-practice"
  exit 1
fi

echo "Source : $SOURCE"
echo "Target : $HERE"
echo ""

# Refuse to sync into the same folder
if [ "$SOURCE" = "$HERE" ]; then
  echo "Source and target are the same folder. Nothing to do."
  exit 0
fi

# ------------------------------------------------------------------------
# 2) Do the copy. rsync if available (cleaner output), cp as fallback.
# ------------------------------------------------------------------------
if command -v rsync >/dev/null 2>&1; then
  echo "Syncing with rsync..."
  rsync -av --delete-excluded \
    --exclude='node_modules/' \
    --exclude='dist/' \
    --exclude='user-data/' \
    --exclude='package-lock.json' \
    --exclude='.DS_Store' \
    --exclude='sync-from-claude.sh.bak' \
    "$SOURCE/" "$HERE/" \
    | grep -v '^$' \
    | sed 's/^/  /'
else
  echo "rsync not found, falling back to cp..."
  # Copy each top-level item except excluded ones
  for item in "$SOURCE"/*; do
    name="$(basename "$item")"
    case "$name" in
      node_modules|dist|user-data|package-lock.json|.DS_Store) continue ;;
    esac
    rm -rf "$HERE/$name"
    cp -R "$item" "$HERE/"
    echo "  copied $name"
  done
fi

echo ""
echo "Sync complete."
echo ""
echo "Next steps:"
echo "  npm install                  # only if package.json changed"
echo "  npm start                    # run the app"
echo "  npm run build:win-portable   # build the Windows .exe (in ./dist)"
