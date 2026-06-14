#!/usr/bin/env bash
# grain — resolve the per-project memory file and the global memory file for a
# given working directory.
#
# SINGLE SOURCE OF TRUTH for path/key logic: called by both recall.sh (bash) and
# capture.py (python) so the reader and writer always agree on the same files.
#
# Usage:   grain-paths.sh [cwd]
# Output:  line 1 -> <grain-dir>/projects/<key>/memory.md
#          line 2 -> <grain-dir>/global.md
#
# Override the storage dir for testing with GRAIN_DIR=/some/path.
set -u

cwd="${1:-$PWD}"
root="${GRAIN_DIR:-${CLAUDE_CONFIG_DIR:-$HOME/.claude}/grain}"

slugify() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9._-' '-' \
    | sed -E 's/-+/-/g; s/^-//; s/-$//'
}
shorthash() { printf '%s' "$1" | cksum | cut -d' ' -f1; }

key=""
if remote="$(git -C "$cwd" remote get-url origin 2>/dev/null)" && [ -n "$remote" ]; then
  # Normalise git@host:user/repo.git and https://host/user/repo.git -> user-repo
  norm="$(printf '%s' "$remote" | sed -E 's#\.git$##; s#^[a-zA-Z]+://##; s#^[^@/]+@##; s#:#/#g')"
  base="$(printf '%s' "$norm" | awk -F/ '{ if (NF>=2) print $(NF-1)"-"$NF; else print $NF }')"
  key="$(slugify "$base")"
elif top="$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null)" && [ -n "$top" ]; then
  key="$(slugify "$(basename "$top")")-$(shorthash "$top")"
else
  key="$(slugify "$(basename "$cwd")")-$(shorthash "$cwd")"
fi
[ -z "$key" ] && key="unknown-$(shorthash "$cwd")"

printf '%s/projects/%s/memory.md\n' "$root" "$key"
printf '%s/global.md\n' "$root"
