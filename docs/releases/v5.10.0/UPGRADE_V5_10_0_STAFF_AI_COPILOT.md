# Upgrade v5.10.0 — Staff AI Copilot

> [!NOTE]
> Đây là hồ sơ phát hành lịch sử. Nội dung phản ánh hệ thống tại thời điểm phiên bản này được phát hành và có thể đã được bản mới thay thế. Khi vận hành hiện tại, xem [Trung tâm tài liệu](../../INDEX.md).


## 1. Cập nhật mã và dependency

```powershell
git pull
cd backend
npm ci
```

## 2. Chạy migration trước khi restart backend

```powershell
npm run db:migrate
```

Kết quả phải có `008_staff_ai_copilot.sql` và schema version `8`.

## 3. Restart và kiểm tra

```powershell
npm run check
npm test
npm start
```

`GET /health` phải trả:

- `version: 5.10.0`
- feature `staff-ai-copilot`
- database ready

## 4. Smoke test

1. Tạo ticket khớp Playbook và xác nhận có hai nút kết quả.
2. Chọn **Tôi vẫn chưa xử lý được**; xác nhận ticket về `open` và AI không phản hồi User thêm.
3. Mở ticket ở Admin → tab **Copilot**; nhấn **Làm mới** đến khi run hoàn tất.
4. Kiểm tra mục Playbook và Giả thuyết AI được tách nhãn.
5. Nhấn **Dùng làm bản nháp**; xác nhận nội dung chỉ vào ô reply và chưa được gửi.
6. Đăng nhập User và xác nhận không có nội dung Copilot trong hội thoại/response Mini App.

## 5. Mini App

```powershell
cd ..\miniapp
npm ci
npm run build
```

Deploy lại Mini App sau khi backend v5.10.0 và migration đã sẵn sàng.
