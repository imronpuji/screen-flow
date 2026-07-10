#!/usr/bin/env bash
# Run Screen Flow (Electron + Vite dev server) locally.
#
#   ./scripts/run-app.sh
#
# - Reuses the Vite dev server on :5173 if it's already running, else starts it.
# - Rebuilds the Electron main/preload (tsc) so the latest code loads.
# - Kills any previous Screen Flow Electron window, then launches a fresh one.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PORT=5173
ELECTRON_MATCH="node_modules/electron/dist/Electron.app/Contents/MacOS/Electron ."

echo "▸ Ensuring Vite dev server on :$PORT"
if curl -s -o /dev/null "http://localhost:$PORT/"; then
  echo "  already running — reusing it"
else
  echo "  starting vite…"
  npm run dev >/tmp/screen-flow-vite.log 2>&1 &
  for _ in $(seq 1 30); do
    curl -s -o /dev/null "http://localhost:$PORT/" && break
    sleep 0.5
  done
  curl -s -o /dev/null "http://localhost:$PORT/" || { echo "  ✗ vite failed to start (see /tmp/screen-flow-vite.log)"; exit 1; }
  echo "  vite up"
fi

echo "▸ Building Electron main/preload"
npm run build:electron

echo "▸ Restarting Electron window"
pkill -f "$ELECTRON_MATCH" 2>/dev/null || true
sleep 1
npx electron . >/tmp/screen-flow-electron.log 2>&1 &
echo "  launched (logs: /tmp/screen-flow-electron.log)"

sleep 3
if pgrep -f "$ELECTRON_MATCH" >/dev/null; then
  echo "✅ Screen Flow is running (pid $(pgrep -f "$ELECTRON_MATCH" | head -1))"
else
  echo "✗ Electron did not stay up — check /tmp/screen-flow-electron.log"
  exit 1
fi
