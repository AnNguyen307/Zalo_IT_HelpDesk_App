# v5.14.1 — Client Home readability patch

> [!NOTE]
> Đây là hồ sơ phát hành lịch sử. Nội dung phản ánh hệ thống tại thời điểm phiên bản này được phát hành và có thể đã được bản mới thay thế. Khi vận hành hiện tại, xem [Trung tâm tài liệu](../../INDEX.md).


## Outcome

The Zalo Client home hero now remains readable and collision-free on narrow Mini App viewports while preserving the Warm Industrial + Signal direction.

## Changes

- Replaced the competing inline greeting, service plate and absolutely positioned service badge with a responsive greeting/status row.
- Raised the hero heading, greeting, description and secondary-action contrast on the graphite surface.
- Removed the empty visual grid row when the support image is hidden on mobile.
- Stacked both primary actions at mobile widths and made each action full-width.
- Replaced the dark trust strip with two balanced, wrapping commitment cells.
- Preserved the desktop support visual, navigation, ticket behavior and API contracts.

## Release scope

- Mini App component version: `5.14.1`.
- Backend remains `5.14.0` because no server behavior changed.
- Database schema remains `9`; no migration is required.
- A new Mini App build and Zalo deployment are required after UI approval and merge.

## Verification

- Responsive structure regression test: passed.
- Backend syntax: passed.
- Backend test suite: 90/90 passed.
- Mini App production build: passed.
- Hero text contrast on graphite: 10.19:1 to 16.10:1 (WCAG AA text threshold: 4.5:1).
- Generated asset references in `app-config.json`: verified.
- Secret scan: passed.

## Review state

UI/UX was approved by the project owner and merged through PR #19. Zalo Mini App deployment is still required before the new Client home appears in the Zalo app.
