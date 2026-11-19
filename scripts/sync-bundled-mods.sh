#!/bin/sh
# Fork: copies the space-folders and space-header mods from a
# herdr-space-folders checkout into defaults/mods, so the next build ships
# them. Usage: scripts/sync-bundled-mods.sh <herdr-space-folders checkout>
#
# Copies the files a mod is made of (not hidden files, node_modules, or the
# jsconfig.json and gpui-kit.d.ts the runtime writes), and removes files the
# checkout no longer has. Review with `git diff defaults/mods` and commit.
set -eu

if [ $# -ne 1 ]; then
  echo "usage: $0 <herdr-space-folders checkout>" >&2
  exit 2
fi
from=$(cd "$1" && pwd -P)
repo=$(cd "$(dirname "$0")/.." && pwd -P)

# The copy is of the working tree, so a dirty mods/ would ship edits that the
# printed commit id does not contain.
if ! dirty=$(git -C "$from" status --porcelain -- mods/ 2>&1); then
  echo "sync-bundled-mods: cannot read git status of $from: $dirty" >&2
  exit 1
fi
if [ -n "$dirty" ]; then
  echo "sync-bundled-mods: $from/mods has uncommitted changes; commit or discard them first:" >&2
  echo "$dirty" >&2
  exit 1
fi

sources() {
  (cd "$1" && find . -type f ! -path '*/.*' ! -path '*/node_modules/*' ! -name jsconfig.json ! -name gpui-kit.d.ts | sed 's|^\./||' | sort)
}

for name in space-folders space-header; do
  src=$from/mods/$name
  dst=$repo/defaults/mods/$name
  if [ ! -f "$src/main.js" ]; then
    echo "sync-bundled-mods: $src/main.js is missing" >&2
    exit 1
  fi
  mkdir -p "$dst"
  sources "$src" | while IFS= read -r file; do
    mkdir -p "$(dirname "$dst/$file")"
    cmp -s "$src/$file" "$dst/$file" || cp "$src/$file" "$dst/$file"
  done
  sources "$dst" | while IFS= read -r file; do
    [ -f "$src/$file" ] || rm -f "$dst/$file"
  done
done
echo "sync-bundled-mods: copied from $from at $(git -C "$from" rev-parse --short HEAD 2>/dev/null || echo 'an unknown commit')"
