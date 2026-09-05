# v5.18.2 — Admin Mobile Responsive

> [!NOTE]
> Đây là hồ sơ phát hành lịch sử. Nội dung phản ánh hệ thống tại thời điểm phiên bản này được phát hành và có thể đã được bản mới thay thế. Khi vận hành hiện tại, xem [Trung tâm tài liệu](../../INDEX.md).


## Outcome

IT HelpDesk Control Center now adapts to phone viewports without horizontal page overflow or a misplaced navigation sidebar.

- The Admin sidebar becomes a fixed, horizontally scrollable bottom taskbar on screens up to `680px`, including safe-area padding for phones with a home indicator.
- The selected task is automatically scrolled into view after navigation or viewport changes.
- The header, account menu, filters, statistics, reports and settings collapse into phone-friendly layouts with touch targets of at least 44px.
- The ticket list changes from a wide desktop table into readable ticket cards instead of forcing the entire page to scroll sideways.
- Ticket and settings dialogs use the full phone viewport; the duplicate queue column is hidden inside the ticket workspace so the conversation and dispatch controls remain usable.
- Form controls use a mobile-safe font size to avoid unwanted browser zoom while editing.

## Root cause

A legacy `max-width: 760px` rule changed the sidebar to `position: static`. Later mobile navigation rules styled it as a bottom taskbar but did not restore fixed positioning, so the old rule continued to win. The desktop ticket table also retained its wide minimum width on phones.

The v5.18.2 phone-first override is deliberately last in the stylesheet so it retires those conflicting legacy declarations without changing desktop behavior.

## Validation

- `npm run check`
- `npm test`
- Responsive regression coverage verifies the final cascade order, fixed bottom navigation, safe-area padding, ticket-card transformation, full-viewport dialogs and active-tab visibility behavior.
- Runtime health must return version `5.18.2` and feature `admin-mobile-responsive-v5182`.
- Credential scan of the intended diff.

## Deployment impact

- Backend/Admin Render deployment: required.
- Mini App build/deployment: not required; source remains v5.17.1.
- PostgreSQL state schema: remains `1`.
- PostgreSQL Playbook Governance schema: remains `1`.
- SQL Server schema: remains `10`.
- Database migration: not required.

## Rollback

Redeploy the previous Backend/Admin v5.18.1 commit. No database or Mini App rollback is needed because this release only changes Admin presentation, cache-busting metadata and runtime version metadata.
