#!/usr/bin/env bash
set -euo pipefail
cd /workspace

if ss -tlnH sport = :8080 2>/dev/null | grep -q .; then
  echo "Static dev server already listening on 8080"
  exit 0
fi

exec python3 -m http.server 8080 --bind 0.0.0.0
