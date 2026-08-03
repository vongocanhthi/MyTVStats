#!/usr/bin/env sh
set -e

# Không dùng lsof: macOS/Cursor thường để lại socket CLOSED trên :1420
# → false positive, bỏ qua Vite trong khi không có HTTP server thật.
if curl -sf --connect-timeout 1 --max-time 2 "http://127.0.0.1:1420/" >/dev/null 2>&1; then
  echo "[mytvstats] Vite đã chạy trên :1420 — bỏ qua npm run dev"
  exit 0
fi

npm run dev
