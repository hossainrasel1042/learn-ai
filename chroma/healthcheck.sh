#!/usr/bin/env bash
set -uo pipefail

exec 3<>/dev/tcp/127.0.0.1/8000 || {
    echo "chroma: cannot connect to 127.0.0.1:8000" >&2
    exit 1
}

printf 'GET /api/v2/heartbeat HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n' >&3

status="$(head -1 <&3 2>/dev/null || true)"

case "$status" in
    *" 200 "*)
        echo "chroma: heartbeat ok"
        exit 0
        ;;
    *)
        echo "chroma: unexpected heartbeat response: ${status:-<none>}" >&2
        exit 1
        ;;
esac
