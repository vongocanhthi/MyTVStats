# MyTV Stats

Dashboard thống kê Google Play reviews cho `vn.mytvnet.mobileb2c`.
**Không dùng database**. Web public chạy theo mô hình **static snapshot** 7 ngày gần nhất.

Hỗ trợ: **Desktop (Tauri)** · **Web local (Rust API)** · **GitHub Pages (static)**.

## Tính năng

- Lấy reviews 7 ngày gần nhất qua Google Play Developer API để sinh snapshot public
- Dashboard: hôm nay + 7 ngày, phân bố sao, trend, top version
- Bảng reviews: search, filter sao, phân trang
- Tab Báo cáo theo ngày để copy/gửi Gmail

## Yêu cầu

- Node.js 20+
- Rust stable (cho desktop / `web:dev`)
- Service Account JSON tại `src-tauri/credentials/service_account.json`
  - Trên GitHub Actions: set secret `GOOGLE_SERVICE_ACCOUNT_JSON` = nội dung file JSON

## Chạy desktop (Tauri)

```bash
npm install
npm run tauri dev
```

## Chạy web local

```bash
npm install
npm run web:dev
```

Mở `http://localhost:1420`. Vite proxy `/api/*` → Rust server (`:3001`), gọi Play API live.

## Generate snapshot public

```bash
npm run snapshot:generate
```

Tạo các file:

- `public/snapshots/stats.json`
- `public/snapshots/reviews.json`
- `public/snapshots/settings.json`

## Deploy GitHub Pages

- Workflow `Refresh Snapshot`: gọi Play API bằng secret `GOOGLE_SERVICE_ACCOUNT_JSON`, cập nhật `public/snapshots/*`
- Workflow `Deploy GitHub Pages`: build Vite static site và publish `dist`

Secret bắt buộc:

| Key | Value |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Toàn bộ nội dung `service_account.json` |

## Lưu ý

- Play API chỉ trả review tạo/sửa trong **~7 ngày**
- Web public hiển thị snapshot đã build sẵn, không gọi Play API trực tiếp trên client
- Nội dung reviews trong snapshot là **public** nếu site public
- Không lưu SQLite / không import CSV

## Scripts

```bash
npm run web:dev      # Rust API live + Vite
npm run tauri dev    # Desktop
npm run snapshot:generate
npm run build        # Frontend static cho GitHub Pages
```
