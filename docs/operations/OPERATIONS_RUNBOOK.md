# Runbook vận hành

Tài liệu này dành cho người chịu trách nhiệm theo dõi Backend/Admin, Zalo Mini App và Zalo Bot sau khi hệ thống đã được triển khai.

## 1. Thông tin Production

| Hạng mục | Giá trị |
|---|---|
| Ứng dụng | Nguyễn Phan Trường An HelpDesk |
| Mini App ID | `4185582976193315701` |
| Mini App Production | Phiên bản `33`, Live 100% |
| Backend/Admin | `5.18.6` |
| Admin | <https://zalo-it-helpdesk-pilot.onrender.com/admin> |
| Health | <https://zalo-it-helpdesk-pilot.onrender.com/health> |
| Webhook Bot | `https://zalo-it-helpdesk-pilot.onrender.com/api/webhooks/zalo-bot` |

Môi trường hiện tại dùng Render Free và Supabase Free nên phù hợp pilot, không có SLA doanh nghiệp và có thể cold start.

## 2. Kiểm tra đầu ca hoặc sau deploy

1. Mở `/health` và xác nhận HTTP `200`, `ok: true`.
2. Kiểm tra `version` là `5.18.6`.
3. Kiểm tra deployment profile, database và attachment provider đúng môi trường.
4. Kiểm tra Playbook `ready` và governance/index không báo lỗi.
5. Kiểm tra AI provider readiness; quota thiếu dữ liệu phải hiểu là `unknown`, không phải `0`.
6. Kiểm tra `bot.enabled`, `bot.configured` và `webhookRegistration.ok` nếu Bot đang bật.
7. Đăng nhập Admin và mở thử hàng đợi ticket.

Không sao chép toàn bộ health/log vào nơi công khai nếu payload chứa thông tin vận hành nội bộ.

## 3. Theo dõi hàng đợi ticket

Ưu tiên theo thứ tự:

1. Ticket khẩn cấp, bảo mật, mất dữ liệu hoặc ảnh hưởng nhiều người.
2. Ticket quá SLA hoặc sắp quá SLA.
3. Ticket có phản hồi mới từ người dùng.
4. Ticket đang chờ phân công.
5. Ticket chờ người dùng quá lâu cần nhắc lại hoặc đóng theo quy trình.

Mỗi ticket phải cho thấy rõ trạng thái, người phụ trách, bước tiếp theo và bên cần hành động.

## 4. Xử lý Render cold start

Dấu hiệu:

- lần mở `/health` đầu tiên chậm;
- Bot không phản hồi ngay sau thời gian dài không có traffic;
- log xuất hiện chuỗi khởi động container và đăng ký lại webhook.

Cách xử lý:

1. Gọi `/health` và chờ instance chuyển sẵn sàng.
2. Xác nhận database, Playbook và Bot đều ready.
3. Với Bot, chờ hết `ZALO_BOT_WEBHOOK_REGISTER_DELAY_MS` rồi kiểm tra `webhookRegistration.ok`.
4. Gửi một tin nhắn thử mới; không suy luận từ tin nhắn đã gửi trong lúc instance ngủ.

Nếu yêu cầu phản hồi thời gian thực ổn định, chuyển Backend sang gói always-on hoặc hạ tầng NAS/server phù hợp.

## 5. Vận hành Zalo Bot

### Trạng thái mong đợi

- Bot token và webhook secret chỉ nằm trong Render secret store.
- Webhook secret dài 8–256 ký tự.
- Webhook URL dùng HTTPS và trỏ đúng `/api/webhooks/zalo-bot`.
- Backend tự đăng ký lại webhook sau khi instance mới sẵn sàng nếu tính năng này được bật.

### Kiểm thử an toàn

Gửi tin nhắn riêng:

```text
Wi-Fi trên laptop đã kết nối nhưng hiển thị “No Internet”.
Máy khác cùng khu vực vẫn truy cập Internet bình thường.
```

Sau hướng dẫn, trả lời `Đã được` để kiểm tra self-service hoặc `Tôi đã thử nhưng vẫn chưa được` để kiểm tra handoff/tạo ticket.

Không thử bằng nhóm Zalo và không gửi token/secret vào cuộc trò chuyện.

## 6. Vận hành Playbook

1. Kỹ thuật viên tạo hoặc sửa bản nháp.
2. Kiểm tra audience, risk, điều kiện dừng và điều kiện chuyển cấp.
3. Gửi duyệt.
4. Admin duyệt hoặc từ chối có lý do.
5. Sau publish, xác nhận version mới là `Published + Active`.
6. Kiểm tra index/retrieval và chạy benchmark khi thay đổi nguồn lớn.

Không chỉnh trực tiếp dữ liệu governance trong database để bỏ qua review.

## 7. Vận hành AI provider

