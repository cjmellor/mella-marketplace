#!/usr/bin/env bash
# grain — capture wrapper for PreCompact and SessionEnd.
#
# Tiny shim: locate python3 and hand the hook payload (on stdin) to capture.py.
# Fails open: if python3 is missing or capture errors, the session is unaffected.
#
# Usage: capture.sh <precompact|sessionend>
set -u

mode="${1:-sessionend}"
command -v python3 >/dev/null 2>&1 || exit 0

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
python3 "$DIR/capture.py" "$mode" || true
exit 0
