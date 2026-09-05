# Playbook Governance và vòng đời nội dung

Hệ thống không dùng “continual learning” tự do. Trong dự án này, “AI học” có nghĩa là nội dung do con người quản trị được review, phát hành và đưa vào RAG có kiểm soát; ticket thô không được dùng để fine-tune mô hình.

## Vòng đời chuẩn

| Trạng thái | Ý nghĩa | Có vào RAG? |
|---|---|---:|
| Draft | Đang biên soạn, chưa sẵn sàng review | Không |
| Submitted | Đã gửi người có quyền phê duyệt | Không |
| Published | Đã được duyệt thành một version bất biến | Có, nếu Active |
| Active | Version Published đang phục vụ runtime | Có |
| Rejected | Bị từ chối, cần chỉnh sửa thành bản mới | Không |
| Archived | Ngừng sử dụng nhưng còn lịch sử | Không |
| Rolled back | Active được chuyển về version Published trước | Version được chọn có |

Luồng thông thường:

```text
Draft → Submitted → Published → Active
   ↘         ↘             ↘
   sửa     Rejected      Archived / Rollback
```

## Quyền và trách nhiệm

- Kỹ thuật viên có thể đề xuất Draft, bổ sung bằng chứng và gửi review nếu được phân quyền.
- Admin hoặc người duyệt chịu trách nhiệm Publish, Active, Archive và Rollback.
- Người duyệt phải kiểm tra audience, mức rủi ro, điều kiện dừng và dữ liệu nhạy cảm.
- Mọi chuyển trạng thái cần có audit event gồm người thực hiện, thời gian, version và lý do.

## Tính bất biến và đồng thời

- Version đã Published không bị sửa tại chỗ; thay đổi tạo version mới.
- Một procedure chỉ có một Active version tại một thời điểm.
- PostgreSQL dùng giao dịch serializable cho lifecycle; SQL Server dùng transaction tương ứng.
- Yêu cầu lặp lại phải idempotent hoặc bị từ chối rõ ràng, không tạo hai version Active.
- Baseline seed có thể chạy lại mà không nhân đôi nội dung.

## Publish và re-index

Khi một version được kích hoạt:

1. Runtime chuyển nguồn hiện hành sang Published + Active.
2. Playbook index được đánh dấu cần làm mới.
3. `PLAYBOOK_AUTO_INDEX=true` tự rebuild index.
4. Request tiếp theo truy xuất version mới sau khi index sẵn sàng.

Nếu auto-index thất bại, kiểm tra `/health`, log đã làm sạch và chạy:

```powershell
cd backend
npm run playbook:index:force
npm run playbook:benchmark
```

## Rollback

Rollback không xóa version lỗi. Hệ thống chọn lại một version Published trước đó làm Active, ghi audit event và rebuild index.

Thực hiện rollback khi:

- procedure trả sai đối tượng hoặc sai bước;
- benchmark giảm đáng kể;
- nội dung có rủi ro vận hành/bảo mật;
- version mới gây lỗi index hoặc không thể truy xuất.

Sau rollback, xác nhận procedure cũ xuất hiện trong Top-K và version bị lỗi không còn phục vụ runtime.

## Dữ liệu và bảo mật

- Không đưa ticket thật, thông tin cá nhân, secret hoặc raw configuration vào Playbook.
- Dùng placeholder rõ nghĩa cho hostname, tài khoản và đường dẫn nội bộ.
- Không publish procedure có hành động phá hủy mà thiếu xác nhận, backup và điều kiện dừng.
- Nội dung `technician` không được hạ audience chỉ để tăng tỷ lệ tự xử lý.

Xem hướng dẫn tác nghiệp đầy đủ tại [Enterprise Playbook và RAG](./README_ENTERPRISE_PLAYBOOK.md).
