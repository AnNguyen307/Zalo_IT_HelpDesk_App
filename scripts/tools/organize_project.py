#!/usr/bin/env python3
"""
Zalo IT HelpDesk project organizer.

Goals:
- Move release/change documentation out of the project root.
- Move every root-level .bat launcher to scripts/windows/launchers/.
- Rewrite moved launchers so %~dp0 still resolves the project root.
- Update common references in .vscode, docs, scripts, and root Markdown files.
- Create backups before applying changes.

Usage:
    python scripts/tools/organize_project.py --root . --preview
    python scripts/tools/organize_project.py --root . --apply
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
import shutil
import sys
from typing import Iterable


TEXT_EXTENSIONS = {
    ".json",
    ".jsonc",
    ".md",
    ".txt",
    ".ps1",
    ".cmd",
    ".yml",
    ".yaml",
}

DOC_RULES = {
    "AUTO_NGROK.md": ("deployment",),
    "DEPLOYMENT_CHECKLIST.md": ("deployment",),
    "FREE_DEPLOYMENT.md": ("deployment",),
    "README_VSCODE_TERMINALS.txt": ("deployment",),
    "README_AI_AUTOSTART_FIX.txt": ("troubleshooting",),
    "README_AI_START_ORDER_FIX.txt": ("troubleshooting",),
    "README_SQL_SCHEMA_FIX.md": ("troubleshooting",),
    "README_AI_AGENT.md": ("components",),
    "README_ENTERPRISE_PLAYBOOK.md": ("components",),
    "README_PLAYBOOK_LIFECYCLE.md": ("components",),
}

SKIP_DIR_NAMES = {
    ".git",
    "node_modules",
    "dist",
    "coverage",
    ".vite",
    "uploads",
    ".organizer-backup",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Organize the Zalo HelpDesk project.")
    parser.add_argument("--root", default=".", help="Project root directory.")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--preview", action="store_true", help="Show planned changes only.")
    mode.add_argument("--apply", action="store_true", help="Apply the changes.")
    return parser.parse_args()


def resolve_root(raw_path: str) -> Path:
    root = Path(raw_path.strip().strip('"')).expanduser().resolve()
    if not (root / "backend").is_dir() or not (root / "miniapp").is_dir():
        raise RuntimeError(f"Expected backend/ and miniapp/ under: {root}")
    return root


def release_folder(file_name: str) -> str:
    upper = file_name.upper()
    match = re.search(r"(?:^|_)V(?P<version>\d+(?:_\d+)*)", upper)
    if match:
        return "v" + match.group("version").replace("_", ".")
    if "ZERO_COST" in upper:
        return "legacy-zero-cost"
    return "legacy"


def unique_destination(directory: Path, file_name: str) -> Path:
    candidate = directory / file_name
    if not candidate.exists():
        return candidate
    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    source = Path(file_name)
    return directory / f"{source.stem}-{stamp}{source.suffix}"


def iter_text_files(root: Path) -> Iterable[Path]:
    search_roots = [root / ".vscode", root / "docs", root / "scripts"]

    for search_root in search_roots:
        if not search_root.exists():
            continue
        for path in search_root.rglob("*"):
            if not path.is_file() or path.suffix.lower() not in TEXT_EXTENSIONS:
                continue
            if any(part in SKIP_DIR_NAMES for part in path.parts):
                continue
            yield path

    for path in root.iterdir():
        if path.is_file() and path.suffix.lower() in TEXT_EXTENSIONS:
            yield path


def read_text(path: Path) -> tuple[str, str]:
    raw = path.read_bytes()
    for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            return raw.decode(encoding), encoding
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace"), "utf-8"


def write_text(path: Path, content: str, encoding: str = "utf-8") -> None:
    normalized_encoding = "utf-8" if encoding in {"utf-8-sig", "utf-8"} else encoding
    path.write_text(content, encoding=normalized_encoding, newline="")


def convert_bat_content(content: str) -> str:
    content = content.replace("%~dp0.", "%PROJECT_ROOT%")
    content = content.replace("%~dp0", "%PROJECT_ROOT%\\")

    lines = content.splitlines()
    while lines and lines[0].strip().lower() in {"@echo off", "echo off", "setlocal"}:
        lines.pop(0)

    header = [
        "@echo off",
        "setlocal",
        'set "PROJECT_ROOT=%~dp0..\\..\\.."',
        'for %%I in ("%PROJECT_ROOT%") do set "PROJECT_ROOT=%%~fI"',
        "",
    ]
    return "\r\n".join(header + lines) + "\r\n"


def reference_replacements(file_path: Path, launcher_name: str) -> list[tuple[str, str]]:
    win_path = rf"scripts\windows\launchers\{launcher_name}"
    slash_path = f"scripts/windows/launchers/{launcher_name}"

    if file_path.suffix.lower() in {".json", ".jsonc"}:
        escaped_win = win_path.replace("\\", "\\\\")
        return [
            (rf"${{workspaceFolder}}\\{launcher_name}", rf"${{workspaceFolder}}\\{escaped_win}"),
            (rf"${{workspaceFolder}}/{launcher_name}", rf"${{workspaceFolder}}/{slash_path}"),
            (rf".\\{launcher_name}", rf".\\{escaped_win}"),
            (f"./{launcher_name}", f"./{slash_path}"),
        ]

    return [
        (rf"${{workspaceFolder}}\{launcher_name}", rf"${{workspaceFolder}}\{win_path}"),
        (f"${{workspaceFolder}}/{launcher_name}", f"${{workspaceFolder}}/{slash_path}"),
        (rf".\{launcher_name}", rf".\{win_path}"),
        (f"./{launcher_name}", f"./{slash_path}"),
        (rf"%PROJECT_ROOT%\{launcher_name}", rf"%PROJECT_ROOT%\{win_path}"),
    ]


class Organizer:
    def __init__(self, root: Path, apply_changes: bool) -> None:
        self.root = root
        self.apply_changes = apply_changes
        self.docs_root = root / "docs"
        self.launcher_dir = root / "scripts" / "windows" / "launchers"
        stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
        self.backup_root = root / ".organizer-backup" / stamp
        self.moved_launchers: list[str] = []

    def log(self, message: str) -> None:
        prefix = "[APPLY]" if self.apply_changes else "[PREVIEW]"
        print(f"{prefix} {message}")

    def ensure_dir(self, path: Path) -> None:
        if self.apply_changes:
            path.mkdir(parents=True, exist_ok=True)

    def backup_file(self, path: Path) -> None:
        if not self.apply_changes:
            return
        relative = path.relative_to(self.root)
        destination = self.backup_root / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, destination)

    def move_file(self, source: Path, destination_dir: Path, label: str) -> None:
        destination = unique_destination(destination_dir, source.name)
        self.log(f"{label}: {source.relative_to(self.root)} -> {destination.relative_to(self.root)}")
        if not self.apply_changes:
            return
        self.backup_file(source)
        destination_dir.mkdir(parents=True, exist_ok=True)
        shutil.move(str(source), str(destination))

    def organize_docs(self) -> None:
        for source in sorted(self.root.glob("CHANGES_*.md")):
            self.move_file(source, self.docs_root / "releases" / release_folder(source.name), "DOC")

        for source in sorted(self.root.glob("UPGRADE_*.md")):
            self.move_file(source, self.docs_root / "releases" / release_folder(source.name), "DOC")

        for file_name, destination_parts in DOC_RULES.items():
            source = self.root / file_name
            if source.exists():
                self.move_file(source, self.docs_root.joinpath(*destination_parts), "DOC")

    def move_bat_launchers(self) -> None:
        root_bats = sorted(self.root.glob("*.bat"), key=lambda path: path.name.lower())
        if not root_bats:
            self.log("No root-level BAT files found.")
            return

        self.ensure_dir(self.launcher_dir)

        for source in root_bats:
            destination = self.launcher_dir / source.name
            self.log(f"BAT: {source.name} -> {destination.relative_to(self.root)}")

            if not self.apply_changes:
                self.moved_launchers.append(source.name)
                continue

            self.backup_file(source)

            if source.name.upper() == "ORGANIZE_PROJECT_FILES.BAT" and destination.exists():
                # Keep the new Python-based launcher included in the patch.
                source.unlink()
                self.log("Removed the obsolete root organizer launcher after backup.")
                self.moved_launchers.append(source.name)
                continue

            content, _ = read_text(source)
            converted = convert_bat_content(content)
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_text(converted, encoding="cp1252", newline="")
            source.unlink()
            self.moved_launchers.append(source.name)

    def update_references(self) -> None:
        if not self.moved_launchers:
            return

        for file_path in sorted(set(iter_text_files(self.root))):
            if file_path == Path(__file__).resolve():
                continue

            original, encoding = read_text(file_path)
            updated = original

            for launcher_name in self.moved_launchers:
                for old, new in reference_replacements(file_path, launcher_name):
                    updated = updated.replace(old, new)

            if updated == original:
                continue

            self.log(f"REF: {file_path.relative_to(self.root)}")
            if self.apply_changes:
                self.backup_file(file_path)
                write_text(file_path, updated, encoding)

    def write_launcher_readme(self) -> None:
        readme_path = self.launcher_dir / "README.md"
        if readme_path.exists():
            self.log("Preserve curated scripts/windows/launchers/README.md")
            return

        if not self.apply_changes:
            self.log("Generate scripts/windows/launchers/README.md")
            return

        self.launcher_dir.mkdir(parents=True, exist_ok=True)
        launchers = sorted(path.name for path in self.launcher_dir.glob("*.bat"))
        lines = [
            "# Windows launchers",
            "",
            "Run launchers from the project root, for example:",
            "",
            "```powershell",
            r".\scripts\windows\launchers\START_HELPDESK_VSCODE.bat",
            "```",
            "",
            "## Available launchers",
            "",
        ]
        lines.extend(f"- `{name}`" for name in launchers)
        readme_path.write_text(
            "\n".join(lines) + "\n",
            encoding="utf-8",
        )

    def write_docs_inventory(self) -> None:
        if not self.apply_changes:
            self.log("Generate docs/FILE_INVENTORY.md; preserve curated docs/INDEX.md")
            return

        self.docs_root.mkdir(parents=True, exist_ok=True)
        index_path = self.docs_root / "FILE_INVENTORY.md"
        excluded_names = {"INDEX.md", "FILE_INVENTORY.md"}
        files = sorted(
            path
            for path in self.docs_root.rglob("*")
            if path.is_file() and path.name not in excluded_names
        )
        lines = [
            "# Danh sách file tài liệu",
            "",
            "Danh sách này được tạo tự động bởi `scripts/tools/organize_project.py`.",
            "Để tìm tài liệu theo nhu cầu, xem [Trung tâm tài liệu](./INDEX.md).",
            "",
        ]
        grouped: dict[str, list[Path]] = {}
        for file_path in files:
            relative = file_path.relative_to(self.docs_root)
            section = relative.parts[0] if len(relative.parts) > 1 else "Khác"
            grouped.setdefault(section, []).append(relative)

        for section, relative_paths in grouped.items():
            lines.extend([f"## {section}", ""])
            for relative in relative_paths:
                posix_path = relative.as_posix()
                lines.append(f"- [{posix_path}](./{posix_path})")
            lines.append("")
        index_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")

    def verify(self) -> None:
        if not self.apply_changes:
            return

        remaining_bats = list(self.root.glob("*.bat"))
        if remaining_bats:
            names = ", ".join(path.name for path in remaining_bats)
            raise RuntimeError(f"Root BAT files still remain: {names}")

        print("[OK] No .bat files remain in the project root.")
        print(f"[OK] Backup created at: {self.backup_root}")
        print(f"[OK] Launchers directory: {self.launcher_dir}")

    def run(self) -> None:
        print(f"Project root: {self.root}")
        self.organize_docs()
        self.move_bat_launchers()
        self.update_references()
        self.write_launcher_readme()
        self.write_docs_inventory()
        self.verify()


def main() -> int:
    args = parse_args()
    try:
        root = resolve_root(args.root)
        Organizer(root=root, apply_changes=args.apply).run()
        return 0
    except Exception as exc:
        print(f"[ERROR] {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
