#!/bin/sh
# Prepare the tmux session "bench" for the owner (AGENTS.md rule 8).
# It only creates the session and its windows. The owner attaches and types.
# Usage: bench-session.sh [--print]   (--print shows the tmux commands, runs nothing)
set -eu

REPO=${REPO:-$(cd "$(dirname "$0")/../.." && pwd)}
TMP=${HOME}/.cache/zplc-tmp

run() {
  if [ "${PRINT:-0}" = 1 ]; then echo "$*"; else "$@"; fi
}

[ "${1:-}" = "--print" ] && PRINT=1

if [ "${PRINT:-0}" != 1 ] && tmux has-session -t bench 2>/dev/null; then
  echo "tmux attach -t bench"
  exit 0
fi

[ "${PRINT:-0}" = 1 ] || mkdir -p "$TMP"
run tmux new-session -d -s bench -n esp32s3 -c "$REPO" -e "TMPDIR=$TMP"
run tmux new-window -t bench -n pico -c "$REPO" -e "TMPDIR=$TMP"
run tmux new-window -t bench -n record -c "$REPO" -e "TMPDIR=$TMP"
[ "${PRINT:-0}" = 1 ] || echo "tmux attach -t bench"
