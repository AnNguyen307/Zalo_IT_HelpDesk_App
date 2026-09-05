# Checklist triển khai và phát hành

Checklist này áp dụng cho Backend/Admin `v5.18.6` và Mini App source `v5.17.2`. Production hiện dùng Mini App version `33`. Chỉ đánh dấu một mục khi đã có bằng chứng kiểm tra tương ứng.

## 1. Xác định phạm vi

- [ ] Ghi rõ component thay đổi: Backend, Admin, Mini App, Playbook, database hay hạ tầng.
- [ ] Ghi phiên bản hiện tại và phiên bản đích.
- [ ] Chọn đúng profile: Render + Supabase, NAS + SQL Server, hoặc local development.
- [ ] Xác định có migration, deploy Mini App, đổi biến môi trường hoặc thao tác dữ liệu hay không.
- [ ] Có phương án rollback và người chịu trách nhiệm xác nhận.

## 2. Mã nguồn và bảo mật

- [ ] Working tree chỉ chứa file thuộc phạm vi thay đổi.
- [ ] Không có `.env`, token, mật khẩu, cookie, connection string hoặc dữ liệu người dùng thật trong diff.
- [ ] Secret mới chỉ được lưu trong secret store của môi trường đích.
- [ ] Dependency và lockfile đồng bộ nếu package thay đổi.
- [ ] Tài liệu, version metadata và release note khớp với hành vi thực tế.
- [ ] `git diff --check` không báo lỗi khoảng trắng hoặc conflict marker.

## 3. Quality gate

### Backend/Admin

- [ ] `cd backend && npm ci` hoàn tất.
- [ ] `npm run check` đạt.
- [ ] `npm test` đạt.
- [ ] Regression test bao phủ bug hoặc hành vi mới.
- [ ] Smoke test local `/health`, `/admin` và API bị ảnh hưởng đạt.

### Mini App

- [ ] `cd miniapp && npm ci` hoàn tất.
- [ ] `npm run build` đạt với Vite `5.4.x` và ZMP CLI `4.0.3`.
- [ ] Kiểm tra quyền Zalo, trạng thái tải/lỗi/rỗng và từ chối quyền profile.
- [ ] E2E trên điện thoại thật đạt ở đúng Testing version.
- [ ] Không còn API URL, App ID hoặc tên ứng dụng của môi trường khác trong bundle.

### Tài liệu hoặc công cụ

- [ ] Liên kết nội bộ tồn tại và mở đúng tài liệu.
- [ ] Lệnh, đường dẫn và tên biến môi trường khớp repository.
- [ ] Script thay đổi đã qua syntax check và preview/dry-run nếu có.
- [ ] Hồ sơ lịch sử không bị viết lại như trạng thái hiện tại.

## 4. Database và dữ liệu

- [ ] Xác định provider: PostgreSQL state/governance, SQL Server hoặc JSON local.
- [ ] Backup trước migration hoặc thay đổi dữ liệu.
- [ ] Migration được đọc và kiểm tra trên bản sao trước môi trường chính.
- [ ] PostgreSQL state/governance schema mong đợi: `1`/`1`.
- [ ] SQL Server schema mong đợi: `10`.
- [ ] Migration chạy đúng một lần; không chạy chỉ vì deploy mã nguồn.
- [ ] Kiểm tra dữ liệu cũ, file đính kèm, lifecycle Playbook và audit log sau deploy.

## 5. Cấu hình runtime

- [ ] `APP_SECRET` ổn định và đủ mạnh; không tự tạo lại khi redeploy.
- [ ] `ADMIN_PASSWORD` chỉ dùng bootstrap và không còn là đường đăng nhập thường xuyên khi đã có named Admin.
- [ ] `LEGACY_STAFF_LOGIN_ENABLED=false` sau bootstrap.
- [ ] CORS chỉ cho phép origin cần thiết.
- [ ] Database và attachment provider đúng profile.
- [ ] AI provider thiếu key bị skip; Rules/HelpDesk fallback vẫn hoạt động.
- [ ] Playbook chỉ lấy Published + Active và index ở trạng thái ready.
- [ ] Nếu bật Zalo Bot, token/secret có mặt, webhook đăng ký thành công và log không lộ secret.

## 6. Deploy Backend/Admin

- [ ] Merge đúng commit đã kiểm tra vào `main`.
- [ ] Render/NAS checkout đúng commit, không deploy nhầm branch.
- [ ] Build image thành công và health check qua.
- [ ] `/health` trả `ok=true`, version `5.18.6` và đúng profile.
- [ ] Database, attachment, Playbook, AI và Bot có trạng thái mong đợi.
- [ ] Admin đăng nhập, menu, ticket workspace và giao diện mobile hoạt động.
- [ ] Không mất ticket, message, attachment hoặc audit event.

## 7. Deploy Mini App

- [ ] `APP_ID=4185582976193315701` trong cấu hình build Mini App.
- [ ] Tên chính thức là `Nguyễn Phan Trường An HelpDesk` trong metadata cần xét duyệt.
- [ ] `VITE_API_BASE_URL` trỏ backend HTTPS production.
- [ ] Deploy Testing, ghi version và artifact/commit.
- [ ] Hoàn tất E2E: lời mời một lần, đăng nhập, tạo ticket, upload, reply, xử lý và đánh giá.
- [ ] Gửi Zalo xét duyệt với mô tả ngắn, chính xác và không chứa secret.
- [ ] Chỉ Publish sau khi trạng thái Approved và người có thẩm quyền xác nhận.
- [ ] Sau Publish, xác nhận version Live `100%` và mở bằng QR Production.

## 8. Smoke test sau phát hành

- [ ] Người dùng hợp lệ đăng nhập; invite hết hạn/đã dùng bị từ chối đúng.
- [ ] User chỉ xem được ticket thuộc quyền.
- [ ] Tạo ticket khi AI cloud tắt vẫn thành công.
- [ ] Reply, upload, preview/download và xóa file đúng quyền.
- [ ] Giới hạn 30 ticket và 10 MB/ticket trả thông báo có thể hành động.
- [ ] Handoff khóa phản hồi tự động cho người dùng; Copilot chỉ hiện với staff.
- [ ] Ticket resolved/closed có thể đánh giá và reopen trong giới hạn 14 ngày.
- [ ] Render cold start hoặc restart không làm mất dữ liệu; webhook Bot tự đăng ký lại nếu bật.

## 9. Rollback và bàn giao

- [ ] Ghi commit/version trước và sau phát hành.
- [ ] Rollback mã nguồn không tự rollback database; đánh giá tương thích trước khi thực hiện.
- [ ] Không xóa database, bucket hoặc volume cũ trước khi đối soát.
- [ ] Ghi rõ migration/deploy/Ctrl+F5 có cần hay không trong bàn giao.
- [ ] Cập nhật [Runbook vận hành](../operations/OPERATIONS_RUNBOOK.md) hoặc release note nếu quy trình thay đổi.

Xem [Tổng quan triển khai](./README.md) để chọn profile và thứ tự thực hiện.
