#!/usr/bin/env bash
set -euo pipefail

# Cursor/sandbox may set CARGO_TARGET_DIR; prefer project-local target for web-dev.
unset CARGO_TARGET_DIR || true

WEB_PORT="${MYTVSTATS_WEB_PORT:-3001}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "Starting web backend on http://127.0.0.1:${WEB_PORT} (live Play API, no DB)"
export MYTVSTATS_WEB_PORT="${WEB_PORT}"

cargo run --bin web_server --manifest-path src-tauri/Cargo.toml &
backend_pid=$!

cleanup() {
  kill "${backend_pid}" >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM

for _ in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:${WEB_PORT}/api/settings" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

echo "Starting Vite frontend on http://localhost:1420 (proxy /api -> :${WEB_PORT})"
export VITE_API_BASE_URL="/api"
npm run dev
