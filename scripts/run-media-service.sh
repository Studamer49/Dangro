#!/usr/bin/env bash
#
# Runs the media service with its key file loaded.
#
#   bash scripts/run-media-service.sh [--foreground]
#
# Exists so nobody has to get `set -a; . file; set +a; <command>` right in a
# one-liner — an easy way to silently start nothing at all.
#
# Prefers the compiled output in server/dist, falling back to tsx so it works
# before the first build.

set -euo pipefail

ENV_FILE="${MEDIA_ENV_FILE:-$HOME/.dangro-media.env}"
FOREGROUND=0

for arg in "$@"; do
  case "$arg" in
    -f|--foreground) FOREGROUND=1 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

if [ ! -f "$ENV_FILE" ]; then
  echo "Key file not found: $ENV_FILE" >&2
  echo "Create it first:  bash scripts/setup-media-env.sh" >&2
  exit 1
fi

cd "$(dirname "$0")/../server"

# Compiled output when it exists, otherwise run from source via tsx.
if [ -f dist/media-service/index.js ]; then
  ENTRY=(node dist/media-service/index.js)
else
  ENTRY=(npx tsx src/media-service/index.ts)
fi

if [ "$FOREGROUND" -eq 1 ]; then
  set -a; . "$ENV_FILE"; set +a
  exec "${ENTRY[@]}"
fi

# Backgrounded and detached from this terminal, logging to a file, so closing
# the shell or dropping an SSH session does not take the service down.
mkdir -p "$HOME"
nohup env $(grep -v '^#' "$ENV_FILE" | grep -v '^$' | xargs) "${ENTRY[@]}" \
  > "$HOME/dangro-media.log" 2>&1 &
echo "Started media service (pid $!). Log: $HOME/dangro-media.log"
echo "Check: curl -s http://127.0.0.1:\$(grep MEDIA_PORT "$ENV_FILE" | cut -d= -f2)/health"
echo "Stop:   pkill -f media-service"