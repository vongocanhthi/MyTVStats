# MyTV Stats

Dashboard thống kê Google Play reviews cho `vn.mytvnet.mobileb2c`, xây bằng **Tauri 2 + React + SQLite**, hỗ trợ cả **desktop** và **web** (HTTP API).

## Tính năng

- Import CSV reviews từ Google Play Console (full history)
- Sync reviews qua Google Play Developer API (7 ngày gần nhất)
- Dashboard: KPI, phân bố sao, trend tháng, top version
- Bảng reviews: search, filter theo sao, phân trang

## Yêu cầu

- Node.js 20+
- Rust stable
- Quyền Play Console + Service Account JSON (Reply to reviews)

## Chạy desktop (Tauri)

```bash
npm install
npm run tauri dev
```

## Chạy web (trình duyệt đầy đủ)

```bash
npm install
npm run web:dev
```

Mở `http://localhost:1420`. Vite proxy `/api/*` sang Rust HTTP server (`http://127.0.0.1:3001`).

Trong Settings:

1. **Chọn** Service Account JSON → **Lưu cấu hình**
2. **Import CSV vào DB** (upload file) hoặc **Sync reviews (7 ngày)**

DB web mặc định: `./data/mytvstats.db`. Service Account lưu tại `./data/service_account.json`.

> **Lưu ý multi-user:** bản web dùng **shared DB** — mọi người truy cập cùng một database/settings. Không có đăng nhập.

## Cấu hình Google Play API

1. Google Cloud Console → bật **Google Play Android Developer API**
2. Tạo Service Account, tải JSON key
3. Play Console → Users and permissions → invite service account với quyền **Reply to reviews**
4. Trong app: Settings → chọn JSON → Lưu → Sync

## Import CSV

Play Console → Reviews → Download CSV → Settings → Import.

## Lưu ý

- API `reviews.list` chỉ trả về review tạo/sửa trong **7 ngày gần nhất**
- Dùng CSV để bootstrap full history, sau đó sync API hàng ngày
- Desktop: DB nằm trong app data directory của Tauri (`mytvstats.db`)
- Web: DB nằm tại `./data/mytvstats.db`

## Scripts

```bash
npm run web:dev      # Web đầy đủ: Rust API + Vite (khuyến nghị cho browser)
npm run dev          # Vite frontend only (cần API riêng)
npm run tauri dev    # Full desktop app
npm run tauri build  # Build installer
```
# MyTVStats
