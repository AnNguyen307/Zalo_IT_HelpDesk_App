# Trung tâm tài liệu

Trang này giúp người đọc chọn đúng tài liệu thay vì phải đoán theo tên file hoặc phiên bản. Thông tin hiện hành luôn ưu tiên hơn hồ sơ trong `releases/`.

## Bắt đầu theo vai trò

| Tôi cần… | Đọc trước |
|---|---|
| Sử dụng Mini App/Admin/Bot | [Hướng dẫn sử dụng](./guides/USER_GUIDE.md) |
| Hiểu các thành phần và luồng dữ liệu | [Tổng quan kiến trúc](./architecture/SYSTEM_OVERVIEW.md) |
| Chạy và sửa mã nguồn | [Hướng dẫn phát triển](./development/DEVELOPER_GUIDE.md) |
| Triển khai Render, NAS hoặc local | [Hướng dẫn triển khai](./deployment/README.md) |
| Theo dõi Production và xử lý incident | [Runbook vận hành](./operations/OPERATIONS_RUNBOOK.md) |
| Quản lý secret/quyền/dữ liệu | [Hướng dẫn bảo mật](./security/SECURITY_GUIDE.md) |
| Chẩn đoán một lỗi cụ thể | [Troubleshooting](./troubleshooting/README.md) |
| Tiếp tục phát triển dự án | [Project Handoff](../PROJECT_HANDOFF.md) và [AGENTS.md](../AGENTS.md) |

## Nguồn thông tin hiện hành

| Tài liệu | Phạm vi |
|---|---|
| [README](../README.md) | Giới thiệu, trạng thái, quick start và liên kết chính |
| [User Guide](./guides/USER_GUIDE.md) | Hướng dẫn chi tiết cho nhân viên, HelpDesk và Admin |
| [System Overview](./architecture/SYSTEM_OVERVIEW.md) | Kiến trúc, luồng ticket, auth, AI, storage và SLA |
| [Developer Guide](./development/DEVELOPER_GUIDE.md) | Local setup, build, test, database và PR |
| [Deployment](./deployment/README.md) | Chọn profile, phát hành, migration và rollback |
| [Operations Runbook](./operations/OPERATIONS_RUNBOOK.md) | Health, Bot, capacity, incident và kiểm tra sau deploy |
| [Security Guide](./security/SECURITY_GUIDE.md) | Secret, RBAC, webhook, attachment, AI và incident |
| [Troubleshooting](./troubleshooting/README.md) | Chẩn đoán theo triệu chứng |
| [Project Handoff](../PROJECT_HANDOFF.md) | Trạng thái kỹ thuật và nợ kỹ thuật mới nhất |

## Thành phần hệ thống

- [AI Agent và Staff Copilot](./components/README_AI_AGENT.md)
- [Enterprise Playbook RAG](./components/README_ENTERPRISE_PLAYBOOK.md)
- [Playbook Governance Lifecycle](./components/README_PLAYBOOK_LIFECYCLE.md)

## Tài liệu Playbook phát hành kèm repository

- [Enterprise Playbook 2026 — Word](./VS_Enterprise_IT_HelpDesk_Playbook_2026.docx)
- [Enterprise Playbook 2026 — PDF](./VS_Enterprise_IT_HelpDesk_Playbook_2026.pdf)

Hai file trên là bản tài liệu tham khảo dành cho người đọc. Nguồn runtime và quy trình publish vẫn tuân theo [Enterprise Playbook và RAG](./components/README_ENTERPRISE_PLAYBOOK.md); không chỉnh trực tiếp file PDF để thay đổi nội dung đang phục vụ hệ thống.

## Triển khai

| Tài liệu | Trạng thái sử dụng |
|---|---|
| [Deployment README](./deployment/README.md) | Điểm bắt đầu hiện hành |
| [Deployment Checklist](./deployment/DEPLOYMENT_CHECKLIST.md) | Checklist hiện hành cho mọi profile |
| [Render + Supabase](./deployment/FREE_HOSTING_V5_15.md) | Profile Production pilot hiện hành |
| [NAS + SQL Server](./deployment/NAS_V5_15.md) | Profile NAS, schema 10 |
| [Local/PC + tunnel](./deployment/FREE_DEPLOYMENT.md) | Phát triển/demo, không SLA |
| [Ngrok URL sync](./deployment/AUTO_NGROK.md) | Development/Testing khi URL tạm thay đổi |
| [VS Code terminals](./deployment/README_VSCODE_TERMINALS.txt) | Hướng dẫn launcher Windows |

## Chất lượng và thiết kế

- [Tiêu chuẩn kiểm thử chức năng và ngoại lệ](./quality/EXCEPTION_TESTING_STANDARD.md)
- [Warm Industrial + Signal System](./design/WARM_INDUSTRIAL_SIGNAL_SYSTEM.md)

## Bảo trì repository

- [Quy tắc tổ chức file](./PATCH_FILE_STRUCTURE.md)
- [Project Organizer v3](./maintenance/PROJECT_ORGANIZER_V3.md)
- [Dọn BAT khỏi thư mục gốc](./maintenance/MOVE_ROOT_BAT_FILES.md)
- [Organizer v2.1 syntax hotfix](./maintenance/ORGANIZER_V2_1_HOTFIX.md) — lịch sử
- [Windows launchers](../scripts/windows/launchers/README.md)

## Hồ sơ phát hành

[Release History](./releases/README.md) liệt kê đầy đủ changelog và upgrade guide từ Zero-Cost/v3 đến `v5.18.6`.

Các file trong `docs/releases/` là hồ sơ của phiên bản tại thời điểm phát hành. Chúng có thể mô tả version, schema, provider hoặc quy trình đã được phiên bản sau thay thế. Khi vận hành hiện tại, luôn dùng tài liệu ở các mục phía trên.

Nếu cần kiểm kê theo đường dẫn, xem [Danh sách file tài liệu](./FILE_INVENTORY.md). File này do công cụ tổ chức repository tạo tự động; `INDEX.md` vẫn là trang điều hướng chính được biên tập cho người đọc.

## Quy ước trạng thái tài liệu

- **Hiện hành**: nguồn nên dùng cho hệ thống đang chạy.
- **Theo profile**: chỉ áp dụng cho môi trường được ghi rõ.
- **Lịch sử**: giữ để truy vết quyết định/release; không dùng như runbook hiện tại.
- **Template**: phải thay placeholder và kiểm tra môi trường trước khi chạy.

## Trạng thái tài liệu theo Production

- Zalo Mini App: phiên bản `33`, Live 100%.
- Mini App source: `5.17.2`.
- Backend/Admin: `5.18.6`.
- SQL Server: schema `10`.
- PostgreSQL state/governance: schema `1/1`.
- Cập nhật tài liệu: 2026-09-05.