- Route mặc định: Gemini → Groq → OpenRouter → SambaNova.
- Provider thiếu key hoặc bị tắt được bỏ qua.
- Timeout, `429`, `5xx`, schema sai hoặc confidence không đạt có thể kích hoạt failover.
- Rules fallback phải giữ đường tạo ticket khi cloud không sẵn sàng.
- Staff Copilot là tư vấn nội bộ; kỹ thuật viên phải kiểm chứng trước khi gửi.

Khi provider lỗi:

1. Xem trạng thái provider và lỗi gần nhất trong **Hệ thống & AI**.
2. Không dán API key vào log/chat để nhờ kiểm tra.
3. Xác nhận ticket vẫn tạo được bằng Rules fallback.
4. Chỉ thay/rotate key theo quy trình bảo mật; không sửa key trong source.

## 8. Capacity và retention

Free-hosting giới hạn:

- tối đa 30 ticket toàn hệ thống;
- tối đa 8 file cho một ticket;
- tối đa 4 file được chọn trong một lần phản hồi;
- tối đa 10 MB cộng dồn file trên một ticket.

Khi cần chỗ cho ticket mới, Backend chỉ loại ticket `resolved`/`closed` cũ nhất và dọn file liên quan. Nếu cả 30 ticket đều đang hoạt động, yêu cầu mới bị từ chối. Không xóa thủ công ticket đang hoạt động để giải phóng capacity.

## 9. Backup và restore

### Free-hosting

- Supabase Free không phải giải pháp backup doanh nghiệp.
- Xuất dữ liệu cần thiết theo quy trình được phê duyệt trước khi thay đổi lớn.
- Attachment private phải được đối soát cùng state; không chỉ sao chép một phía.

### NAS/SQL Server

Backup phải gồm:

- SQL Server database;
- Docker volume hoặc filesystem attachment/index;
- bản cấu hình không chứa secret trong kho backup công khai;
- bài kiểm thử restore trên môi trường tách biệt.

Không coi volume trên cùng một NAS là bản backup duy nhất.

## 10. Deploy Backend/Admin

1. Xác nhận PR đã merge và commit cần triển khai.
2. Kiểm tra release note, test và migration requirement.
3. Chọn đúng dịch vụ Render hiện có.
4. Deploy commit cụ thể; không deploy nhánh chưa merge.
5. Theo dõi build, health và promotion sang Live.
6. Kiểm tra `/health`, Admin asset và dữ liệu không bị mất.
7. Nếu là UI, kiểm tra desktop/mobile và hướng dẫn `Ctrl+F5` khi cache cũ.

`render.yaml` để auto deploy ở trạng thái off; deployment được chủ động kích hoạt theo quy trình release.

## 11. Deploy Mini App

Mini App chỉ deploy khi có yêu cầu phát hành riêng hoặc khi:

- source Mini App thay đổi;
- shared API contract thay đổi;
- public Backend URL thay đổi;
- metadata/app-config cần cập nhật.

Luồng chuẩn:

1. Chạy backend Production Pilot E2E gate.
2. Build Mini App với đúng `VITE_API_BASE_URL` HTTPS.
3. Deploy Testing bằng workflow GitHub Actions.
4. Kiểm thử E2E trên thiết bị thật.
5. Gửi Zalo xét duyệt.
6. Chỉ Publish sau khi được duyệt và có xác nhận của chủ dự án.

Version 33 hiện đã Live 100%; thay đổi tài liệu hoặc Backend-only không yêu cầu publish lại.

## 12. Incident và escalation

### Mức khẩn cấp

- Không đăng nhập được toàn hệ thống.
- Database hoặc attachment storage không sẵn sàng.
- Dữ liệu bị lộ, mất hoặc ghi sai diện rộng.
- Webhook bị giả mạo hoặc token/secret nghi bị lộ.
- Mini App Live không tạo/xem được ticket.

### Hành động đầu tiên

1. Ghi thời điểm, phạm vi và commit/version đang chạy.
2. Hạn chế thao tác ghi nếu nghi lỗi dữ liệu.
3. Giữ log/bằng chứng nhưng che credential và dữ liệu cá nhân.
4. Xác định lỗi ở Mini App, Backend, database, storage, AI hay Zalo.
5. Dùng rollback đã kiểm chứng; không reset database hoặc xóa dữ liệu theo phỏng đoán.

## 13. Checklist sau sự cố

- [ ] Dịch vụ trở lại HTTP `200` và đúng version.
- [ ] Ticket/message/attachment còn nhất quán.
- [ ] Webhook/Bot hoạt động nếu được bật.
- [ ] Không có credential xuất hiện trong log hoặc ticket.
- [ ] Regression test được bổ sung nếu lỗi có thể tái hiện.
- [ ] Tài liệu/runbook được cập nhật nếu cách xử lý thay đổi.

Xem thêm [Troubleshooting](../troubleshooting/README.md), [Security](../security/SECURITY_GUIDE.md) và [Deployment](../deployment/README.md).
