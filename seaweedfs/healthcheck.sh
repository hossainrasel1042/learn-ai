#!/bin/sh

set -u

CODE=$(curl -sS -o /dev/null -w '%{http_code}' http://localhost:8333/ 2>/dev/null) || CODE=

if [ -z "$CODE" ] || [ "$CODE" = "000" ]; then
  exit 1
fi

case "$CODE" in
  1*|2*|3*|4*|5*) exit 0 ;;
  *)             exit 1 ;;
esac