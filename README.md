# MyTV Stats

App **desktop** (Windows & macOS) thống kê Google Play reviews cho `vn.mytvnet.mobileb2c`.
**Không dùng database.** Chạy trên máy → tự sync và gửi mail báo cáo hàng ngày.

## Tính năng

- Lấy reviews **7 ngày** gần nhất qua Google Play Developer API
- Dashboard: hôm nay + 7 ngày, phân bố sao, trend, top version
- Bảng reviews: search, filter sao, phân trang
- Báo cáo theo ngày + **gửi Gmail tự động** theo lịch (Asia/Ho_Chi_Minh)
- Chạy nền / tray, khởi động cùng hệ thống

## Yêu cầu

- Node.js 20+
- Rust stable
- Tài khoản Gmail có **2-Step Verification** + [App Password](https://myaccount.google.com/apppasswords)
- Service Account JSON (Google Cloud / Play Console) — **không có sẵn trong repo**

## Cài đặt & chạy

```bash
npm install
npm run tauri dev
```

Mở tab **Settings** và cấu hình trực tiếp (lưu local trên máy, **không cần file `.env`**):

1. **Service Account JSON** — upload một lần; app lưu vào thư mục config, lần sau không hỏi lại
2. **Gmail gửi** + **App Password** + **Email nhận**
3. **Giờ gửi** + bật lịch hàng ngày
4. (Tuỳ chọn) khởi động cùng hệ thống
5. Bấm **Lưu cấu hình** → **Chạy thử ngay** để kiểm tra

Build release:

```bash
npm run tauri build
```

## Bảo mật

- Không commit `service_account.json` hay App Password
- Mẫu cấu trúc JSON: `src-tauri/credentials/service_account.example.json`
- Credentials chỉ nằm trên máy (app config) sau khi upload trong Settings

## Scripts

```bash
npm run tauri dev    # Desktop (dev)
npm run tauri build  # Desktop (installer)
```
