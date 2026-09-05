# Lịch sử phát hành

Thư mục này lưu changelog, upgrade guide và checklist của từng phiên bản. Đây là hồ sơ lịch sử để truy vết quyết định; hướng dẫn vận hành hiện hành nằm tại [Trung tâm tài liệu](../INDEX.md).

## Cách đọc

- `CHANGES_*`: kết quả và phạm vi của release.
- `UPGRADE_*`: thao tác nâng cấp tại thời điểm release đó.
- Checklist/compliance: bằng chứng sẵn sàng hoặc yêu cầu xét duyệt.
- Không ghép lệnh của nhiều upgrade guide cũ để nâng thẳng lên bản hiện tại.
- Trước mọi migration, đọc release note đích và kiểm tra schema thực tế.

## Trạng thái hiện tại

| Thành phần | Phiên bản |
|---|---|
| Backend/Admin | `5.18.6` |
| Mini App source | `5.17.2` |
| Mini App Production | Zalo version `33`, Live 100% |
| SQL Server schema | `10` |
| PostgreSQL state/governance | `1/1` |

## v5.18 — Zalo Bot và hoàn thiện Admin

- `v5.18.6` — [Official App Identity](./v5.18.6/CHANGES_V5_18_6_OFFICIAL_APP_IDENTITY.md)
- `v5.18.5` — [Login Copy and Focus Polish](./v5.18.5/CHANGES_V5_18_5_LOGIN_POLISH.md)
- `v5.18.4` — [Admin Login Experience](./v5.18.4/CHANGES_V5_18_4_ADMIN_LOGIN.md)
- `v5.18.3` — [Account Menu Layer](./v5.18.3/CHANGES_V5_18_3_ACCOUNT_MENU_LAYER.md)
- `v5.18.2` — [Admin Mobile Responsive](./v5.18.2/CHANGES_V5_18_2_ADMIN_MOBILE_RESPONSIVE.md)
- `v5.18.1` — [Zalo Bot Webhook Bootstrap](./v5.18.1/CHANGES_V5_18_1_ZALO_BOT_WEBHOOK_BOOTSTRAP.md)
- `v5.18.0` — [Zalo Bot Assistant](./v5.18.0/CHANGES_V5_18_0_ZALO_BOT_ASSISTANT.md)

## v5.17 — Production Pilot và PostgreSQL Governance

- `v5.17.1` — [Production Pilot Readiness](./v5.17.1/CHANGES_V5_17_1_PRODUCTION_PILOT.md)
- `v5.17.1` — [Production Pilot Checklist](./v5.17.1/PRODUCTION_PILOT_CHECKLIST.md)
- `v5.17.1` — [Zalo Production Compliance](./v5.17.1/ZALO_PRODUCTION_COMPLIANCE.md)
- `v5.17.0` — [PostgreSQL Playbook Governance](./v5.17.0/CHANGES_V5_17_0_POSTGRES_PLAYBOOK_GOVERNANCE.md)

## v5.16 — Xác thực, quản trị và UI

- `v5.16.9` — [Adaptive Admin Sidebar](./v5.16.9/CHANGES_V5_16_9_ADAPTIVE_ADMIN_SIDEBAR.md)
- `v5.16.8` — [Compact Account Menu](./v5.16.8/CHANGES_V5_16_8_COMPACT_ACCOUNT_MENU.md)
- `v5.16.7` — [Overview Banner Fit](./v5.16.7/CHANGES_V5_16_7_OVERVIEW_BANNER_FIT.md)
- `v5.16.6` — [Mini App Dependency Security](./v5.16.6/CHANGES_V5_16_6_MINIAPP_DEPENDENCY_SECURITY.md)
- `v5.16.5` — [Functional Admin UI](./v5.16.5/CHANGES_V5_16_5_FUNCTIONAL_ADMIN_UI.md)
- `v5.16.4` — [Cloud AI Reliability](./v5.16.4/CHANGES_V5_16_4_AI_RELIABILITY.md)
- `v5.16.3` — [Admin Visual Refresh](./v5.16.3/CHANGES_V5_16_3_ADMIN_VISUAL_REFRESH.md)
- `v5.16.2` — [Staff Governance UI](./v5.16.2/CHANGES_V5_16_2_STAFF_GOVERNANCE_UI.md)
- `v5.16.1` — [Invite Access UI](./v5.16.1/CHANGES_V5_16_1_INVITE_ACCESS_UI.md)
- `v5.16.0` — [One-Time Invites](./v5.16.0/CHANGES_V5_16_0_ONE_TIME_INVITES.md) · [Upgrade](./v5.16.0/UPGRADE_V5_16_0_ONE_TIME_INVITES.md)

## v5.15 — Deployment và storage

- `v5.15.2` — [Zalo Auth Profile Fields](./v5.15.2/CHANGES_V5_15_2_ZALO_AUTH_PROFILE_FIELDS.md)
- `v5.15.1` — [Storage Retention](./v5.15.1/CHANGES_V5_15_1_STORAGE_RETENTION.md) · [Upgrade](./v5.15.1/UPGRADE_V5_15_1_STORAGE_RETENTION.md)
- `v5.15.0` — [Deployment Foundation](./v5.15.0/CHANGES_V5_15_0_DEPLOYMENT_FOUNDATION.md) · [Upgrade](./v5.15.0/UPGRADE_V5_15_0_DEPLOYMENT_FOUNDATION.md)

## v5.14 — Design system

- `v5.14.1` — [Client Home Readability](./v5.14.1/CHANGES_V5_14_1_CLIENT_HOME_READABILITY.md)
- `v5.14.0` — [Warm Industrial + Signal UI](./v5.14.0/CHANGES_V5_14_0_WARM_INDUSTRIAL_SIGNAL_UI.md) · [Upgrade](./v5.14.0/UPGRADE_V5_14_0_WARM_INDUSTRIAL_SIGNAL_UI.md)

