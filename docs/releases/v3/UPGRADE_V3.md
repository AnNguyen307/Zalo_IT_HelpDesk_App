# Nâng cấp IT HelpDesk v3.0

> [!NOTE]
> Đây là hồ sơ phát hành lịch sử. Nội dung phản ánh hệ thống tại thời điểm phiên bản này được phát hành và có thể đã được bản mới thay thế. Khi vận hành hiện tại, xem [Trung tâm tài liệu](../../INDEX.md).


## Tính năng mới

- Upload ảnh và file đính kèm (tối đa 8 file/ticket, mặc định 5 MB/file).
- SLA phản hồi đầu tiên và SLA xử lý theo mức ưu tiên.
- Bộ giám sát tự động ghi cảnh báo khi ticket quá SLA.
- Thông báo trong Mini App khi kỹ thuật viên phản hồi, đổi trạng thái hoặc thêm file.
- Lịch sử thay đổi trạng thái, ưu tiên, phân công, file, SLA, reopen và rating.
- Mở lại ticket trong thời hạn cấu hình (mặc định 14 ngày).
- Đánh giá hài lòng 1–5 sao và nhận xét.
- Dashboard Admin hiển thị ticket quá SLA, điểm hài lòng, file và timeline.

## Nâng cấp từ v2 mà không mất dữ liệu

1. Dừng backend và ngrok.
2. Sao lưu `backend/data/db.json` và thư mục `backend/data/uploads` nếu đã có.
3. Chép source v3 đè lên source cũ, nhưng giữ nguyên:
   - `backend/.env`
   - `miniapp/.env`
   - `backend/data/db.json`
4. Không cần sửa cấu trúc DB thủ công. Backend tự bổ sung các collection còn thiếu khi đọc file cũ.
5. Bổ sung các biến SLA/upload từ `backend/.env.example` vào `.env` nếu muốn đổi giá trị mặc định.
6. Chạy backend, ngrok, sau đó build/deploy Mini App.

## Lệnh chạy

```powershell
cd backend
npm start
```

Terminal khác:

```powershell
ngrok http 8080
```

Build và deploy:

```powershell
cd miniapp
npm install
npm run deploy
```

`npm run deploy` tự build, tự cập nhật tên asset trong `app-config.json`, rồi mở `zmp deploy`.

## Giới hạn thông báo

Bản v3 sử dụng thông báo nội bộ và polling 20 giây. Người dùng thấy thông báo khi Mini App đang mở hoặc khi mở lại app. Đây chưa phải Zalo OA push khi app đã đóng.

## SLA mặc định

| Ưu tiên | Phản hồi đầu tiên | Xử lý |
|---|---:|---:|
| Urgent | 30 phút | 4 giờ |
| High | 2 giờ | 8 giờ |
| Normal | 4 giờ | 24 giờ |
| Low | 8 giờ | 72 giờ |

SLA hiện tính theo thời gian 24/7 và chưa loại trừ cuối tuần/ngày nghỉ.
