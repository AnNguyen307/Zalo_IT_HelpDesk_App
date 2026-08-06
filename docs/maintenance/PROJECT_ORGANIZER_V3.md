# Project Organizer v3 — Python

Bản v3 thay thế hoàn toàn script PowerShell bị lỗi parser.

## Preview

```powershell
python ".\scripts\tools\organize_project.py" --root "." --preview
```

## Apply

```powershell
python ".\scripts\tools\organize_project.py" --root "." --apply
```

## Sau lần chạy đầu

Launcher nằm tại:

```powershell
.\scripts\windows\launchers\ORGANIZE_PROJECT_FILES.bat
```

Công cụ sẽ:

- Di chuyển mọi `.bat` khỏi thư mục gốc.
- Chuyển launcher vào `scripts/windows/launchers/`.
- Chỉnh `%~dp0` để launcher vẫn tìm đúng project root.
- Cập nhật tham chiếu trong `.vscode`, `docs`, `scripts` và README ở root.
- Phân loại tài liệu release.
- Tạo backup tại `.organizer-backup/<timestamp>/`.
