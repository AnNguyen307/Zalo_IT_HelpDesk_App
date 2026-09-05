# Hướng dẫn bảo mật

Tài liệu này mô tả ranh giới bảo mật, cách quản lý secret, quyền truy cập và quy trình phản ứng khi có nghi ngờ lộ thông tin.

## 1. Nguyên tắc nền tảng

1. Cấp quyền tối thiểu cần thiết.
2. Không tin dữ liệu định danh do client tự khai báo.
3. Secret chỉ tồn tại ở Backend hoặc secret store của nền tảng.
4. File đính kèm luôn private và được kiểm tra quyền theo ticket.
5. AI không được tự thực thi hoặc làm yếu biện pháp bảo mật.
6. Log, health, PR và tài liệu không được chứa credential.

## 2. Phân loại thông tin

| Loại | Ví dụ | Nơi được phép lưu |
|---|---|---|
| Công khai | Tên ứng dụng, App ID, phiên bản, URL Admin/health | README, tài liệu, metadata |
| Nội bộ | Mã ticket, audit, thống kê, lỗi provider đã làm sạch | Database/Admin có quyền |
| Nhạy cảm | Thông tin nhân viên, file ticket, nội dung hội thoại | Database/private storage |
| Bí mật | Mật khẩu, token, API key, database URL, webhook secret | `.env` cục bộ hoặc secret store |

App ID và public URL không phải secret. App Secret, Bot Token, refresh token, Supabase Secret Key và AI key là secret.

## 3. Danh sách secret chính

- `APP_SECRET`
- `ADMIN_PASSWORD` và credential staff bootstrap
- `POSTGRES_URL`
- `SUPABASE_SECRET_KEY`
- `SQLSERVER_PASSWORD`
- `ZALO_APP_SECRET`
- `ZALO_OPEN_API_KEY`
- `ZALO_BOT_TOKEN`
- `ZALO_BOT_WEBHOOK_SECRET`
- `GEMINI_API_KEY`
- `GROQ_API_KEY`
- `OPENROUTER_API_KEY`
- `SAMBANOVA_API_KEY`
- GitHub/ZMP deployment secret và refresh token

Không ghi giá trị thật của các biến này vào README, issue, PR body, ảnh chụp hoặc chat.

## 4. Quản lý secret

### Cục bộ

- Sao chép `.env.example` thành `.env` rồi nhập giá trị tại máy.
- `.env` phải nằm trong `.gitignore`.
- Hạn chế quyền đọc file cho user chạy Backend.
- Không đồng bộ `.env` qua thư mục công khai.

### Render/GitHub

- Dùng Environment/Secrets của nền tảng.
- Đánh dấu giá trị nhạy cảm là secret.
- Không in giá trị trong build log.
- Chỉ cấp GitHub workflow quyền `contents: read` nếu không cần quyền ghi.
- Rotate token theo chu kỳ của nhà cung cấp và ngay khi nghi bị lộ.

## 5. Xác thực Mini App

Production dùng xác thực Zalo phía Backend và phiên thiết bị của ứng dụng:

- Backend xác minh dữ liệu Zalo bằng secret/proof server-side khi luồng yêu cầu.
- Mã mời chỉ lưu dưới dạng HMAC hash và chỉ dùng một lần.
- Access token ngắn hạn; refresh token gắn với thiết bị và được xoay.
- Thu hồi phiên làm access token hiện tại mất hiệu lực.
- Client không được quyết định `userId`, role hoặc quyền truy cập ticket.

`ZALO_AUTH_MODE=development` không được dùng trên Backend public.

## 6. Tài khoản HelpDesk và RBAC

- Mỗi nhân sự dùng tài khoản riêng.
- Chỉ cấp `admin` cho người thực sự quản trị.
- `technician` được xử lý ticket nhưng không tự duyệt Playbook.
- `viewer` chỉ đọc.
- Khóa tài khoản và thu hồi phiên ngay khi nhân sự rời vai trò.
- Không chia sẻ bootstrap password qua ticket hoặc nhóm chat.

## 7. Attachment

- Chấp nhận theo allowlist định dạng.
- Backend kiểm tra MIME, kích thước, số lượng và ngân sách ticket.
- Storage bucket không public.
- Download/preview phải qua authorization của Backend.
- Tên file không được dùng trực tiếp để tạo đường dẫn filesystem.
- Temp file phải được dọn khi request thất bại.

