# v5.16.3 — Admin Visual Refresh

Ngày phát hành: 2026-08-21

Phạm vi: Backend/Admin UI

Mini App: giữ nguyên `5.16.0`

## Kết quả

- Thay toàn bộ khung “Vận hành có kiểm soát” bằng banner tín hiệu động, dùng dữ liệu thật của AI Agent, Playbook và SLA.
- Tổ chức lại tab Playbook thành bốn vùng dễ quét: command deck, readiness, form tra cứu và danh sách kết quả xếp hạng.
- Tổ chức lại Hệ thống & AI theo thứ tự vận hành: runtime/provider readiness, chất lượng quyết định và sandbox kiểm thử.
- Loại bỏ các khối “Nguyên tắc an toàn”, “Nguyên tắc” và “Chuyển đổi tài khoản an toàn” khỏi giao diện.
- Giữ nguyên toàn bộ API, phân quyền, strict escalation, provider routing và nghiệp vụ ticket/Playbook.

## Trợ năng và responsive

- Chuyển động banner chỉ dùng CSS, không tải thêm ảnh hoặc thư viện ngoài.
- Tự tắt animation khi hệ điều hành bật `prefers-reduced-motion`.
- Các workspace tự chuyển về một cột trên tablet/mobile; các chỉ số co từ 5/4 cột xuống 2/1 cột.
- Trạng thái không phụ thuộc màu đơn lẻ: luôn có nhãn chữ và đường tín hiệu.

## Phiên bản và dữ liệu

- Backend/Admin: `5.16.3`
- Mini App: `5.16.0`
- SQL Server/NAS schema: `10`
- PostgreSQL free-hosting state schema: `1`
- Không có migration. Không chạy `npm run db:migrate`.
- Không cần build hoặc deploy lại Zalo Mini App.

## Validation

- JavaScript syntax: direct `node --check` across `src`, `scripts` and `public` (the equivalent `npm run check` wrapper was blocked by the workspace command-approval transport).
- Backend regression: `node --test test/*.test.mjs`
- Regression UI v5.16.3 kiểm tra cấu trúc mới, trạng thái runtime, cache bust, responsive motion fallback và việc loại bỏ các khối cũ.
- Credential scan trên diff phát hành.

## Triển khai và rollback

Render giữ `autoDeployTrigger: off`; deploy Backend/Admin được kích hoạt thủ công sau khi merge. Xác minh `/health` trả `5.16.3` và có các feature `live-operations-banner`, `playbook-admin-workspace`, `ai-control-workspace`.

Rollback bằng cách redeploy merge commit v5.16.2. Vì release chỉ thay đổi Admin UI và metadata, rollback không cần thao tác database hay dữ liệu người dùng.
