#!/usr/bin/env bash
# grain — SessionStart recall hook.
#
# Reads the hook payload from stdin, locates this project's memory, and injects a
# digest into the new session via hookSpecificOutput.additionalContext (global
# memory + the most recent project entries, newest first, within a char budget).
#
# Fails open: any problem -> exit 0 with no output, never blocking the session.
set -u

payload="$(cat)"
command -v jq >/dev/null 2>&1 || exit 0

cwd="$(printf '%s' "$payload" | jq -r '.cwd // empty' 2>/dev/null)"
[ -z "$cwd" ] && cwd="$PWD"

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
paths="$("$DIR/grain-paths.sh" "$cwd" 2>/dev/null)" || exit 0
mem_file="$(printf '%s\n' "$paths" | sed -n 1p)"
global_file="$(printf '%s\n' "$paths" | sed -n 2p)"

PROJECT_BUDGET="${GRAIN_RECALL_BUDGET:-6000}"
GLOBAL_BUDGET="${GRAIN_GLOBAL_BUDGET:-2000}"

digest=""

if [ -s "$global_file" ]; then
  digest+="$(head -c "$GLOBAL_BUDGET" "$global_file")"
  digest+=$'\n\n'
fi

if [ -s "$mem_file" ]; then
  # Emit whole "## " blocks from the top (newest first) until the next block
  # would exceed the budget. Drops the leading "# " title line.
  recent="$(awk -v budget="$PROJECT_BUDGET" '
    NR==1 && /^# /          { next }
    /^## / && block != "" {
      if (total + length(block) > budget) { stop = 1 }
      if (!stop) { printf "%s", block; total += length(block) }
      block = ""
      if (stop) exit
    }
    { block = block $0 "\n" }
    END { if (!stop && block != "" && total + length(block) <= budget) printf "%s", block }
  ' "$mem_file")"
  if [ -n "$recent" ]; then
    digest+="# grain · recent memory for this project"$'\n'
    digest+="_Most recent first. Full log (read or grep for more): ${mem_file}_"$'\n\n'
    digest+="$recent"
  fi
fi

[ -z "$digest" ] && exit 0

printf '%s' "$digest" | jq -Rs '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: .}}' 2>/dev/null
exit 0
