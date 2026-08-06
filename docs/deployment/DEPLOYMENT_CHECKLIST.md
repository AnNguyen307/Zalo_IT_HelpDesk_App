# Deployment Checklist — Zero-Cost Edition

## Mục tiêu chi phí

- [ ] Không có OpenAI/API AI key trong `.env`.
- [ ] Không thuê cloud VM hoặc managed database mới.
- [ ] Không dùng notification OA/SMS/email trả phí.
- [ ] Backend chạy trên PC/NAS/server doanh nghiệp đã có.
- [ ] Xác nhận rõ chi phí còn lại: điện, Internet, vận hành và domain hiện hữu.

## Backend nội bộ

- [ ] Cài Node.js 20+.
- [ ] Copy `backend/.env.example` thành `backend/.env`.
- [ ] Đổi `APP_SECRET` thành chuỗi ngẫu nhiên dài.
- [ ] Đổi `ADMIN_PASSWORD`.
- [ ] Đặt `AGENT_MODE=rules` cho cấu hình nhẹ nhất.
- [ ] Chạy `npm run check` và `npm test`.
- [ ] Chạy backend dưới user không có quyền admin hệ điều hành nếu có thể.
- [ ] Tắt Sleep trên máy backend trong thời gian phục vụ.
- [ ] Không mở trực tiếp port 8080 trên Internet.

## HTTPS

### Pilot

- [ ] Cài `cloudflared`.
- [ ] Chạy Quick Tunnel tới `http://localhost:8080`.
- [ ] Ghi nhận URL Quick Tunnel là tạm thời.
- [ ] Không coi Quick Tunnel là production có SLA.

### Dùng ổn định

- [ ] Dùng domain/subdomain doanh nghiệp đang sở hữu.
- [ ] Tạo named tunnel hoặc reverse proxy HTTPS hiện có.
- [ ] Chỉ expose backend qua HTTPS.
- [ ] Hạn chế dashboard `/admin` bằng IP/VPN/Access nếu hạ tầng cho phép.

## Zalo Mini App

- [ ] Tạo hoặc chọn Zalo Mini App ID.
- [ ] Liên kết project bằng `zmp init`.
- [ ] Đặt `VITE_API_BASE_URL=https://...`.
- [ ] Build thành công.
- [ ] Deploy Development và kiểm thử trên điện thoại thật.
- [ ] Test khi người dùng từ chối quyền tên/ảnh.
- [ ] Không publish khi còn `ZALO_AUTH_MODE=development` trên public backend.

## Xác thực production

- [ ] Đặt `ZALO_AUTH_MODE=remote`.
- [ ] Cấu hình `ZALO_TOKEN_VERIFY_URL`.
- [ ] Verifier không tin `userId` do client gửi nếu chưa xác minh.
- [ ] Log không chứa access token, mật khẩu hoặc OTP.
- [ ] CORS chỉ chứa origin cần thiết.

## Local Agent

- [ ] IT senior review toàn bộ Knowledge Base.
- [ ] Chỉ bật `autoEligible` cho quy trình rủi ro thấp, có thể hoàn tác.
- [ ] Account, security, data loss, BSOD, hardware và infrastructure luôn escalation.
- [ ] Không cho model tự tạo command hoặc checklist kỹ thuật.
- [ ] Kiểm tra confidence threshold bằng ticket thực tế.

## Ollama tùy chọn

- [ ] Chỉ bật khi máy đủ tài nguyên.
- [ ] Model đã được tải cục bộ.
- [ ] Ollama chỉ listen localhost hoặc mạng tin cậy.
- [ ] Tắt Ollama để kiểm thử fallback rules.
- [ ] Không xem Ollama là dependency bắt buộc.

## Dữ liệu và backup

- [ ] Chạy `backup-data` thủ công thành công.
- [ ] Lên lịch backup hằng ngày.
- [ ] Lưu ít nhất một bản ở ổ đĩa/máy khác.
- [ ] Kiểm thử restore bằng cách copy file backup về `backend/data/db.json` khi backend đã dừng.
- [ ] Giới hạn quyền đọc `backend/data` và `backups`.

## Pilot nội bộ

- [ ] 10–30 người dùng thử từ nhiều phòng ban.
- [ ] Có kỹ thuật viên nhận ticket escalation.
- [ ] Theo dõi tỷ lệ tự xử lý, first response, reopen và lỗi phân loại.
- [ ] Review Knowledge Base hàng tuần.
- [ ] Chỉ mở rộng khi backend PC, tunnel và backup ổn định.
