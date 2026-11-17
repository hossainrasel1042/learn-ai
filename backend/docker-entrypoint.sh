#!/bin/sh
# Container entrypoint.
#
# On Render the persistent disk is mounted at /app/contents by the platform and
# is owned by root with mode 0755. The application itself must not run as root,
# so the mount is handed over to the unprivileged account before the app starts.
# Outside Render the directory is already owned correctly and this is a no-op.
#
# The script only does the handover when it is actually running as root, which
# is never the case in the local Compose stack, so local behaviour is unchanged.

set -e

APP_USER=appuser
APP_GROUP=appgroup
DATA_DIR=/app/contents

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  chown -R "$APP_USER:$APP_GROUP" "$DATA_DIR" 2>/dev/null || true
  chmod 775 "$DATA_DIR" 2>/dev/null || true

  echo "[entrypoint] handing over to $APP_USER"
  exec setpriv --reuid="$APP_USER" --regid="$APP_GROUP" --init-groups -- "$@"
fi

exec "$@"
