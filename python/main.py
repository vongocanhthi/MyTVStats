#!/usr/bin/env python3
"""CLI báo cáo MyTV Reviews — độc lập với app Tauri UI."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from mytv_report import autostart
from mytv_report.config import load_config
from mytv_report.pipeline import run_once, save_preview
from mytv_report.report import today_day_key_vn, yesterday_day_key_vn
from mytv_report.scheduler import next_run_at, run_scheduled_job, serve_forever


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="MyTV Stats Python — sync reviews, tóm tắt DeepSeek, gửi Gmail.",
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=None,
        help="Đường dẫn config.json (mặc định: ./config.json)",
    )

    sub = parser.add_subparsers(dest="command", required=True)

    run_parser = sub.add_parser(
        "run-once",
        help="Fetch reviews → DeepSeek (nếu >0) → gửi mail",
    )
    run_parser.add_argument(
        "--day",
        default=None,
        help="Ngày YYYY-MM-DD (mặc định theo report_day_target trong config)",
    )
    run_parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Không gọi DeepSeek / không gửi mail — in source report",
    )
    run_parser.add_argument(
        "--no-send",
        action="store_true",
        help="Gọi DeepSeek nhưng không gửi mail",
    )
    run_parser.add_argument(
        "--save",
        type=Path,
        default=None,
        help="Lưu bản preview vào thư mục (vd: ./out)",
    )

    serve_parser = sub.add_parser(
        "serve",
        help="Chạy nền: gửi báo cáo đúng giờ mỗi ngày (mặc định 09:00 VN)",
    )
    serve_parser.add_argument(
        "--run-now",
        action="store_true",
        help="Gửi ngay một lần rồi mới vào vòng chờ lịch",
    )

    sub.add_parser(
        "sync-autostart",
        help="Áp dụng config.autostart.enabled (true→cài, false→gỡ) lên hệ thống",
    )
    sub.add_parser(
        "install-autostart",
        help="Cài khởi động cùng hệ thống (bỏ qua config; macOS/Windows/Linux)",
    )
    sub.add_parser("uninstall-autostart", help="Gỡ auto-start đã cài (bỏ qua config)")
    sub.add_parser("autostart-status", help="Kiểm tra trạng thái auto-start")

    sub.add_parser("today", help="In ngày hôm nay (Asia/Ho_Chi_Minh)")
    sub.add_parser("yesterday", help="In ngày hôm qua (Asia/Ho_Chi_Minh)")
    sub.add_parser("next-run", help="In lần chạy lịch kế tiếp theo config")

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command == "today":
        print(today_day_key_vn())
        return 0
    if args.command == "yesterday":
        print(yesterday_day_key_vn())
        return 0

    try:
        config = load_config(args.config)
    except (FileNotFoundError, ValueError, OSError) as err:
        print(f"Config lỗi: {err}", file=sys.stderr)
        return 1

    if args.command == "next-run":
        if not config.schedule.enabled:
            print("Lịch đang tắt (schedule.enabled=false)")
            return 0
        print(next_run_at(config).isoformat())
        print(
            f"Mỗi ngày {config.schedule.hour:02d}:{config.schedule.minute:02d} "
            f"({config.schedule.timezone})",
            file=sys.stderr,
        )
        return 0

    if args.command == "run-once":
        try:
            result = run_once(
                config,
                day_key=args.day,
                dry_run=args.dry_run,
                send=not args.no_send and not args.dry_run,
            )
        except Exception as err:  # noqa: BLE001 — CLI surface lỗi rõ ràng
            print(f"Chạy thất bại: {err}", file=sys.stderr)
            return 1

        print(f"Ngày: {result.day_key}")
        print(f"Reviews: {result.review_count}")
        print(f"Subject: {result.subject}")
        print(f"Sent: {result.sent}")
        print("---")
        print(result.body)

        if args.save:
            path = save_preview(result, args.save)
            print(f"\nĐã lưu: {path}", file=sys.stderr)

        return 0

    if args.command == "serve":
        if args.run_now:
            status = run_scheduled_job(config, force=True)
            print(f"[schedule] run-now status={status}", flush=True)
        try:
            serve_forever(args.config)
        except KeyboardInterrupt:
            print("\n[schedule] stopped", flush=True)
            return 0
        return 0

    if args.command == "sync-autostart":
        try:
            print(autostart.sync(config))
            print("---")
            print(f"config.autostart.enabled={config.autostart.enabled}")
            print(autostart.status(config))
        except Exception as err:  # noqa: BLE001
            print(f"Sync auto-start thất bại: {err}", file=sys.stderr)
            return 1
        return 0

    if args.command == "install-autostart":
        try:
            print(autostart.install(config))
        except Exception as err:  # noqa: BLE001
            print(f"Cài auto-start thất bại: {err}", file=sys.stderr)
            return 1
        return 0

    if args.command == "uninstall-autostart":
        try:
            print(autostart.uninstall(config))
        except Exception as err:  # noqa: BLE001
            print(f"Gỡ auto-start thất bại: {err}", file=sys.stderr)
            return 1
        return 0

    if args.command == "autostart-status":
        try:
            print(f"config.autostart.enabled={config.autostart.enabled}")
            print(autostart.status(config))
        except Exception as err:  # noqa: BLE001
            print(f"Không đọc được trạng thái: {err}", file=sys.stderr)
            return 1
        return 0

    parser.error(f"Lệnh không hỗ trợ: {args.command}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
