# Dọn toàn bộ BAT khỏi thư mục gốc

Công cụ này chuyển tất cả file `.bat` ở thư mục gốc vào:

```text
scripts/windows/launchers/
```

Đồng thời công cụ:

- Sửa `%~dp0` trong launcher để vẫn xác định đúng project root.
- Cập nhật tham chiếu trong `.vscode`, `docs`, `scripts` và tài liệu ở root.
- Tiếp tục phân loại `CHANGES_*.md` và `UPGRADE_*.md`.
- Tạo `scripts/windows/launchers/README.md`.
- Cập nhật `docs/INDEX.md`.

## Chạy xem trước

```powershell
powershell.exe `
  -NoProfile `
  -ExecutionPolicy Bypass `
  -File ".\scripts\windows\organize-project-files.ps1" `
  -ProjectRoot "." `
  -Preview
```

## Áp dụng

```powershell
powershell.exe `
  -NoProfile `
  -ExecutionPolicy Bypass `
  -File ".\scripts\windows\organize-project-files.ps1" `
  -ProjectRoot "." `
  -Force
```

## Sau khi dọn

Không chạy:

```powershell
.\scripts\windows\launchers\START_HELPDESK_VSCODE.bat
```

Mà chạy:

```powershell
.\scripts\windows\launchers\START_HELPDESK_VSCODE.bat
```

Tương tự cho các launcher `CONFIGURE_*`, `INSTALL_*`, `START_*` và `ORGANIZE_*`.

## Kiểm tra

```powershell
Get-ChildItem "." -File -Filter "*.bat"
```

Lệnh trên không nên trả kết quả.

```powershell
Get-ChildItem ".\scripts\windows\launchers" -File -Filter "*.bat"
```

Lệnh này phải liệt kê toàn bộ launcher.
