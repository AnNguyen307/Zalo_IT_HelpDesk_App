#!/usr/bin/env sh
set -eu
command -v cloudflared >/dev/null 2>&1 || { echo "cloudflared is required" >&2; exit 1; }
echo "Quick Tunnel is temporary; its URL changes after restart."
exec cloudflared tunnel --url http://localhost:8080
