#!/usr/bin/env sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
cd "$ROOT/backend"
command -v node >/dev/null 2>&1 || { echo "Node.js 20+ is required" >&2; exit 1; }
[ -f .env ] || { cp .env.example .env; echo "Created backend/.env; change APP_SECRET and ADMIN_PASSWORD."; }
exec node src/server.mjs
