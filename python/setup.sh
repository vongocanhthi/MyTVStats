#!/usr/bin/env bash
# Setup lần đầu — macOS / Linux
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Cần cài Python 3.10+ trước: https://www.python.org/downloads/"
  exit 1
fi

python3 -m venv .venv
# shellcheck disable=SC1091
source .venv/bin/activate
pip install -U pip
pip install -r requirements.txt

if [[ ! -f config.json ]]; then
  cp config.example.jsonc config.json
  echo "Đã tạo config.json từ config.example.jsonc — hãy mở và điền credentials."
else
  echo "config.json đã tồn tại — giữ nguyên."
fi

mkdir -p credentials
echo
echo "Tiếp theo:"
echo "  1. Copy Service Account JSON → credentials/service_account.json"
echo "  2. Sửa config.json (Gmail + DeepSeek key)"
echo "  3. source .venv/bin/activate"
echo "  4. python main.py run-once --dry-run"
echo "  5. python main.py sync-autostart"
