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
- Giữ nguyên `docs/INDEX.md` được biên tập cho người đọc và tạo `docs/FILE_INVENTORY.md` cho danh sách tự động.
- Tạo backup tại `.organizer-backup/<timestamp>/`.

Luôn chạy `--preview` và kiểm tra working tree trước `--apply`. Không chạy công cụ khi đang có file tài liệu/launcher chưa commit mà bạn không muốn đưa vào backup hoặc thay đổi tham chiếu.
