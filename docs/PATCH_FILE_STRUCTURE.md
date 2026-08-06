# Quy tắc tổ chức file sau mỗi patch

## Mục tiêu

Thư mục gốc chỉ giữ các thành phần cần để chạy hoặc nhận diện project:

```text
.vscode/
backend/
docs/
miniapp/
scripts/
.gitignore
README.md
CONFIGURE_*.bat
INSTALL_*.bat
START_*.bat
ORGANIZE_PROJECT_FILES.bat
```

Không để `CHANGES_*.md`, `UPGRADE_*.md` hoặc các README chuyên đề nằm rải rác ở thư mục gốc.

## Cấu trúc tài liệu chuẩn

```text
docs/
├── INDEX.md
├── components/
├── deployment/
├── troubleshooting/
└── releases/
    ├── v3/
    ├── v4/
    ├── v5.2/
    ├── v5.3/
    ├── v5.4/
    ├── v5.5/
    ├── v5.5.1/
    ├── v5.5.2/
    ├── v5.6.0/
    └── legacy-zero-cost/
```

## Quy tắc cho patch mới

Ví dụ patch `v5.7.0` nên đóng gói tài liệu trực tiếp vào:

```text
docs/releases/v5.7.0/CHANGES_V5_7_0.md
docs/releases/v5.7.0/UPGRADE_V5_7_0.md
```

Không đặt hai file này ở thư mục gốc.

Các tài liệu dùng lâu dài đặt theo loại:

```text
docs/components/       Tài liệu module
docs/deployment/       Build, deploy, ngrok, CI/CD
docs/troubleshooting/  Lỗi và cách phục hồi
docs/releases/         Changelog và upgrade guide theo phiên bản
```

## Cách chạy

Tại thư mục gốc:

```powershell
.\scripts\windows\launchers\ORGANIZE_PROJECT_FILES.bat
```

Chọn `1` để xem trước. Chọn `2` để thực hiện.

Hoặc chạy trực tiếp:

```powershell
powershell.exe `
  -NoProfile `
  -ExecutionPolicy Bypass `
  -File ".\scripts\windows\organize-project-files.ps1" `
  -ProjectRoot "." `
  -Preview
```

Áp dụng không cần hỏi:

```powershell
powershell.exe `
  -NoProfile `
  -ExecutionPolicy Bypass `
  -File ".\scripts\windows\organize-project-files.ps1" `
  -ProjectRoot "." `
  -Force
```

## Những file script không tự di chuyển

Các launcher `.bat` vẫn được giữ ở thư mục gốc để không phá đường dẫn cũ:

```text
CONFIGURE_SQL_SERVER.bat
CONFIGURE_UPLOAD_LIMIT_30MB.bat
INSTALL_AI_AGENT.bat
INSTALL_ENTERPRISE_PLAYBOOK.bat
INSTALL_PLAYBOOK_GOVERNANCE.bat
START_HELPDESK_AUTO.bat
START_HELPDESK_VSCODE.bat
```

Khi đã chuẩn hóa toàn bộ VS Code tasks và tài liệu tham chiếu, có thể chuyển launcher vào `scripts/windows/` trong một phiên bản lớn riêng.
