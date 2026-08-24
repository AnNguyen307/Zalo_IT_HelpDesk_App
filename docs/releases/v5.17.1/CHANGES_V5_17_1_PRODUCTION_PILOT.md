# v5.17.1 — Zalo Mini App Production Pilot Readiness

## Kết quả

`v5.17.1` biến luồng pilot Zalo Mini App thành một release gate có thể lặp lại. Gate khởi động Backend cô lập, dùng đúng API mà Mini App/Admin đang gọi và kiểm tra xuyên suốt:

1. Admin tạo mã mời một lần.
2. Thiết bị đổi mã mời lấy access/refresh session và xoay refresh token.
3. Người dùng tạo ticket có Playbook phù hợp.
4. Người dùng tải file multipart và xem trước an toàn.
5. Người dùng yêu cầu HelpDesk; AI User bị khóa và Copilot chỉ chạy nội bộ.
6. HelpDesk phản hồi, người dùng nhận notification.
7. HelpDesk chuyển ticket sang `resolved` với nội dung xử lý.
8. Người dùng đánh giá; conversation/history/attachment được đối soát.

Gate cũng xác nhận mã mời và refresh token không được lưu dạng rõ, đồng thời public ticket không rò Copilot suggestion hoặc chẩn đoán nội bộ.

## Thay đổi

- Thêm `backend/test/production-pilot-v5171.test.mjs` và lệnh `npm run test:pilot`.
- Workflow Zalo Mini App chạy gate này trước khi build/deploy Testing.
- Workflow chỉ chấp nhận Backend public khi `/health`:
  - đúng version trong `backend/package.json`;
  - có feature `production-pilot-e2e`;
  - dùng `one-time-invite` cho user login.
- Đồng bộ Backend/Admin và Mini App source metadata lên `5.17.1`.
- Cache-bust Admin asset ở `5.17.1`.
- Tự dựng lại RAG index cục bộ khi PostgreSQL Governance sẵn sàng, giúp container Render mới phục hồi `indexCurrent` dù filesystem cũ đã bị thay thế.
- Giữ Mini App trên Vite `5.4.x` (lock `5.4.21`), đúng baseline Vite 5 của Zalo và tương thích với ZMP CLI `4.0.3`; Vite 6 build được bundle nhưng ZMP CLI từ chối ở bước deploy với lỗi `Vite not found`.
- Thêm checklist pilot thực tế cho Zalo WebView và Render.

## Triển khai

- Backend/Admin: deploy commit `v5.17.1` lên Render trước.
- Mini App: cần build và deploy **Testing version** để chạy pilot trên Zalo với `VITE_API_BASE_URL=https://zalo-it-helpdesk-pilot.onrender.com`.
- Workflow Zalo không tự phát hành Production. Việc publish tới người dùng thật vẫn là thao tác riêng sau khi pilot đạt.
- Không chạy migration. SQL Server giữ schema `10`; PostgreSQL state giữ schema `1`; PostgreSQL Playbook Governance giữ schema `1`.

## Validation bắt buộc

```bash
cd backend
npm ci
npm run check
npm run test:pilot
npm test
npm run playbook:benchmark

cd ../miniapp
npm ci
npm run build
```

Sau khi deploy Render, `/health` phải trả `version: 5.17.1`, có `production-pilot-e2e`, PostgreSQL state schema `1` và Playbook Governance `ready: true`, schema `1`.

## Dữ liệu và rollback

Automated gate chỉ dùng database JSON và thư mục upload tạm; không tạo/xóa ticket trên Render. Pilot thủ công chỉ dùng dữ liệu giả lập, không nhập credential hoặc dữ liệu nhạy cảm vào ticket/file.

Rollback Backend/Admin bằng cách redeploy merge commit `a063784` của `v5.17.0`. Nếu Mini App Testing đã được deploy, chọn lại Testing version trước đó trên Zalo Mini App Console. Không xóa bảng PostgreSQL, không rollback migration và không đổi secret.
