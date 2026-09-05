# Quy tắc tổ chức file sau mỗi thay đổi

## Mục tiêu

Thư mục gốc chỉ giữ thành phần nhận diện, cấu hình repository và mã nguồn cấp cao:

```text
.github/
.vscode/
backend/
deploy/
docs/
miniapp/
scripts/
.gitignore
AGENTS.md
PROJECT_HANDOFF.md
README.md
render.yaml
```

Không đặt launcher `.bat`, `CHANGES_*.md`, `UPGRADE_*.md` hoặc README chuyên đề ở thư mục gốc.

## Cấu trúc tài liệu

```text
docs/
├── INDEX.md                    # Điều hướng thủ công, thân thiện với người đọc
├── FILE_INVENTORY.md           # Danh sách file được công cụ tạo
├── architecture/               # Kiến trúc và luồng dữ liệu
├── components/                 # Playbook, AI và module chính
├── deployment/                 # Build, deploy, profile và checklist
├── development/                # Hướng dẫn phát triển
├── design/                     # Design system và UX
├── guides/                     # Hướng dẫn sử dụng
├── maintenance/                # Công cụ bảo trì repository
├── operations/                 # Runbook vận hành
├── quality/                    # Tiêu chuẩn kiểm thử
├── releases/                   # Hồ sơ lịch sử theo phiên bản
├── security/                   # Bảo mật và quản lý secret
└── troubleshooting/            # Chẩn đoán và khôi phục
```

## Quy tắc cho release mới

Ví dụ `v5.19.0`:

```text
docs/releases/v5.19.0/CHANGES_V5_19_0.md
docs/releases/v5.19.0/UPGRADE_V5_19_0.md
```

Release note là hồ sơ lịch sử: ghi phạm vi, migration, kiểm thử, deploy và rollback đúng tại thời điểm phát hành. Tài liệu vận hành lâu dài phải cập nhật ở thư mục chuyên đề và được liên kết từ `docs/INDEX.md`.

## Launcher và script

- Launcher tương tác Windows: `scripts/windows/launchers/`.
- Logic PowerShell: `scripts/windows/`.
- Script Linux: `scripts/linux/`.
- Công cụ đa nền tảng: `scripts/tools/`.
- Không nhân đôi logic dài trong file `.bat`; launcher chỉ nên gọi script chính.

## Chạy công cụ tổ chức

Xem trước:

```powershell
python ".\scripts\tools\organize_project.py" --root "." --preview
```

Áp dụng sau khi đã review danh sách thay đổi:

```powershell
python ".\scripts\tools\organize_project.py" --root "." --apply
```

Hoặc dùng launcher:

```powershell
.\scripts\windows\launchers\ORGANIZE_PROJECT_FILES.bat
```

Công cụ tạo backup trong `.organizer-backup/`, giữ `docs/INDEX.md` được biên tập thủ công và cập nhật danh sách file tại `docs/FILE_INVENTORY.md`.

## Kiểm tra trước commit

```powershell
Get-ChildItem "." -File -Filter "*.bat"
python ".\scripts\tools\organize_project.py" --root "." --preview
git diff --check
git status --short
```

Lệnh đầu tiên không được trả về launcher ở thư mục gốc. Không commit `.organizer-backup`, `.env`, build output, upload hoặc dữ liệu production.
