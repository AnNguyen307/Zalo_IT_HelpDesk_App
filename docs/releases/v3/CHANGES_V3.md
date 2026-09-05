# Changes in v3.0

> [!NOTE]
> Đây là hồ sơ phát hành lịch sử. Nội dung phản ánh hệ thống tại thời điểm phiên bản này được phát hành và có thể đã được bản mới thay thế. Khi vận hành hiện tại, xem [Trung tâm tài liệu](../../INDEX.md).


## Backend
- Added attachment storage under `backend/data/uploads` with authenticated downloads.
- Added SLA policy, deadlines, first-response timestamps and overdue monitor.
- Added in-app notifications, unread state and polling endpoints.
- Added ticket history/audit timeline.
- Added reopen and satisfaction rating APIs.
- Added overdue and satisfaction metrics to Admin.
- Added ngrok warning bypass header support and HTTP request logging.

## Mini App
- Added file selection on ticket creation and detail pages.
- Added SLA card and overdue filter.
- Added notification inbox and unread badge.
- Added reopen, rating and history UI.
- Added automatic `app-config.json` asset synchronization after build.

## Admin
- Added SLA status, overdue highlighting, attachments, timeline and satisfaction view.
- Added admin attachment upload/download.
- Added automatic 30-second dashboard refresh.

## 3.1.0 - Auto ngrok sync

- Thêm `START_HELPDESK_AUTO.bat`.
- Thêm `scripts/windows/start-helpdesk-auto.ps1` và `.bat`.
- Tự đọc URL ngrok hiện tại từ local Agent API.
- Tự cập nhật `VITE_API_BASE_URL` trong `miniapp/.env`.
- Chỉ build/deploy lại khi URL thay đổi, hoặc khi dùng `-ForceDeploy`.
