# Upgrade v5.11.0 — Copilot Model Selection

> [!NOTE]
> Đây là hồ sơ phát hành lịch sử. Nội dung phản ánh hệ thống tại thời điểm phiên bản này được phát hành và có thể đã được bản mới thay thế. Khi vận hành hiện tại, xem [Trung tâm tài liệu](../../INDEX.md).


## Nâng cấp trên Windows

Dừng backend cũ, giữ nguyên `backend/.env`, sau đó chạy:

```powershell
git pull
cd .\backend
npm ci
npm run db:migrate
npm start
```

Xác nhận:

- Schema version là `9`.
- `/health` trả `version: 5.11.0` và feature `copilot-model-selection`.
- Admin → Ticket → Copilot hiển thị dropdown model.
- Chọn **Tự động** và một model cụ thể đều tạo được run.
- Run hiển thị riêng **Yêu cầu** và **Thực tế**.

Không cần thêm biến `.env`. Danh sách model lấy từ bốn cấu hình provider hiện có; provider thiếu key hoặc bị tắt sẽ hiển thị không sẵn sàng và không thể chọn.

## Rollback AI an toàn

```dotenv
AI_ROUTER_ENABLED=false
AI_PROVIDER=rules
AI_CLOUD_ENABLED=false
```

Migration 009 có thể giữ nguyên khi rollback ứng dụng; hai cột mới không ảnh hưởng v5.10.0.
