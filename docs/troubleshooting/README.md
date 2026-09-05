# Xử lý sự cố

Chọn triệu chứng gần nhất, kiểm tra từ lớp ngoài vào trong và dừng trước mọi thao tác có thể làm mất dữ liệu. Khi cần log, luôn che password, token, cookie, database URL và dữ liệu cá nhân.

## Chẩn đoán nhanh

| Triệu chứng | Kiểm tra đầu tiên | Tài liệu liên quan |
|---|---|---|
| Admin không mở | `/health`, Render status, cache trình duyệt | [Runbook](../operations/OPERATIONS_RUNBOOK.md) |
| Không đăng nhập Admin | tài khoản, role, trạng thái khóa, rate limit | [User Guide](../guides/USER_GUIDE.md) |
| Mã mời không dùng được | định dạng, hết hạn, đã dùng/thu hồi | [User Guide](../guides/USER_GUIDE.md) |
| Mini App không gọi API | Backend URL, HTTPS, CORS, bundle version | [Deployment](../deployment/README.md) |
| Không tạo được ticket | auth, input, capacity 30 ticket, database | [Runbook](../operations/OPERATIONS_RUNBOOK.md) |
| Không tải được file | quyền ticket, private storage, budget 10 MB | [Security](../security/SECURITY_GUIDE.md) |
| AI không trả lời | provider readiness, Playbook, guardrail | [AI Agent](../components/README_AI_AGENT.md) |
| Bot không phản hồi | cold start, webhook registration, ticket đang mở | [Runbook](../operations/OPERATIONS_RUNBOOK.md) |
| SQL Server migration lỗi | schema hiện tại, quyền DDL, backup | [SQL schema hotfix](./README_SQL_SCHEMA_FIX.md) |

## 1. Health không trả HTTP 200

1. Xác nhận URL và môi trường đúng.
2. Với Render Free, chờ cold start rồi thử lại.
3. Kiểm tra build/deploy log và commit đang chạy.
4. Xác nhận container dùng Node.js phù hợp và command khởi động không lỗi.
5. Kiểm tra database connection và secret store.
6. Không redeploy liên tục nếu chưa biết lỗi; mỗi lần restart có thể che mất dấu vết ban đầu.

Nếu Backend local:

```powershell
cd .\backend
npm run check
npm start
```

## 2. Health trả 200 nhưng database chưa ready

- `DB_PROVIDER=postgres`: kiểm tra `POSTGRES_URL`, SSL mode và project Supabase không pause.
- `DB_PROVIDER=sqlserver`: chạy `npm run db:status`, kiểm tra host/port/certificate và application login.
- `DB_PROVIDER=json`: kiểm tra quyền ghi thư mục `backend/data`.

Không chạy migration cho tới khi biết schema hiện tại và có backup. Schema chuẩn hiện tại: SQL Server `10`, PostgreSQL state/governance `1/1`.

## 3. Admin hiển thị giao diện cũ hoặc lỗi bố cục

1. Xác nhận `/health` trả Backend `5.18.6`.
2. Nhấn `Ctrl+F5` trên desktop.
3. Trên điện thoại, đóng tab rồi mở lại hoặc xóa cache.
4. Kiểm tra asset HTML/CSS/JS thuộc cùng một deploy.
5. Tái hiện ở các viewport `360`, `390`, `430` px và desktop trước khi sửa.

Nếu menu tài khoản bị che, kiểm tra stacking context/z-index và trạng thái header khi menu mở; không chỉ tăng z-index trên menu con nếu parent tạo stacking context thấp hơn.

## 4. Không đăng nhập được Admin

- Kiểm tra Caps Lock và tên đăng nhập.
- Xác nhận tài khoản không bị khóa.
- Kiểm tra role hợp lệ: `admin`, `technician`, `viewer`.
- Chờ hết rate-limit window nếu thử sai nhiều lần.
- Kiểm tra giờ hệ thống nếu token vừa cấp đã bị coi là hết hạn.
- Không gửi password qua chat để nhờ kiểm tra.

## 5. Mã mời không hợp lệ

- Mã gồm 12 ký tự chữ/số, hiển thị `XXXX-XXXX-XXXX`.
- Mã chỉ dùng một lần và mặc định hết hạn sau 24 giờ.
- Nhập lại không phân biệt chữ hoa/thường; ứng dụng tự định dạng dấu gạch.
- Nếu đã dùng, hết hạn hoặc bị thu hồi, Admin phải tạo mã mới.
- Nếu mất thiết bị, thu hồi session cũ trước khi cấp mã mới.

