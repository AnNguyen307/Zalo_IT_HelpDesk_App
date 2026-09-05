# Changelog v5.5

> [!NOTE]
> Đây là hồ sơ phát hành lịch sử. Nội dung phản ánh hệ thống tại thời điểm phiên bản này được phát hành và có thể đã được bản mới thay thế. Khi vận hành hiện tại, xem [Trung tâm tài liệu](../../INDEX.md).


## Added

- Secure authenticated inline preview for image, PDF, TXT and CSV attachments.
- Unified reply endpoint: `POST /api/tickets/:ticketId/replies`.
- Reply composer attachments for Mini App and Admin Dashboard.
- `helpdesk.attachments.message_id` relation to `helpdesk.messages`.
- Inline attachment display under the related conversation message.
- Preview/download separation in both interfaces.
- `MAX_ATTACHMENTS_PER_REPLY` configuration.
- Attachment path containment hardening.
- Attachment v5.5 smoke test.

## Changed

- Backend and Mini App version to 5.5.0.
- Balanced typography in ticket workspace and mobile UI.
- Added `text-size-adjust: 100%` to prevent inconsistent iOS WebView text enlargement.
- `/health` now reports `responsive-typography`, `secure-attachment-preview`, and `reply-attachments`.

## Security decisions

- Preview is limited to MIME types that browsers can render without external conversion.
- Office documents and ZIP remain download-only.
- Preview requires normal ticket authorization.
- Preview response is private, no-store, sandboxed and protected by `nosniff`.
- Tokens are sent in Authorization headers, never query strings.
