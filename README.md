# MyTV Stats

Dashboard thống kê Google Play reviews cho `vn.mytvnet.mobileb2c`.
**Không dùng database** — mỗi lần xem gọi trực tiếp Play API (7 ngày gần nhất).

Hỗ trợ: **Desktop (Tauri)** · **Web local (Rust API)** · **Vercel (Serverless TS)**.

## Tính năng

- Lấy reviews realtime qua Google Play Developer API (7 ngày)
- Dashboard: hôm nay + 7 ngày, phân bố sao, trend, top version
- Bảng reviews: search, filter sao, phân trang
- Nút **Làm mới dữ liệu** trong Settings

## Yêu cầu

- Node.js 20+
- Rust stable (cho desktop / `web:dev`)
- Service Account JSON tại `src-tauri/credentials/service_account.json`
  - Trên Vercel: set env `GOOGLE_SERVICE_ACCOUNT_JSON` = nội dung file JSON

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

## Deploy Vercel

```bash
npx vercel
```

Env bắt buộc:

| Key | Value |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Toàn bộ nội dung `service_account.json` |

API serverless: `/api/stats`, `/api/reviews`, `/api/settings`.

## Lưu ý

- Play API chỉ trả review tạo/sửa trong **~7 ngày**
- Không lưu SQLite / không sync / không import CSV
- Mỗi lần tải trang có thể mất vài giây (gọi Google)

## Scripts

```bash
npm run web:dev      # Rust API live + Vite
npm run tauri dev    # Desktop
npm run build        # Frontend static (Vercel build)
npx vercel           # Deploy
```
