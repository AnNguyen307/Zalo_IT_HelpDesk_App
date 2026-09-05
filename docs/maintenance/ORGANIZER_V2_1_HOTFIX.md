# Organizer v2.1 syntax hotfix — hồ sơ lịch sử

> Bản PowerShell v2.1 đã được thay thế bằng [Project Organizer v3](./PROJECT_ORGANIZER_V3.md). Nội dung dưới đây chỉ dùng để truy vết sự cố cũ, không dùng làm hướng dẫn hiện hành.

Bản này sửa lỗi parser PowerShell ở hàm tạo README launcher.

## 1. Kiểm tra cú pháp

```powershell
powershell.exe `
  -NoProfile `
  -ExecutionPolicy Bypass `
  -File ".\scripts\windows\validate-organizer.ps1"
```

Kết quả cần có:

```text
[OK] PowerShell syntax is valid
```

## 2. Preview

```powershell
powershell.exe `
  -NoProfile `
  -ExecutionPolicy Bypass `
  -File ".\scripts\windows\organize-project-files.ps1" `
  -ProjectRoot "." `
  -Preview
```

## 3. Apply

```powershell
powershell.exe `
  -NoProfile `
  -ExecutionPolicy Bypass `
  -File ".\scripts\windows\organize-project-files.ps1" `
  -ProjectRoot "." `
  -Force
```

Sau khi chạy, tất cả file `.bat` ở root sẽ được chuyển vào:

```text
scripts/windows/launchers/
```
