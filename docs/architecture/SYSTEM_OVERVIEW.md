# Tổng quan kiến trúc hệ thống

Tài liệu này giải thích các thành phần đang hoạt động trong `Nguyễn Phan Trường An HelpDesk`, cách dữ liệu đi qua hệ thống và ranh giới trách nhiệm giữa Mini App, Backend, Admin, AI và nơi lưu trữ.

## Trạng thái hiện hành

| Thành phần | Phiên bản/trạng thái |
|---|---|
| Zalo Mini App Production | Phiên bản `33`, Live 100% |
| Mini App source | `v5.17.2` |
| Backend/Admin | `v5.18.6` |
| SQL Server/NAS schema | `10` |
| PostgreSQL state schema | `1` |
| PostgreSQL Playbook Governance schema | `1` |
| AI route | Gemini → Groq → OpenRouter → SambaNova → Rules |

## Sơ đồ thành phần

```text
Nhân viên                         HelpDesk
    │                                 │
    ▼                                 ▼
Zalo Mini App                    Admin Web
    │                                 │
    └──────────── HTTPS API ──────────┘
                      │
                      ▼
              Node.js Backend
              ├── Xác thực và RBAC
              ├── Ticket, message, SLA
              ├── Attachment gateway
              ├── Playbook Governance
              ├── AI Agent / Copilot
              └── Zalo webhook / Bot
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
   Database state          Private file storage
 PostgreSQL/SQL Server     Supabase/filesystem
```

## Các giao diện người dùng

### Zalo Mini App

Dành cho nhân viên. Mini App cho phép:

- xác nhận thiết bị bằng mã mời dùng một lần;
- tạo và theo dõi ticket;
- trao đổi với HelpDesk;
- tải lên và tải xuống file thuộc ticket;
- nhận hướng dẫn tự xử lý an toàn;
- yêu cầu hỗ trợ con người, mở lại và đánh giá ticket.

Mini App không được hiển thị provider AI, model, confidence, truy vấn nội bộ, API key hoặc dữ liệu của ticket khác.

### Admin Web

Dành cho vai trò `admin`, `technician` và `viewer`:

- `admin`: toàn quyền vận hành, nhân sự, Knowledge Base và phê duyệt Playbook;
- `technician`: xử lý ticket, dùng Copilot, soạn/gửi duyệt Playbook;
- `viewer`: chỉ xem, không gửi phản hồi hoặc thay đổi dữ liệu.

### Zalo Chat Bot

Bot nhận tin nhắn văn bản trong cuộc trò chuyện riêng, ưu tiên Playbook và có thể dùng generative fallback bị giới hạn. Khi người dùng yêu cầu HelpDesk hoặc tự xử lý không thành công, Bot tạo hoặc tiếp tục ticket đang hoạt động.

## Luồng ticket

1. Người dùng gửi mô tả và file từ Mini App hoặc tin nhắn từ Bot.
2. Backend xác thực người dùng, kiểm tra rate limit và quyền truy cập.
3. Rule engine phân loại rủi ro; Playbook retrieval tìm procedure phù hợp.
4. AI Agent có thể chọn các bước đã được phát hành nếu guardrail cho phép.
5. Nếu thiếu độ tin cậy, có rủi ro hoặc provider lỗi, ticket vẫn được tạo và chuyển HelpDesk.
6. Kỹ thuật viên dùng Admin để phản hồi, phân công và cập nhật trạng thái.
7. Người dùng kiểm tra, đánh giá hoặc mở lại trong cửa sổ cho phép.

## AI Agent và Staff Copilot

Hai kênh có mục đích khác nhau:

| Kênh | Người xem | Quyền |
|---|---|---|
| AI Agent | Nhân viên | Chỉ hướng dẫn an toàn theo Playbook đã duyệt; không tự thực thi |
| Staff Copilot | Admin/Kỹ thuật viên | Đề xuất giả thuyết, hướng kiểm tra và bản nháp; không tự gửi hoặc đổi ticket |

