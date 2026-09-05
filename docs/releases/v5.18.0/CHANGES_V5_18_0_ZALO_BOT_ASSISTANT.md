# v5.18.0 — Zalo Bot Assistant

> [!NOTE]
> Đây là hồ sơ phát hành lịch sử. Nội dung phản ánh hệ thống tại thời điểm phiên bản này được phát hành và có thể đã được bản mới thay thế. Khi vận hành hiện tại, xem [Trung tâm tài liệu](../../INDEX.md).


## Outcome

Backend v5.18.0 adds an optional Zalo Bot channel without changing the Mini App bundle that is under Production review.

- Public Bot webhook: `POST /api/webhooks/zalo-bot`.
- Verification header: `X-Bot-Api-Secret-Token`, compared in constant time with `ZALO_BOT_WEBHOOK_SECRET`.
- Parser accepts the official `{ ok, result }` envelope; the signed `testWebhook` probe receives a successful 2xx response.
- Durable inbox: every accepted message is persisted before HTTP `202`; duplicate `message_id` events do not create another ticket or response.
- Private text chat pilot: Bot reads `message.text.received` events and uses `chat.id` for replies.
- Non-text, Bot-authored and group events are recorded and ignored without generating a HelpDesk response.
- Playbook-first self-service: a Published + Active employee Playbook remains the preferred source.
- Generative fallback: when no Playbook matches, cloud AI may provide reversible IT guidance for the current mock-data pilot.
- Human escalation: users may request a ticket at any time; the Bot automatically creates one after an unresolved reply, an unsafe/low-confidence analysis, an unavailable provider, or the configured self-service attempt limit.
- Conversation continuity: messages received after escalation are appended to the same active ticket rather than creating duplicates.
- Source traceability: Bot-created tickets include `Nguồn: Zalo Chat Bot` in the description and `channel=zalo_bot` in audit metadata.

## Safety boundaries

- The generative path must not request passwords, OTPs or secrets; disable security controls; recommend cracks; format storage; or delete data.
- High-risk, privileged, physical, security and data-loss scenarios are sent directly to HelpDesk.
- Suggestions outside Playbook are labeled `Gợi ý AI thử nghiệm`.
- Bot Token and webhook secret are backend-only secrets and must never be committed, logged, placed in screenshots, or shipped to Mini App/Admin frontend.
- The Mini App consent webhook remains `/api/webhooks/zalo`; its Open API key and signature scheme are not reused by the Bot webhook.

## Render configuration

The merged release is safe to deploy with the Bot disabled:

```text
ZALO_BOT_ENABLED=false
```

After creating `Bot IT HelpDesk` in Zalo Bot Manager, configure these values directly in Render:

```text
ZALO_BOT_TOKEN=<Bot Token from Zalo Bot Manager>
ZALO_BOT_WEBHOOK_SECRET=<private random value, 8-256 characters>
ZALO_BOT_GENERATIVE_FALLBACK=true
ZALO_BOT_GENERATIVE_MIN_CONFIDENCE=0.55
ZALO_BOT_MAX_SELF_SERVICE_ATTEMPTS=3
ZALO_BOT_ENABLED=true
```

Then register the public webhook through the official Bot `setWebhook` API using:

```text
https://zalo-it-helpdesk-pilot.onrender.com/api/webhooks/zalo-bot
```

Use the same private secret in the `secret_token` field. Do not paste the Bot Token or secret into a GitHub issue, PR, commit, chat message, Mini App source or public documentation.

## Health and verification

`GET /health` reports Backend version `5.18.0`, a public `bot` status object, and these features:

- `zalo-bot-assistant`
- `zalo-bot-durable-inbox`
- `zalo-bot-generative-fallback`
- `zalo-bot-auto-ticket-on-failure`

Regression coverage in `backend/test/zalo-bot-v518.test.mjs` verifies:

- event normalization and constant-time secret comparison;
- invalid secret rejection;
- fast durable webhook acceptance;
- generative guidance when no Playbook matches;
- automatic ticket creation after the user reports failure;
- duplicate webhook suppression;
- follow-up messages appended to the same active ticket.

## Deployment impact

- Backend/Admin Render deployment: required.
- Zalo Bot activation: not automatic; requires Bot Token, webhook secret and `setWebhook` after this release is healthy.
- Mini App build/deployment: not required; Mini App source remains v5.17.1 and its Production review bundle is unchanged.
- PostgreSQL state schema: remains `1`.
- PostgreSQL Playbook Governance schema: remains `1`.
- SQL Server schema: remains `10`.
- Database migration: not required. Bot conversation/inbox state uses the existing audit JSON and normal ticket/message records.

## Rollback

Set `ZALO_BOT_ENABLED=false` to stop Bot intake without affecting Mini App or existing tickets. If a full rollback is required, redeploy the v5.17.1 merge commit. Do not delete PostgreSQL state, rotate unrelated Mini App secrets, or remove existing Bot-created tickets during rollback.
