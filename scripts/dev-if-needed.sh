#!/usr/bin/env sh
set -e

if lsof -i :1420 >/dev/null 2>&1; then
  echo "[mytvstats] Vite đã chạy trên :1420 — bỏ qua npm run dev"
  exit 0
fi

npm run dev
