from __future__ import annotations

import os
import platform
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

from .config import PACKAGE_ROOT, AppConfig

SERVICE_LABEL = "com.mytvstats.python-report"
LINUX_UNIT_NAME = "mytv-stats-report.service"
WINDOWS_TASK_NAME = "MyTVStatsPythonReport"


@dataclass(frozen=True)
class AutostartPaths:
    python_exe: Path
    main_py: Path
    config_path: Path
    work_dir: Path
    log_dir: Path


def resolve_paths(config: AppConfig) -> AutostartPaths:
    work_dir = PACKAGE_ROOT
    log_dir = work_dir / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    # Không dùng Path.resolve() cho python — tránh follow symlink .venv → base và mất site-packages.
    python_exe = Path(sys.executable)
    if not python_exe.is_absolute():
        python_exe = (Path.cwd() / python_exe).absolute()
    else:
        python_exe = python_exe.absolute()
    return AutostartPaths(
        python_exe=python_exe,
        main_py=(work_dir / "main.py").resolve(),
        config_path=config.config_path.resolve(),
        work_dir=work_dir.resolve(),
        log_dir=log_dir.resolve(),
    )


def sync(config: AppConfig) -> str:
    """Áp dụng config.autostart.enabled lên OS (cài hoặc gỡ)."""
    if config.autostart.enabled:
        message = install(config)
        return f"config.autostart.enabled=true → đã bật auto-start.\n{message}"
    message = uninstall(config)
    return f"config.autostart.enabled=false → đã tắt auto-start.\n{message}"


def install(config: AppConfig) -> str:
    paths = resolve_paths(config)
    system = platform.system()
    if system == "Darwin":
        return _install_macos(paths)
    if system == "Windows":
        return _install_windows(paths)
    if system == "Linux":
        return _install_linux(paths)
    raise RuntimeError(f"Chưa hỗ trợ auto-start trên {system}.")


def uninstall(config: AppConfig) -> str:
    paths = resolve_paths(config)
    system = platform.system()
    if system == "Darwin":
        return _uninstall_macos(paths)
    if system == "Windows":
        return _uninstall_windows(paths)
    if system == "Linux":
        return _uninstall_linux(paths)
    raise RuntimeError(f"Chưa hỗ trợ auto-start trên {system}.")


def status(config: AppConfig) -> str:
    paths = resolve_paths(config)
    system = platform.system()
    if system == "Darwin":
        return _status_macos(paths)
    if system == "Windows":
        return _status_windows()
    if system == "Linux":
        return _status_linux()
    return f"Hệ thống không hỗ trợ: {system}"


def _serve_argv(paths: AutostartPaths) -> list[str]:
    return [
        str(paths.python_exe),
        str(paths.main_py),
        "--config",
        str(paths.config_path),
        "serve",
    ]


# --- macOS LaunchAgent -------------------------------------------------


def _macos_plist_path() -> Path:
    return Path.home() / "Library" / "LaunchAgents" / f"{SERVICE_LABEL}.plist"


