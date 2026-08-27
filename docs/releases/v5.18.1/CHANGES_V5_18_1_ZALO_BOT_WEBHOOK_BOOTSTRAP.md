# v5.18.1 — Zalo Bot Webhook Bootstrap

## Outcome

Backend v5.18.1 can register the signed Zalo Bot webhook automatically after startup. This allows the Render Free pilot to activate the Bot without paid Shell or One-Off Job access.

- `setWebhook` uses `ZALO_BOT_TOKEN` only in the backend request URL.
- The JSON request sends the public `ZALO_BOT_WEBHOOK_URL` and the same private `ZALO_BOT_WEBHOOK_SECRET` expected in `X-Bot-Api-Secret-Token`.
- Registration waits for `ZALO_BOT_WEBHOOK_REGISTER_DELAY_MS` so a zero-downtime deploy can promote the new instance before Zalo probes the public endpoint.
- `/health` and `GET /api/webhooks/zalo-bot` expose only sanitized registration status; token, secret and raw API response are never returned or logged.
- A failed registration does not stop the HelpDesk service. The failure is visible in health metadata and a later deploy can retry safely.

## Render activation

Keep the Bot disabled until the token and secret have been stored. Then configure:

```text
ZALO_BOT_TOKEN=<secret from Zalo Bot Manager>
ZALO_BOT_WEBHOOK_SECRET=<random private value, 8-256 characters>
ZALO_BOT_WEBHOOK_URL=https://zalo-it-helpdesk-pilot.onrender.com/api/webhooks/zalo-bot
ZALO_BOT_WEBHOOK_REGISTER_DELAY_MS=15000
ZALO_BOT_AUTO_REGISTER_WEBHOOK=true
ZALO_BOT_ENABLED=true
```

Saving and deploying these values makes the backend call the official Zalo Bot `setWebhook` endpoint once after startup. Do not paste the Bot Token or webhook secret into GitHub, chat, screenshots, logs, Mini App source or frontend code.

## Validation

- `npm run check`
- `npm test`
- Credential scan of the intended diff
- Deployed `/health`: version `5.18.1`, feature `zalo-bot-webhook-auto-registration`, `bot.enabled=true`, `bot.configured=true`, and `bot.webhookRegistration.ok=true`
- Send a private text message to Bot IT HelpDesk and confirm a reply or HelpDesk ticket escalation.

## Deployment impact

- Backend/Admin Render deployment: required.
- Mini App build/deployment: not required; source remains v5.17.1.
- PostgreSQL state schema: remains `1`.
- PostgreSQL Playbook Governance schema: remains `1`.
- SQL Server schema: remains `10`.
- Database migration: not required.

## Rollback

Set `ZALO_BOT_ENABLED=false` and redeploy to stop Bot intake without changing Mini App or ticket data. If automatic registration alone must be disabled, set `ZALO_BOT_AUTO_REGISTER_WEBHOOK=false`; the already registered Zalo webhook should then be removed or replaced through Zalo Bot Manager before rotating the webhook secret.
