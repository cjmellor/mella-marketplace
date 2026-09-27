#!/usr/bin/env bash
set -euo pipefail

deps=(vendor node_modules)
install() { composer install --no-interaction && bun install --frozen-lockfile; }

dir=$(jq -r '.new_cwd // .cwd')
cd "$dir" 2>/dev/null || exit 0
git_dir=$(git rev-parse --path-format=absolute --git-dir 2>/dev/null) || exit 0
common_dir=$(git rev-parse --path-format=absolute --git-common-dir)
[ "$git_dir" = "$common_dir" ] && exit 0

main=$(dirname "$common_dir")
cd "$(git rev-parse --show-toplevel)"
missing=0
for d in "${deps[@]}"; do [ -e "$d" ] || missing=1; done
[ "$missing" = 1 ] || exit 0

mkdir "$git_dir/deps.lock" 2>/dev/null || exit 0
trap 'rmdir "$git_dir/deps.lock"' EXIT

for d in "${deps[@]}"; do
  [ -e "$d" ] || [ ! -e "$main/$d" ] || cp -c -R "$main/$d" "$d"
done

log="$git_dir/worktree-deps.log"
if ! install >"$log" 2>&1; then
  echo "worktree-deps: install failed, see $log" >&2
  exit 1
fi
echo "Worktree deps ready: ${deps[*]} cloned from $main, then reconciled by the package managers (log: $log)."