Người dùng không được gửi mật khẩu, OTP, recovery code, private key hoặc dữ liệu khách hàng không cần thiết trong file.

## 8. Webhook

### Zalo consent/data webhook

- Xác minh chữ ký theo cấu hình.
- Payload không hợp lệ bị từ chối hoặc bỏ qua an toàn.
- Sự kiện thu hồi quyền/xóa dữ liệu phải được audit.

### Zalo Bot webhook

- Secret token dài 8–256 ký tự.
- So sánh secret an toàn phía server.
- Durable inbox chống mất sự kiện và xử lý lặp.
- Bỏ qua tin Bot tự gửi, group chat và payload không hỗ trợ.
- Không trả token/secret trong endpoint trạng thái.

## 9. AI và dữ liệu

- Bật redaction trước khi dùng dữ liệu thật với cloud provider.
- Chỉ gửi dữ liệu tối thiểu cần cho tác vụ.
- Không gửi credential hoặc file nhạy cảm vào prompt.
- Employee response không hiển thị provider/model/confidence/internal routing.
- Staff Copilot chỉ là gợi ý, không tự thực thi.
- Rủi ro bảo mật, mất dữ liệu, đặc quyền và hạ tầng phải handoff.

Nếu doanh nghiệp có yêu cầu dữ liệu không được rời mạng nội bộ, không bật cloud AI cho dữ liệu đó cho tới khi có đánh giá và cơ chế được phê duyệt.

## 10. Database và storage

- Không public port SQL Server `1433` ra Internet.
- Dùng application login quyền tối thiểu sau migration.
- PostgreSQL/Supabase secret key chỉ ở Backend.
- Backup phải được mã hóa và kiểm tra restore.
- Không sửa state trực tiếp để bỏ qua quyền hoặc workflow.
- Migration phải có backup, trạng thái trước/sau và kế hoạch rollback.

## 11. Logging và quan sát

Được ghi:

- request ID, thời điểm, status code;
- ticket ID nội bộ khi cần truy vết;
- provider/model name và lỗi đã làm sạch;
- audit event về quyền/trạng thái.

Không được ghi:

- password, OTP, token, cookie, authorization header;
- database URL có password;
- raw Bot payload nếu chứa dữ liệu không cần thiết;
- toàn bộ prompt/file người dùng khi không phục vụ điều tra hợp lệ.

## 12. Khi secret bị lộ

1. Không xóa dấu vết trước khi ghi nhận loại secret và nơi xuất hiện.
2. Thu hồi/rotate secret tại nhà cung cấp ngay.
3. Cập nhật secret store của Backend/workflow.
4. Redeploy hoặc restart thành phần cần thiết.
5. Thu hồi session nếu secret ảnh hưởng xác thực.
6. Kiểm tra audit/log cho hành vi bất thường.
7. Xóa secret khỏi vị trí công khai; nếu đã vào Git history, đánh giá việc rewrite history riêng.
8. Ghi incident và bổ sung biện pháp ngăn tái diễn.

Không chỉ xóa dòng chứa secret rồi tiếp tục dùng key cũ.

## 13. Checklist trước merge/deploy

- [ ] Diff không chứa `.env`, token, key, URL database có password hoặc dữ liệu thật.
- [ ] Endpoint mới có auth/RBAC/rate limit phù hợp.
- [ ] Lỗi trả thông báo có thể hành động nhưng không lộ nội bộ.
- [ ] File/path/input có giới hạn và validation.
- [ ] Test bao phủ truy cập trái quyền và trạng thái hết phiên.
- [ ] CORS chỉ cho origin cần thiết.
- [ ] Health không trả secret.
- [ ] Migration/rollback được ghi rõ.
- [ ] Mini App bundle không chứa secret server-side.

## 14. Báo cáo vấn đề bảo mật

Không mở issue công khai có payload, key hoặc dữ liệu người dùng. Gửi báo cáo riêng cho chủ repository, gồm thời điểm, phạm vi, bước tái hiện đã làm sạch và biện pháp tạm thời. Sau khi xử lý, chỉ công khai nội dung không tạo thêm rủi ro.

Xem thêm [Runbook vận hành](../operations/OPERATIONS_RUNBOOK.md) và [Troubleshooting](../troubleshooting/README.md).