## 6. Mini App không kết nối Backend

1. Mở public Backend `/health` bằng thiết bị thật.
2. Xác nhận URL bắt đầu bằng `https://`.
3. Kiểm tra `VITE_API_BASE_URL` tại thời điểm build; Vite nhúng URL vào bundle.
4. Kiểm tra `ALLOWED_ORIGINS` có origin Zalo cần thiết.
5. Xác nhận đang mở đúng Mini App Production version 33 hoặc đúng Testing version cần thử.

Đổi Backend URL luôn yêu cầu build và deploy lại Mini App.

## 7. Không tạo được ticket

Kiểm tra:

- access token/session còn hiệu lực;
- tiêu đề ít nhất 4 ký tự;
- mô tả ít nhất 10 ký tự và không quá 5000;
- không vượt 8 file hoặc 10 MB/ticket;
- database ready;
- hệ thống chưa có 30 ticket đều ở trạng thái hoạt động.

Nếu capacity đầy, xử lý/đóng ticket hợp lệ theo quy trình. Không xóa state hoặc file trực tiếp.

## 8. File upload/download lỗi

- Một lần phản hồi chọn tối đa 4 file và không vượt 8 file/ticket.
- Tổng dung lượng cộng dồn tối đa 10 MB.
- Kiểm tra định dạng được hỗ trợ.
- Kiểm tra Supabase bucket là private và Backend có secret key đúng.
- Kiểm tra attachment record và object cùng tồn tại.
- Không chuyển bucket thành public để sửa nhanh lỗi tải file.

## 9. AI provider không sẵn sàng

1. Mở **Hệ thống & AI** hoặc `/health`.
2. Kiểm tra provider đã bật, có key và không ở trạng thái circuit open.
3. `quota: unknown` không có nghĩa là hết quota.
4. Kiểm tra timeout, `429`, `5xx`, JSON/schema và confidence.
5. Xác nhận router thử provider còn lại.
6. Tắt cloud provider trong môi trường test và xác nhận Rules fallback vẫn tạo ticket.

Không đổi model/provider bằng giá trị ngoài allowlist và không ghi key vào source.

## 10. Playbook không được tìm thấy hoặc không áp dụng

- Xác nhận procedure là `Published + Active`.
- Kiểm tra audience đúng `employee` nếu dùng cho nhân viên.
- Kiểm tra keyword/category/risk và score threshold.
- Chạy `npm run playbook:benchmark` khi thay đổi retrieval/source.
- Re-index sau publish nếu auto reindex không thành công.
- Với hybrid lỗi embedding, xác nhận lexical fallback vẫn hoạt động.

Không hạ threshold tùy tiện để ép mọi ticket khớp Playbook.

## 11. Zalo Bot không phản hồi

1. Đánh thức Render bằng `/health`.
2. Kiểm tra `bot.enabled` và `bot.configured`.
3. Kiểm tra `webhookRegistration.ok` sau thời gian delay đăng ký.
4. Xác nhận đang gửi tin nhắn riêng dạng text.
5. Nếu có ticket đang hoạt động, kiểm tra tin nhắn đã được thêm vào ticket đó.
6. Gửi một tin mới sau khi Backend ready.

Nếu webhook vẫn lỗi, rotate secret/token chỉ khi có bằng chứng credential không hợp lệ hoặc bị lộ.

## 12. SQL Server schema lỗi

1. Sao lưu database.
2. Chạy `npm run db:status`.
3. Đối chiếu migration còn thiếu; schema mục tiêu hiện tại là `10`.
4. Chỉ chạy `npm run db:migrate` nếu đúng môi trường và release yêu cầu.
5. Nếu lỗi quyền tạo schema/ownership, xem [SQL Server schema hotfix](./README_SQL_SCHEMA_FIX.md).
6. Chạy lại `db:status` và smoke test trước khi mở traffic.

Không import JSON với `--force` trừ khi có kế hoạch migration dữ liệu rõ ràng và bản backup đã kiểm thử.

## 13. Cần thu thập gì khi báo lỗi

- thời điểm và múi giờ;
- môi trường/profile;
- commit, Backend version, Mini App version;
- endpoint và HTTP status;
- bước tái hiện tối thiểu;
- mã ticket đã ẩn thông tin không cần thiết;
- log đã redaction;
- kết quả mong đợi và thực tế.

Không gửi password, token, cookie, `.env`, database URL, ảnh có OTP hoặc dữ liệu cá nhân.
