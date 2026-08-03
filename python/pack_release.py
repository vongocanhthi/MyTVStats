#!/usr/bin/env python3
"""Đóng gói thư mục python/ thành zip để gửi user (không kèm secrets / .venv)."""

from __future__ import annotations

import zipfile
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DIST = ROOT / "dist"

SKIP_DIR_NAMES = {
    ".venv",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    "dist",
    "out",
    "logs",
    "data",
    ".git",
}

SKIP_FILE_NAMES = {
    "config.json",
    ".DS_Store",
}

SKIP_SUFFIXES = {".pyc", ".pyo", ".egg-info"}


def should_skip(path: Path, root: Path) -> bool:
    rel = path.relative_to(root)
    for part in rel.parts:
        if part in SKIP_DIR_NAMES:
            return True
        if part.endswith(".egg-info"):
            return True
    if path.name in SKIP_FILE_NAMES:
        return True
    if path.suffix in SKIP_SUFFIXES:
        return True
    # Không đóng gói credentials JSON thật
    if rel.parts[:1] == ("credentials",) and path.suffix == ".json":
        return True
    return False


def pack() -> Path:
    DIST.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d")
    out = DIST / f"MyTVStats-python-{stamp}.zip"
    prefix = "MyTVStats-python"

    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(ROOT.rglob("*")):
            if not path.is_file():
                continue
            if should_skip(path, ROOT):
                continue
            arcname = f"{prefix}/{path.relative_to(ROOT).as_posix()}"
            zf.write(path, arcname)

    return out


def main() -> int:
    out = pack()
    size_kb = out.stat().st_size / 1024
    print(f"Đã tạo: {out}")
    print(f"Size: {size_kb:.1f} KB")
    print("Gửi file zip này cho user. Không chứa config.json / service account / .venv.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
