#!/usr/bin/env sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
mkdir -p "$ROOT/backups"
TS="$(date +%Y%m%d_%H%M%S)"
cd "$ROOT"
if [ -d backend/data/uploads ]; then
  tar -czf "backups/helpdesk_$TS.tar.gz" backend/data/db.json backend/data/uploads
else
  tar -czf "backups/helpdesk_$TS.tar.gz" backend/data/db.json
fi
echo "Backed up database and attachments to backups/helpdesk_$TS.tar.gz"