## v5.13–v5.8 — AI Router, Copilot và Quality

- `v5.13.0` — [Provider Quota Observability](./v5.13.0/CHANGES_V5_13_0_PROVIDER_QUOTA_OBSERVABILITY.md) · [Upgrade](./v5.13.0/UPGRADE_V5_13_0_PROVIDER_QUOTA_OBSERVABILITY.md)
- `v5.12.0` — [Copilot Independent Reasoning](./v5.12.0/CHANGES_V5_12_0_COPILOT_INDEPENDENT_REASONING.md) · [Upgrade](./v5.12.0/UPGRADE_V5_12_0_COPILOT_INDEPENDENT_REASONING.md)
- `v5.11.0` — [Copilot Model Selection](./v5.11.0/CHANGES_V5_11_0_COPILOT_MODEL_SELECTION.md) · [Upgrade](./v5.11.0/UPGRADE_V5_11_0_COPILOT_MODEL_SELECTION.md)
- `v5.10.0` — [Staff AI Copilot](./v5.10.0/CHANGES_V5_10_0_STAFF_AI_COPILOT.md) · [Upgrade](./v5.10.0/UPGRADE_V5_10_0_STAFF_AI_COPILOT.md)
- `v5.9.1` — [Remove Local AI](./v5.9.1/CHANGES_V5_9_1_REMOVE_LOCAL_AI.md)
- `v5.9.0` — [AI Router V2](./v5.9.0/CHANGES_V5_9_0_AI_ROUTER_V2.md)
- `v5.8.0` — [AI Quality Control](./v5.8.0/CHANGES_V5_8_0_AI_QUALITY_CONTROL.md)

## v5.7 — Operations và Staff

- `v5.7.4` — [Admin Sidebar Clarity](./v5.7.4/CHANGES_V5_7_4_ADMIN_SIDEBAR.md)
- `v5.7.3` — [AI Priority Classification](./v5.7.3/CHANGES_V5_7_3_AI_PRIORITY_CLASSIFICATION.md)
- `v5.7.2` — [Admin Ticket Scroll](./v5.7.2/CHANGES_V5_7_2_ADMIN_TICKET_SCROLL.md)
- `v5.7.1` — [Staff Account Reliability](./v5.7.1/CHANGES_V5_7_1_STAFF_ACCOUNT_RELIABILITY.md)
- `v5.7` — [Operations](./v5.7/CHANGES_V5_7_OPERATIONS.md) · [Upgrade](./v5.7/UPGRADE_V5_7_OPERATIONS.md)

## v5.6–v5.2 — Ticket, file, database và guardrail

- `v5.6.0` — [Human Handoff Lock](./v5.6.0/CHANGES_V5_6_0_HUMAN_HANDOFF_LOCK.md) · [Upgrade](./v5.6.0/UPGRADE_V5_6_0_HUMAN_HANDOFF_LOCK.md)
- `v5.5.2` — [30 MB Upload Limit](./v5.5.2.30/CHANGES_V5_5_2_30MB_UPLOAD_LIMIT.md) · [Upgrade](./v5.5.2.30/UPGRADE_V5_5_2_30MB_UPLOAD_LIMIT.md)
- `v5.5.1` — [Large Attachment Streaming](./v5.5.1/CHANGES_V5_5_1_LARGE_UPLOADS.md) · [Upgrade](./v5.5.1/UPGRADE_V5_5_1_LARGE_UPLOADS.md)
- `v5.5` — [UI Attachments](./v5.5/CHANGES_V5_5_UI_ATTACHMENTS.md) · [Upgrade](./v5.5/UPGRADE_V5_5_UI_ATTACHMENTS.md)
- `v5.4` — [Playbook Lifecycle](./v5.4/CHANGES_V5_4_PLAYBOOK_LIFECYCLE.md) · [Upgrade](./v5.4/UPGRADE_V5_4_PLAYBOOK_LIFECYCLE.md)
- `v5.3` — [SQL Server](./v5.3/CHANGES_V5_3_SQL_SERVER.md) · [Upgrade](./v5.3/UPGRADE_V5_3_SQL_SERVER.md)
- `v5.2` — [Strict Escalation UI](./v5.2/CHANGES_V5_2_STRICT_ESCALATION_UI.md) · [Upgrade](./v5.2/UPGRADE_V5_2_STRICT_ESCALATION_UI.md)

## v5, v4, v3 và Zero-Cost legacy

- `v5` — [Enterprise Playbook](./v5/CHANGES_V5_ENTERPRISE_PLAYBOOK.md) · [Upgrade](./v5/UPGRADE_V5_ENTERPRISE_PLAYBOOK.md)
- `v4` — [AI HelpDesk Agent](./v4/CHANGES_V4_AI_AGENT.md)
- `v3` — [Changes](./v3/CHANGES_V3.md) · [Upgrade](./v3/UPGRADE_V3.md)
- `v2/legacy` — [Zero-Cost Edition](./legacy-zero-cost/CHANGES_ZERO_COST.md)

## Quy tắc bảo trì release note

1. Mỗi release mới đặt tại `docs/releases/<version>/`.
2. Changelog phải có outcome, impact, validation và rollback.
3. Upgrade guide chỉ được tạo khi có thao tác nâng cấp thực tế.
4. Ghi rõ version Backend/Mini App, schema và yêu cầu deploy.
5. Sau khi release cũ, giữ nguyên dữ kiện lịch sử; chỉ thêm đính chính hoặc liên kết tới nguồn hiện hành khi cần.
