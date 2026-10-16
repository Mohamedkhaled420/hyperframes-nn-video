#!/usr/bin/env bash
# Self-hosted production runner (NOT used on Vercel — Vercel runs its own flow).
# Assembles the standalone output and starts the Node server.
set -euo pipefail

if [ ! -d .next/standalone ]; then
  echo "No .next/standalone found. Build it first:  npm run build:selfhost" >&2
  exit 1
fi

# Assemble static assets expected by the standalone server
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/ 2>/dev/null || true
cp -r public .next/standalone/ 2>/dev/null || true

echo "Starting standalone server on :3000 ..."
exec env NODE_ENV=production node .next/standalone/server.js
