# Render + Supabase Free — Production pilot

> Tài liệu được giới thiệu ở v5.15.1 và đã cập nhật cho Backend/Admin `v5.18.6`, Mini App source `v5.17.2`, Production version `33`. Render Free và Supabase Free phù hợp pilot, không phải môi trường có SLA.

## Phạm vi

Profile này dùng để thử backend public trước khi có NAS. Nó không phải production có SLA:

- Render Free sleep sau 15 phút không có inbound traffic, mất toàn bộ filesystem local khi restart/redeploy và có 750 instance-hours/workspace/tháng. [Render Free documentation](https://render.com/docs/free)
- Supabase Free hiện gồm 500 MB database, 1 GB file storage, tối đa 50 MB/file và có thể pause sau một tuần ít hoạt động. [Supabase pricing](https://supabase.com/pricing), [Storage file limits](https://supabase.com/docs/guides/storage/uploads/file-limits), [Project pausing](https://supabase.com/docs/guides/platform/free-project-pausing)
- Project Free không có downloadable managed database backup. [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod)

Ứng dụng chủ động giới hạn 30 ticket toàn hệ thống và tổng 10 MB ảnh/file cho mỗi ticket. Khi cần chỗ cho ticket thứ 31, backend xóa ticket `resolved`/`closed` cũ nhất và dọn file private tương ứng; ticket đang hoạt động không bao giờ bị xóa.

## Kiến trúc

```text
Zalo Mini App
  → Render Free Node.js container
      → Supabase PostgreSQL / helpdesk_runtime_state
      → Supabase private bucket / helpdesk-attachments
```

Database lưu state nghiệp vụ trong một hàng JSONB có `SELECT ... FOR UPDATE`, revision và transaction. Cách này giảm rủi ro port schema cho pilot nhưng không thay SQL Server schema `10` của profile NAS.

## 1. Chuẩn bị Supabase

1. Tạo một Free project riêng cho pilot.
2. Chọn region gần Render Singapore nếu có.
3. Trong Storage, tạo bucket `helpdesk-attachments`:
   - private;
   - file size limit `10 MB`;
   - không tạo public policy.
4. Trong Settings → API Keys, tạo/copy một backend Secret Key dạng `sb_secret_...`. Secret keys bypass RLS nên chỉ lưu ở Render; không đưa vào Mini App, GitHub hoặc ảnh chụp. [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
5. Trong Connect, lấy PostgreSQL pooler connection string. Mật khẩu phải URL-encode nếu chứa ký tự đặc biệt.

Không gửi các giá trị trên vào chat hoặc commit `.env`.

## 2. Chuẩn bị Zalo

Lấy App Secret của đúng Zalo Mini App đang dùng. Backend sẽ:

1. nhận access token từ `getAccessToken`;
2. tạo `appsecret_proof` HMAC-SHA256;
3. gọi `https://graph.zalo.me/v2.0/me?fields=id,name,picture` với hai header `access_token` và `appsecret_proof`;
4. dùng profile trả về để phát session riêng.

Đây là lớp xác minh danh tính Zalo phía server. Luồng truy cập nhân viên hiện tại còn yêu cầu **mã mời dùng một lần** do Admin cấp; access token hoặc `userId` phía client không tự tạo quyền truy cập HelpDesk. [Zalo Mini App user authentication](https://miniapp.zaloplatforms.com/documents/intro/authen-user/)

## 3. Tạo Render Blueprint

1. Kết nối Render với repository GitHub này.
2. Chọn **New → Blueprint** và repository này.
3. Render đọc `render.yaml`; xác nhận:
   - service `zalo-it-helpdesk-pilot`;
   - region `singapore`;
   - plan `free`;
   - auto deploy `off`;
   - health check `/health`.
4. Nhập các biến `sync: false` khi Render hỏi:

| Biến | Nguồn |
|---|---|
| `POSTGRES_URL` | Supabase pooler connection string |
| `SUPABASE_URL` | Project URL `https://<ref>.supabase.co` |
| `SUPABASE_SECRET_KEY` | Backend secret key `sb_secret_...` |
| `ZALO_APP_SECRET` | Zalo Mini App secret |
| `ADMIN_PASSWORD` | Mật khẩu bootstrap mạnh, tối thiểu 12 ký tự |

`APP_SECRET` được Render tạo ngẫu nhiên. Không thay nó giữa các restart, nếu không toàn bộ session hiện có sẽ mất hiệu lực.

Render Free không hỗ trợ pre-deploy command trả phí. Container vì vậy chạy lệnh idempotent sau từ `CMD` dạng exec trong `backend/Dockerfile`; Blueprint không override `dockerCommand` để tránh Render phân tách sai chuỗi shell:

```text
npm run db:postgres:init && exec npm start
```

Nó tạo PostgreSQL state schema `1`, revoke quyền `PUBLIC/anon/authenticated`, bật RLS và không xóa state đã có.

Image backend dùng Node.js 22 Alpine để cung cấp native WebSocket mà Supabase SDK cần khi khởi tạo client phía server.

## 4. Kiểm tra lần đầu

Không đổi Mini App ngay. Trước hết mở:

```text
https://<render-service>.onrender.com/health
```

Kỳ vọng:

```text
ok = true
version = 5.18.6
deployment.profile = free-hosting
deployment.attachments.provider = supabase
deployment.retention.maxStoredTickets = 30
deployment.retention.maxTicketAttachmentBytes = 10485760
database.provider = postgres
database.stateSchema = 1
```

Các feature nền tảng phải có `free-hosting-pilot`, `postgres-state-store`, `supabase-private-attachments`, `direct-zalo-token-verification`, `30-ticket-retention-cap`, `terminal-ticket-auto-eviction`, `durable-attachment-gc` và `10mb-ticket-attachment-budget`. Feature mới hơn có thể xuất hiện thêm; đối chiếu version và `ok=true` trước khi tiếp tục.

Sau cold start đầu tiên có thể mất khoảng một phút theo giới hạn Render Free.

## 5. Bootstrap Admin

Manifest bật `LEGACY_STAFF_LOGIN_ENABLED=true` để database mới không bị khóa ngoài:

1. đăng nhập `/admin` bằng user `admin` và `ADMIN_PASSWORD` vừa đặt;
2. tạo ít nhất một named Admin account;
3. đăng xuất và kiểm tra named Admin đăng nhập được;
4. đổi Render env `LEGACY_STAFF_LOGIN_ENABLED=false`;
5. redeploy/restart và xác nhận legacy admin không còn đăng nhập được;
6. tạo lời mời một lần cho tài khoản nhân viên và kiểm tra mã hết hạn/đã dùng bị từ chối.

Không để bootstrap login hoạt động suốt pilot.

## 6. Trỏ Mini App sang Render

Chỉ sau khi health, Admin, Zalo login, ticket và upload đều đạt:

```env
VITE_API_BASE_URL=https://<render-service>.onrender.com
```

Sau đó build source Mini App `v5.17.2`, deploy Testing, hoàn tất E2E và chỉ Publish version đã được Zalo duyệt. Production hiện là version `33`. URL API được đóng vào bundle nên đổi backend URL luôn yêu cầu build/deploy lại Mini App.

## 7. Smoke test bắt buộc

- Zalo access token hợp lệ đăng nhập; `userId` giả bị từ chối.
- Tạo ticket được khi AI cloud tắt/toàn bộ provider lỗi.
- User chỉ thấy ticket của mình.
- Reply, upload, download/preview file hoạt động.
- Tổng attachment đúng 10 MB được chấp nhận; lớn hơn 10 MB bị từ chối với `TICKET_ATTACHMENT_BUDGET_EXCEEDED`.
- Khi đủ 30 ticket có ít nhất một ticket hoàn tất, ticket hoàn tất cũ nhất cùng file được dọn khi tạo ticket mới.
- Khi cả 30 ticket đều đang hoạt động, ticket mới bị từ chối với `TICKET_CAPACITY_REACHED`; không ticket đang hoạt động nào bị xóa.
- Restart Render không mất ticket/file.
- Handoff khóa AI User; Copilot không xuất hiện ở Client.
- Request vượt rate limit trả `429` và `Retry-After`.
- Bucket vẫn private và database table không truy cập được bằng publishable/anon key.

## Giới hạn và rollback

- Dataset cloud mặc định rỗng; deploy không tự upload dữ liệu/file local.
- PostgreSQL pilot hiện hỗ trợ Playbook Governance; chỉ Published + Active được dùng cho RAG.
- Rollback mã nguồn không khôi phục ticket/file đã bị retention xóa và không tự rollback schema/dữ liệu.
- Tắt Render service hoặc đổi Mini App về backend/ngrok cũ để rollback. Dữ liệu local không bị sửa.
- Trước dữ liệu pilot quan trọng, xuất PostgreSQL bằng công cụ chuẩn và copy Storage bằng Supabase CLI/S3; Free plan không cung cấp downloadable managed backup.
