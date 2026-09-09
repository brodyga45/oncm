#!/bin/sh
set -eu
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then npm ci --no-audit --no-fund; fi
exec npm run dev -- "$@"
