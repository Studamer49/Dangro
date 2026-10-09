#!/usr/bin/env bash
#
# Creates ~/.dangro-media.env for the media service.
#
#   bash scripts/setup-media-env.sh [path]
#
# Writes MEDIA_KEY (a fresh random secret), MEDIA_DIR and MEDIA_PORT with
# owner-only permissions, then prints what to do next. Refuses to overwrite an
# existing file unless you pass --force, because rotating this key by accident
# silently breaks uploads.

set -euo pipefail

TARGET="${1:-$HOME/.dangro-media.env}"
MEDIA_DIR="${MEDIA_DIR:-$HOME/dangro-media}"
MEDIA_PORT="${MEDIA_PORT:-8081}"
FORCE=0

if [ "${2:-}" = "--force" ] || [ "${1:-}" = "--force" ]; then
  FORCE=1
fi

if [ -e "$TARGET" ] && [ "$FORCE" -eq 0 ]; then
  echo "Refusing to overwrite $TARGET (it already exists)."
  echo "Pass --force if you really want a new key — it will invalidate the one"
  echo "currently set on the API host as MEDIA_INGEST_KEY."
  exit 1
fi

# Prefer node, which is already required to run the app. Fall back to openssl.
if command -v node >/dev/null 2>&1; then
  KEY="$(node -e 'console.log(require("crypto").randomBytes(48).toString("base64"))')"
elif command -v openssl >/dev/null 2>&1; then
  KEY="$(openssl rand -base64 48)"
else
  echo "Need either node or openssl to generate MEDIA_KEY." >&2
  exit 1
fi

umask 077
cat > "$TARGET" <<EOF
MEDIA_KEY=$KEY
MEDIA_DIR=$MEDIA_DIR
MEDIA_PORT=$MEDIA_PORT
EOF
chmod 600 "$TARGET"

echo "Wrote $TARGET (mode 0600)"
echo
echo "MEDIA_KEY below is shown once. Copy it into the API host as"
echo "MEDIA_INGEST_KEY — do not paste it into chats or commit it."
echo
echo "  MEDIA_KEY=$KEY"
echo
echo "Next:"
echo "  1. cd server && set -a && . $TARGET && set +a && npm run media:start"
echo "  2. tailscale funnel --bg $MEDIA_PORT"
echo "  3. On the API host set MEDIA_PROVIDER=remote, MEDIA_PUBLIC_URL,"
echo "     MEDIA_INGEST_URL and MEDIA_INGEST_KEY (the value above)."