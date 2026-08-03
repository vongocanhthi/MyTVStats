# MyTV Stats — Python CLI (độc lập)

Script headless: **fetch Google Play reviews → DeepSeek tóm tắt → gửi Gmail**.

Không phụ thuộc app Tauri/React UI trong repo. Chạy trên Windows / macOS / Linux với Python 3.10+.

## Phát hành cho user (người làm release)

Từ máy dev, trong thư mục `python/`:

```bash
python3 pack_release.py
```

Ra file: `dist/MyTVStats-python-YYYYMMDD.zip` (không kèm `.venv`, `config.json`, service account).

Cách gửi user:

1. Upload zip lên Drive / GitHub Release / share nội bộ
2. User tải → giải nén → làm theo mục bên dưới

---

## Ví dụ: user tải zip và chạy trên máy

1. Giải nén `MyTVStats-python-….zip`
2. Cài [Python 3.10+](https://www.python.org/downloads/) (Windows: tick **Add to PATH**)
3. Chạy setup:

```bash
# macOS / Linux
cd MyTVStats-python
chmod +x setup.sh
./setup.sh

# Windows: double-click setup.bat
# hoặc trong cmd:
cd MyTVStats-python
setup.bat
```

Setup sẽ tạo `.venv`, cài dependency, và copy `config.example.jsonc` → `config.json` nếu chưa có.

### Điền credentials

Mở `config.json` (mẫu gốc: `config.example.jsonc` có sẵn comment):

1. **Service Account:** copy file JSON từ Google Cloud/Play Console vào  
   `credentials/service_account.json`
2. **Gmail gửi (`from` + `app_password`):** Gmail có 2FA + [App Password](https://myaccount.google.com/apppasswords)  
   (`to` / `cc` / `bcc` có thể là `@gmail.com`, `@vnpt.vn`, … — chỉ *người nhận*)
3. **`deepseek.api_key`**
4. (Tuỳ chọn) sửa `schedule.hour` / `minute` — mặc định **09:00** VN  
5. `autostart.enabled` mặc định `true`

### Chạy thử → gửi mail → auto-start

```bash
# macOS / Linux
source .venv/bin/activate

# Windows
# .venv\Scripts\activate.bat

python main.py run-once --dry-run
python main.py run-once
python main.py sync-autostart
python main.py next-run
python main.py autostart-status
```

Từ lần đăng nhập sau, máy tự chạy `serve` và gửi đúng giờ trong `schedule`.

---

## Cài đặt thủ công (nếu không dùng setup.sh / setup.bat)

```bash
cd MyTVStats-python   # hoặc python/ trong repo
python3 -m venv .venv

# macOS / Linux
source .venv/bin/activate

# Windows (PowerShell)
# .venv\Scripts\Activate.ps1

pip install -r requirements.txt
cp config.example.jsonc config.json
```

Điền `config.json` (xem comment trong `config.example.jsonc`):

1. Service Account — copy file JSON vào `credentials/` và **đặt tên `service_account.json`**
2. Gmail — `from` phải là Gmail + App Password; `to`/`cc`/`bcc` nhận được mọi domain (vd. `@vnpt.vn`)
3. `deepseek.api_key`
4. `report_day_target`: `"yesterday"` hoặc `"today"`
5. `schedule` — giờ gửi hàng ngày (mặc định **09:00** Asia/Ho_Chi_Minh)
6. `autostart.enabled` — mặc định `true`; sau khi sửa chạy `python main.py sync-autostart`

## Chạy

```bash
# Xem source report, không gọi DeepSeek / không gửi mail
python main.py run-once --dry-run

# Full: DeepSeek + gửi mail (một lần)
python main.py run-once

# Xem lần chạy lịch kế tiếp
python main.py next-run

# Chạy nền — gửi đúng giờ mỗi ngày (mặc định 09:00 VN)
python main.py serve

# Gửi ngay rồi mới chờ lịch
python main.py serve --run-now
```

Sửa giờ trong `config.json` (vd. `11:30`) khi `serve` đang chạy — vòng lặp tự nhận trong ~30s:

```json
"schedule": {
  "enabled": true,
  "hour": 11,
  "minute": 30,
  "timezone": "Asia/Ho_Chi_Minh"
}
```

## Auto-start (khởi động cùng hệ thống)

Trong `config.json`:

```json
"autostart": {
  "enabled": true
}
```

Rồi áp dụng lên OS:

```bash
python main.py sync-autostart      # true → cài; false → gỡ
python main.py autostart-status
```

| OS | Cơ chế |
|----|--------|
| macOS | LaunchAgent (`~/Library/LaunchAgents/com.mytvstats.python-report.plist`) |
| Windows | Task Scheduler `ONLOGON` (`MyTVStatsPythonReport`) |
| Linux | systemd user (`~/.config/systemd/user/mytv-stats-report.service`) |

`install-autostart` / `uninstall-autostart` vẫn dùng được (bỏ qua flag trong config).

Log: `logs/autostart.out.log` / `logs/autostart.err.log`.

**Linux server** (không GUI login): sau khi bật, thêm `loginctl enable-linger $USER`.
## Lưu ý

- Thư mục này **không** sửa code UI.
- Không commit `config.json`, App Password, hay Service Account JSON.
- Prompt mặc định nằm trong `mytv_report/prompt.py`; để `""` trong config là dùng mặc định.
- Trạng thái “đã gửi hôm nay” lưu tại `data/schedule_state.json` (tránh gửi trùng trong cùng ngày).
