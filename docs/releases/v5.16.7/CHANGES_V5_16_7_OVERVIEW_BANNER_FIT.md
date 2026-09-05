# v5.16.7 — Overview Banner Fit

> [!NOTE]
> Đây là hồ sơ phát hành lịch sử. Nội dung phản ánh hệ thống tại thời điểm phiên bản này được phát hành và có thể đã được bản mới thay thế. Khi vận hành hiện tại, xem [Trung tâm tài liệu](../../INDEX.md).


## Kết quả

GIF quy trình HelpDesk trên Tổng quan Admin không còn giãn theo toàn bộ vùng nội dung trên màn hình rộng. Banner được căn giữa, gọn hơn và để hàng đợi ticket xuất hiện sớm hơn trong khung nhìn.

## Thay đổi chính

- Giới hạn khung banner ở tối đa `980px` và vẫn co theo `100%` chiều rộng khả dụng trên màn hình nhỏ.
- Căn giữa banner trong vùng nội dung và giảm nhẹ khoảng cách phía trên.
- Giữ nguyên GIF `helpdesk-workflow-v5165.gif`, tỉ lệ `15/7`, nội dung thay thế và cơ chế không cắt khung hình.
- Bump cache-busting, footer và health metadata của Backend/Admin lên `5.16.7`.
- Bổ sung regression test khóa kích thước tối đa và cách căn giữa banner.

## An toàn và tương thích

- Không đổi API, nghiệp vụ ticket, Playbook, AI Router, xác thực hoặc Mini App.
- Backend/Admin: `5.16.7`; Mini App source: `5.16.6`.
- SQL Server/NAS schema `10`; PostgreSQL state schema `1`.
- Không có database migration và không cần build/publish lại Mini App.
- `render.yaml` vẫn tắt auto deploy; chỉ deploy Render sau khi giao diện được chủ ứng dụng duyệt và PR được merge.

## Validation

- Backend syntax trực tiếp cho toàn bộ `src`, `scripts` và Admin JavaScript: đạt.
- Backend regression: **126/126 test đạt**.
- Playbook benchmark: Hit@1 `0.90`, Hit@5 `1.00`, MRR `0.95`.
- Credential scan và `git diff --check`: đạt.
- Visual review cuối cùng: thực hiện trên preview/deployment sau khi chủ ứng dụng duyệt thay đổi UI.

## Rollback

Redeploy commit Backend/Admin v5.16.5 hoặc hoàn tác quy tắc `width`/`margin` của `.operations-workflow-banner`. Không thao tác database hoặc Mini App.