def _install_macos(paths: AutostartPaths) -> str:
    plist_path = _macos_plist_path()
    plist_path.parent.mkdir(parents=True, exist_ok=True)
    out_log = paths.log_dir / "autostart.out.log"
    err_log = paths.log_dir / "autostart.err.log"
    args_xml = "\n".join(f"    <string>{_xml_escape(a)}</string>" for a in _serve_argv(paths))
    plist = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>{SERVICE_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
{args_xml}
  </array>
  <key>WorkingDirectory</key>
  <string>{_xml_escape(str(paths.work_dir))}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>{_xml_escape(str(out_log))}</string>
  <key>StandardErrorPath</key>
  <string>{_xml_escape(str(err_log))}</string>
</dict>
</plist>
"""
    plist_path.write_text(plist, encoding="utf-8")

    uid = os.getuid()
    domain = f"gui/{uid}/{SERVICE_LABEL}"
    # Bỏ job cũ (nếu có) rồi load lại.
    subprocess.run(["launchctl", "bootout", domain], check=False, capture_output=True)
    result = subprocess.run(
        ["launchctl", "bootstrap", f"gui/{uid}", str(plist_path)],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        # Fallback macOS cũ
        subprocess.run(["launchctl", "unload", str(plist_path)], check=False, capture_output=True)
        unload_load = subprocess.run(
            ["launchctl", "load", str(plist_path)],
            check=False,
            capture_output=True,
            text=True,
        )
        if unload_load.returncode != 0:
            raise RuntimeError(
                "Không load được LaunchAgent:\n"
                f"{result.stderr or result.stdout}\n{unload_load.stderr or unload_load.stdout}"
            )

    return (
        f"Đã cài LaunchAgent: {plist_path}\n"
        f"Label: {SERVICE_LABEL}\n"
        f"Log: {out_log} / {err_log}\n"
        "Sẽ chạy `serve` khi đăng nhập (và KeepAlive nếu process thoát)."
    )


def _uninstall_macos(paths: AutostartPaths) -> str:
    del paths  # unused — path derived from home
    plist_path = _macos_plist_path()
    uid = os.getuid()
    domain = f"gui/{uid}/{SERVICE_LABEL}"
    subprocess.run(["launchctl", "bootout", domain], check=False, capture_output=True)
    subprocess.run(["launchctl", "unload", str(plist_path)], check=False, capture_output=True)
    if plist_path.exists():
        plist_path.unlink()
        return f"Đã gỡ LaunchAgent: {plist_path}"
    return f"Không thấy LaunchAgent ({plist_path}) — có thể chưa cài."


def _status_macos(paths: AutostartPaths) -> str:
    plist_path = _macos_plist_path()
    installed = plist_path.is_file()
    loaded = subprocess.run(
        ["launchctl", "print", f"gui/{os.getuid()}/{SERVICE_LABEL}"],
        check=False,
        capture_output=True,
    ).returncode == 0
    return (
        f"platform=macOS\n"
        f"plist={plist_path}\n"
        f"installed={installed}\n"
        f"loaded={loaded}\n"
        f"python={paths.python_exe}\n"
        f"config={paths.config_path}"
    )


# --- Linux systemd --user ----------------------------------------------


def _linux_unit_path() -> Path:
    return Path.home() / ".config" / "systemd" / "user" / LINUX_UNIT_NAME


def _install_linux(paths: AutostartPaths) -> str:
    unit_path = _linux_unit_path()
    unit_path.parent.mkdir(parents=True, exist_ok=True)
    out_log = paths.log_dir / "autostart.out.log"
    err_log = paths.log_dir / "autostart.err.log"
    exec_start = " ".join(_shell_quote(a) for a in _serve_argv(paths))
    unit = f"""[Unit]
Description=MyTV Stats Python daily report scheduler
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory={paths.work_dir}
ExecStart={exec_start}
Restart=on-failure
RestartSec=15
StandardOutput=append:{out_log}
StandardError=append:{err_log}

[Install]
WantedBy=default.target
"""
    unit_path.write_text(unit, encoding="utf-8")
    _run(["systemctl", "--user", "daemon-reload"])
    _run(["systemctl", "--user", "enable", "--now", LINUX_UNIT_NAME])
    return (
        f"Đã cài systemd user unit: {unit_path}\n"
        f"service={LINUX_UNIT_NAME}\n"
        f"Log: {out_log} / {err_log}\n"
        "Chạy khi user session (đăng nhập). "
        "Máy server không login GUI: `loginctl enable-linger $USER`."
    )


def _uninstall_linux(paths: AutostartPaths) -> str:
    del paths
    unit_path = _linux_unit_path()
    subprocess.run(
        ["systemctl", "--user", "disable", "--now", LINUX_UNIT_NAME],
        check=False,
        capture_output=True,
    )
    if unit_path.exists():
        unit_path.unlink()
    subprocess.run(["systemctl", "--user", "daemon-reload"], check=False, capture_output=True)
    return f"Đã gỡ systemd unit ({LINUX_UNIT_NAME})."


def _status_linux() -> str:
    unit_path = _linux_unit_path()
    enabled = subprocess.run(
        ["systemctl", "--user", "is-enabled", LINUX_UNIT_NAME],
        check=False,
        capture_output=True,
        text=True,
    )
    active = subprocess.run(
        ["systemctl", "--user", "is-active", LINUX_UNIT_NAME],
        check=False,
        capture_output=True,
        text=True,
    )
    return (
        f"platform=Linux\n"
        f"unit={unit_path}\n"
        f"installed={unit_path.is_file()}\n"
        f"enabled={(enabled.stdout or '').strip()}\n"
        f"active={(active.stdout or '').strip()}"
    )


# --- Windows Task Scheduler --------------------------------------------


def _windows_runner_path(paths: AutostartPaths) -> Path:
    runner_dir = paths.work_dir / "data"
    runner_dir.mkdir(parents=True, exist_ok=True)
    return runner_dir / "autostart_runner.cmd"


def _install_windows(paths: AutostartPaths) -> str:
    runner = _windows_runner_path(paths)
    out_log = paths.log_dir / "autostart.out.log"
    # cmd wrapper giữ WorkingDirectory ổn định khi Task Scheduler gọi.
    runner.write_text(
        "\r\n".join(
            [
                "@echo off",
                f'cd /d "{paths.work_dir}"',
                (
                    f'"{paths.python_exe}" "{paths.main_py}" '
                    f'--config "{paths.config_path}" serve '
                    f'>> "{out_log}" 2>&1'
                ),
                "",
            ]
        ),
        encoding="utf-8",
    )

    # /SC ONLOGON — chạy khi user đăng nhập (tương đương khởi động cùng hệ thống cho desktop).
    create = subprocess.run(
        [
            "schtasks",
            "/Create",
            "/TN",
            WINDOWS_TASK_NAME,
            "/TR",
            str(runner),
            "/SC",
            "ONLOGON",
            "/RL",
            "LIMITED",
            "/F",
        ],
        check=False,
        capture_output=True,
        text=True,
        shell=False,
    )
    if create.returncode != 0:
        raise RuntimeError(
            "Không tạo được Task Scheduler:\n"
            f"{create.stdout}\n{create.stderr}"
        )

    return (
        f"Đã tạo Task Scheduler: {WINDOWS_TASK_NAME}\n"
        f"Runner: {runner}\n"
        f"Log: {out_log}\n"
        "Chạy `serve` mỗi khi đăng nhập Windows."
    )


def _uninstall_windows(paths: AutostartPaths) -> str:
    subprocess.run(
        ["schtasks", "/Delete", "/TN", WINDOWS_TASK_NAME, "/F"],
        check=False,
        capture_output=True,
        text=True,
    )
    runner = _windows_runner_path(paths)
    if runner.exists():
        runner.unlink()
    return f"Đã gỡ Task Scheduler ({WINDOWS_TASK_NAME})."


def _status_windows() -> str:
    query = subprocess.run(
        ["schtasks", "/Query", "/TN", WINDOWS_TASK_NAME, "/FO", "LIST"],
        check=False,
        capture_output=True,
        text=True,
    )
    installed = query.returncode == 0
    return (
        f"platform=Windows\n"
        f"task={WINDOWS_TASK_NAME}\n"
        f"installed={installed}\n"
        f"{(query.stdout or query.stderr or '').strip()}"
    )


# --- helpers -----------------------------------------------------------


def _xml_escape(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def _shell_quote(value: str) -> str:
    if not value or any(ch in value for ch in ' \t\n"\'\\'):
        return "'" + value.replace("'", "'\\''") + "'"
    return value


def _run(cmd: list[str]) -> None:
    result = subprocess.run(cmd, check=False, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(
            f"Lệnh thất bại ({' '.join(cmd)}):\n{result.stdout}\n{result.stderr}"
        )
