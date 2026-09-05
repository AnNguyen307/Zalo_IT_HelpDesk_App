# Nguyễn Phan Trường An HelpDesk

Hệ thống IT HelpDesk nội bộ gồm Zalo Mini App cho nhân viên, Admin Web cho đội hỗ trợ, Zalo Chat Bot, Enterprise Playbook RAG và Cloud AI Router có Rules fallback.

## Trạng thái hiện tại

| Thành phần | Trạng thái |
|---|---|
| Tên chính thức trên Zalo | `Nguyễn Phan Trường An HelpDesk` |
| Zalo Mini App ID | `4185582976193315701` |
| Mini App Production | Phiên bản `33`, Live 100% |
| Mini App source | `v5.17.2` |
| Backend/Admin | `v5.18.6` |
| SQL Server schema | `10` |
| PostgreSQL state/governance schema | `1/1` |
| Production profile | Render Free + Supabase Free, pilot không SLA |

- Production Admin: <https://zalo-it-helpdesk-pilot.onrender.com/admin>
- Production health: <https://zalo-it-helpdesk-pilot.onrender.com/health>

## Bắt đầu từ đâu?

| Bạn là… | Đọc tài liệu |
|---|---|
| Nhân viên/HelpDesk/Admin | [Hướng dẫn sử dụng](docs/guides/USER_GUIDE.md) |
| Người vận hành hệ thống | [Runbook vận hành](docs/operations/OPERATIONS_RUNBOOK.md) |
| Người triển khai | [Hướng dẫn triển khai](docs/deployment/README.md) |
| Lập trình viên | [Hướng dẫn phát triển](docs/development/DEVELOPER_GUIDE.md) |
| Người cần hiểu hệ thống | [Tổng quan kiến trúc](docs/architecture/SYSTEM_OVERVIEW.md) |
| Người phụ trách an toàn | [Hướng dẫn bảo mật](docs/security/SECURITY_GUIDE.md) |
| Người đang xử lý lỗi | [Troubleshooting](docs/troubleshooting/README.md) |
| Người tìm changelog cũ | [Chỉ mục toàn bộ tài liệu](docs/INDEX.md) |

## Chức năng chính

### Dành cho nhân viên

- Xác nhận thiết bị bằng mã mời dùng một lần.
- Tạo, theo dõi, phản hồi và đánh giá ticket.
- Đính kèm ảnh/tài liệu trong private storage.
- Nhận hướng dẫn an toàn theo Playbook đã duyệt.
- Yêu cầu HelpDesk hoặc mở lại ticket khi cần.

### Dành cho HelpDesk

- Hàng đợi ticket, smart queue, SLA và phân công.
- Hội thoại hai chiều và file đính kèm.
- Staff Copilot đưa nhiều giả thuyết/hướng xử lý để kỹ thuật viên duyệt.
- Báo cáo vận hành và xuất CSV.
- Knowledge Base và vòng đời Playbook có review/publish/rollback.

### Tự động hóa

- AI Router: `Gemini → Groq → OpenRouter → SambaNova`.
- Rules fallback giữ đường tạo ticket khi cloud provider lỗi.
- Zalo Bot ưu tiên Playbook, hỗ trợ hội thoại và tự tạo ticket khi self-service thất bại.
- Webhook inbox bền vững và tự đăng ký lại sau Render restart khi được cấu hình.

## Kiến trúc ngắn gọn

```text
Zalo Mini App ─┐
               ├─ HTTPS ─ Node.js Backend ─ Database
Admin Web ─────┤              │              └─ Ticket/message/audit
Zalo Bot ──────┘              ├─ Private attachment storage
                              ├─ Playbook Governance/RAG
                              └─ Cloud AI Router + Rules fallback
```

Ba profile được hỗ trợ:

| Profile | Database | Attachment | Mục đích |
|---|---|---|---|
| `free-hosting` | Supabase PostgreSQL | Supabase private Storage | Pilot công khai |
| `nas` | SQL Server | Persistent volume/filesystem | Vận hành nội bộ |
| `local` | JSON/PostgreSQL/SQL Server | Filesystem | Phát triển/test |

## Chạy nhanh trên máy phát triển

Yêu cầu Node.js `20+`.

Backend:

```powershell
cd .\backend
Copy-Item .env.example .env
npm ci
npm run check
npm test
npm start
```

- Health: <http://127.0.0.1:8080/health>
- Admin: <http://127.0.0.1:8080/admin>

Mini App:

```powershell
cd .\miniapp
Copy-Item .env.example .env
npm ci
npm start
```

Chi tiết cấu hình và lưu ý thiết bị thật: [Developer Guide](docs/development/DEVELOPER_GUIDE.md).

## Quality gates

Backend/cross-system:

```powershell
cd .\backend
npm ci
npm run check
npm test
```

Playbook/RAG:

```powershell
npm run playbook:benchmark
```

Mini App:

```powershell
cd ..\miniapp
npm ci
npm run build
```

Mỗi PR còn phải kiểm tra diff, credential, migration requirement, deployment requirement và rollback. Xem [Tiêu chuẩn kiểm thử](docs/quality/EXCEPTION_TESTING_STANDARD.md).

## Các giới hạn bảo vệ dữ liệu

- Tối đa 30 ticket toàn hệ thống trên profile hiện hành.
- Tối đa 8 file và 10 MB cộng dồn cho mỗi ticket.
- Mỗi lần phản hồi chọn tối đa 4 file.
- Ticket đang hoạt động không bị tự động xóa.
- Mã mời chỉ dùng một lần, mặc định hết hạn sau 24 giờ.
- Refresh session theo thiết bị có thời hạn trượt tối đa 90 ngày.
- Employee UI không hiển thị provider, model, confidence hoặc routing nội bộ.

## Bảo mật

- Không commit `.env`, token, API key, database credential, private attachment hoặc dữ liệu thật.
- Mini App chỉ chứa public API URL; secret luôn ở Backend.
- File nằm trong private storage và được kiểm tra quyền theo ticket.
- AI/Copilot không tự thực thi, tự gửi tin hoặc tự đóng ticket.
- `ZALO_AUTH_MODE=development` chỉ dùng cục bộ.

Xem đầy đủ tại [Security Guide](docs/security/SECURITY_GUIDE.md).

## Phát hành và triển khai

- `render.yaml` để `autoDeployTrigger: off`; Backend/Admin được triển khai chủ động từ commit đã merge.
- Không deploy Mini App chỉ vì Backend hoặc tài liệu thay đổi.
- Đổi public Backend URL bắt buộc build/deploy lại Mini App.
- Không chạy `npm run db:migrate` nếu release không có migration.

Hướng dẫn từng profile: [Deployment](docs/deployment/README.md).

## Đóng góp

1. Đọc [AGENTS.md](AGENTS.md) và [Project Handoff](PROJECT_HANDOFF.md).
2. Tạo nhánh tập trung, không trộn thay đổi ngoài phạm vi.
3. Thêm test/tài liệu phù hợp.
4. Chạy gate liên quan và quét credential.
5. PR phải ghi outcome, impact, validation và rollback.

## Giấy phép và phạm vi sử dụng

Repository hiện phục vụ dự án HelpDesk nội bộ/pilot. Trước khi dùng cho dữ liệu thật hoặc môi trường có SLA, cần đánh giá riêng về hạ tầng always-on, backup/restore, retention, kiểm soát truy cập, xử lý dữ liệu cá nhân và điều khoản của các dịch vụ tích hợp.
