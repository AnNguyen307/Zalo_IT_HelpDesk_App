# v5.16.6 — Mini App Dependency Security

## Kết quả

Mini App loại bỏ toàn bộ dependency advisory mức **high** đang có ở v5.16.5 mà không thay đổi giao diện, API hoặc luồng xác thực.

## Thay đổi chính

- Nâng Vite từ `5.4.21` lên `6.4.3` để nhận các bản vá cho dev server và dependency build.
- Nâng esbuild gián tiếp từ `0.21.5` lên `0.25.12`.
- Nâng Nano ID gián tiếp từ `3.3.17` lên `3.3.18`.
- Nâng ZMP SDK từ `2.52.2` lên bản hiện hành `2.53.0`.
- Đồng bộ Mini App metadata và asset manifest ở `5.16.6`.

## Kết quả audit

- Trước thay đổi: 5 advisory — 2 high, 3 moderate.
- Sau thay đổi: 2 advisory moderate, 0 high, 0 critical.
- Hai mục moderate còn lại cùng xuất phát từ `@sentry/browser` do ZMP SDK `2.53.0` khai báo. ZMP SDK hiện hành vẫn yêu cầu Sentry 6.x, trong khi bản vá của [GHSA-593m-55hh-j8gv](https://github.com/advisories/GHSA-593m-55hh-j8gv) nằm ở Sentry 7.119.1 trở lên.
- Không ép `overrides` sang Sentry major không tương thích và không hạ ZMP SDK về `2.9.4`, vì hai cách đó có thể làm hỏng SDK/runtime nhưng không phải bản nâng cấp do nhà cung cấp phát hành.

## An toàn và tương thích

- Không đổi source React/TypeScript, UI, API base URL hoặc quyền Zalo.
- Backend/Admin vẫn ở `5.16.5`; Mini App source ở `5.16.6`.
- SQL Server/NAS schema `10`; PostgreSQL state schema `1`.
- Không có database migration và không cần deploy lại Render.
- Cần build và publish Zalo Mini App v5.16.6 để phát hành dependency bundle mới.

## Validation

- Backend syntax: đạt.
- Backend regression: **125/125 test đạt**.
- Playbook benchmark: Hit@1 `0.90`, Hit@5 `1.00`, MRR `0.95`.
- Mini App TypeScript + Vite 6.4.3 production build: đạt.
- `npm audit`: 0 high, 0 critical; 2 moderate cùng thuộc vendor dependency ZMP SDK/Sentry.
- Credential scan và `git diff --check`: đạt.

## Rollback

Khôi phục `miniapp/package.json`, `miniapp/package-lock.json` và `miniapp/app-config.json` từ v5.16.5, sau đó build/publish lại Mini App. Không thao tác database hoặc Render.