Cloud router thử các provider đủ điều kiện theo thứ tự cấu hình. Khi HelpDesk chọn một provider cụ thể, provider đó được ưu tiên đầu tiên; nếu thất bại, router vẫn có thể failover sang provider cloud còn lại trước khi dùng Rules fallback.

Không có Ollama hoặc local model trong đường chạy hiện hành.

## Playbook và Knowledge Base

- Knowledge Base phù hợp với hướng dẫn ngắn, do Admin quản lý.
- Playbook phù hợp với quy trình cần version, review, publish, rollback và audit.
- Runtime chỉ dùng procedure ở trạng thái `Published + Active`.
- Cập nhật Playbook không fine-tune model và không đưa ticket thô vào huấn luyện.
- PostgreSQL free-hosting dùng governance schema `1`; SQL Server dùng schema `10`.

## Lưu trữ theo profile

| Profile | State | Attachment | Mục đích |
|---|---|---|---|
| `free-hosting` | Supabase PostgreSQL | Supabase private bucket | Pilot công khai, không SLA |
| `nas` | SQL Server | Docker volume/filesystem | Máy chủ nội bộ/NAS |
| `local` | JSON, PostgreSQL hoặc SQL Server | Filesystem | Phát triển và kiểm thử |

Free-hosting bị hard-cap 30 ticket và 10 MB file cho mỗi ticket. Khi đạt ngưỡng, backend chỉ loại ticket `resolved`/`closed` cũ nhất; không tự xóa ticket đang hoạt động.

## Xác thực và phiên

### Nhân viên

- Mã mời có 12 ký tự chữ/số, hiển thị theo dạng `XXXX-XXXX-XXXX`.
- Mã chỉ dùng một lần và mặc định hết hạn sau 24 giờ.
- Access token tối đa 60 phút.
- Refresh session theo thiết bị có thời hạn trượt tối đa 90 ngày.
- Thu hồi phiên trong Admin làm access token hiện tại mất hiệu lực.

### Nhân sự HelpDesk

Backend duy trì staff account và RBAC. `LEGACY_STAFF_LOGIN_ENABLED` chỉ là cơ chế tương thích; khi vận hành lâu dài nên dùng tài khoản riêng thay vì chia sẻ bootstrap credential.

## SLA

Mặc định hệ thống tính theo ngày làm việc thứ Hai–thứ Sáu, `08:00–17:30`, múi giờ `Asia/Ho_Chi_Minh`. SLA tạm dừng khi ticket chờ người dùng và tiếp tục khi người dùng phản hồi. Các ngưỡng có thể cấu hình bằng biến môi trường phía Backend.

## Health và quan sát hệ thống

`GET /health` là điểm kiểm tra nhanh, gồm:

- phiên bản và feature flags;
- deployment profile;
- database và attachment provider;
- trạng thái Playbook/index/governance;
- AI provider readiness, quota quan sát được và circuit state;
- xác thực người dùng;
- trạng thái Zalo webhook và Bot.

Health không được trả API key, token, secret hoặc database credential.

## Bất biến an toàn

1. Mọi cloud provider lỗi vẫn phải giữ được đường tạo ticket/bàn giao.
2. AI Agent không tạo bước kỹ thuật ngoài Playbook đã duyệt cho nhân viên.
3. Copilot không tự gửi tin, tự thực thi lệnh hoặc đóng ticket.
4. Credential chỉ tồn tại trong `.env` cục bộ hoặc secret store của môi trường.
5. File là private; quyền tải được kiểm tra theo ticket.
6. Không có migration trong release chỉ thay đổi giao diện hoặc tài liệu.
7. Đổi public Backend URL bắt buộc build và deploy lại Mini App.

## Đọc tiếp

- [Hướng dẫn sử dụng](../guides/USER_GUIDE.md)
- [Hướng dẫn phát triển](../development/DEVELOPER_GUIDE.md)
- [Runbook vận hành](../operations/OPERATIONS_RUNBOOK.md)
- [Hướng dẫn bảo mật](../security/SECURITY_GUIDE.md)
- [Hướng dẫn triển khai](../deployment/README.md)
