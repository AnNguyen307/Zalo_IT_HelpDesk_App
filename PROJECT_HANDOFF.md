# Project Handoff — Zalo IT HelpDesk

> Tài liệu bàn giao sống. Cập nhật khi bắt đầu/kết thúc phiên bản, trước khi dừng giữa chừng và trước khi merge release.

## 1. Trạng thái hiện tại

| Trường | Giá trị |
|---|---|
| Repository | `AnNguyen307/Zalo_IT_HelpDesk_App` |
| Nhánh chuẩn | `main` |
| Baseline release | v5.9.1, commit `7fb3404` |
| Phiên bản phát hành | `5.11.0` |
| Mục tiêu | Cho Helpdesk chọn model Staff AI Copilot theo từng lần phân tích |
| Nhánh phát triển | `main` (workspace chưa commit) |
| Baseline | `origin/main` tại `7fb3404` |
| Trạng thái | Mã nguồn và validation hoàn tất; chưa deploy Windows |
| Database migration | `009_copilot_model_selection.sql`, schema version `9` |
| Validation | Syntax đạt; `82/82` test đạt; benchmark đạt; Mini App build đạt |
| Cập nhật lần cuối | 2026-08-10 (Asia/Ho_Chi_Minh) |

v5.9.0 đã được merge nhưng chưa có bằng chứng deploy backend v5.9 lên máy Windows. Endpoint ngrok được ghi ở handoff cũ chỉ là endpoint tạm; không ghi cứng URL vào mã nghiệp vụ.

## 2. Quyết định kiến trúc v5.11.0

Khóa `human_only` chỉ chặn AI Agent khỏi kênh User; nó không tắt Staff AI Copilot:

- AI Agent chỉ hướng dẫn User khi Playbook phù hợp và đạt guardrail.
- User có hai kết quả rõ ràng: **Tôi đã xử lý được** hoặc **Tôi vẫn chưa xử lý được**.
- Handoff rõ ràng đổi `waiting_user → open`, tiếp tục SLA và xếp Copilot run nền.
- Copilot chỉ dùng endpoint `/api/staff/...`, lưu ở `ai_copilot_runs` và không được đưa vào public ticket/messages.
- Bước Playbook được ánh xạ nguyên văn; kiến thức riêng của model luôn gắn nhãn `ai_inference`.
- Bản nháp chỉ được chép vào ô reply; kỹ thuật viên vẫn phải duyệt và bấm gửi.
- Helpdesk chọn `auto|gemini|groq|openrouter|sambanova`; chỉ provider nằm trong route và đã cấu hình mới hợp lệ.
- `auto` giữ failover cloud. Model cụ thể chỉ gọi đúng provider đã chọn và fallback Rules/Playbook nếu provider đó lỗi.
- Mỗi run lưu riêng provider/model được yêu cầu và provider/model thực tế; trình duyệt không bao giờ nhận API key.

Quyết định cloud-only của v5.9.1 vẫn giữ nguyên:

Ollama bị loại khỏi toàn bộ đường chạy hiện tại:

- Không còn provider local trong AI Router V2.
- Không còn provider embedding local trong Enterprise Playbook RAG.
- Không còn biến `OLLAMA_*`, model local, health probe hoặc request tới cổng `11434`.
- Không còn task/script Windows cài, chạy, chờ hoặc kiểm tra local AI.
- Các giá trị `.env` cũ `AGENT_MODE=ollama`, `AI_PROVIDER=ollama` và `PLAYBOOK_EMBED_PROVIDER=ollama` bị từ chối và fail closed về `rules`/`none`.

Release note lịch sử trước v5.9.1 vẫn được giữ nguyên để phản ánh đúng các phiên bản cũ; chúng không phải hướng dẫn vận hành hiện tại.

## 3. Kiến trúc hiện tại

```text
Ticket / message
  → Rule classification
  → BM25 Enterprise Playbook Top-K
  → optional Gemini embedding hybrid score
  → AI Router V2
      Gemini → Groq → OpenRouter → SambaNova
  → backend schema + confidence + Playbook guardrail
  → decision record + attempt telemetry + Audit Log
  → Playbook guidance hoặc Rules/HelpDesk handoff
  → sau handoff: Staff AI Copilot nền
      → Playbook evidence + labeled AI inference
      → auto route hoặc model Helpdesk chọn
      → kỹ thuật viên duyệt bản nháp
  → Admin Đúng/Cần sửa + quality dashboard
```

Module quan trọng:

- `backend/src/ai-router.mjs`: cloud provider registry, ordering, quota, retry, timeout, circuit breaker và attempt telemetry.
- `backend/src/embeddings.mjs`: `none|gemini` cho Playbook embedding.
- `backend/src/playbook.mjs`: BM25 lexical, optional hybrid scoring và lexical fallback.
- `backend/src/ai-agent.mjs`: JSON schema, confidence acceptance và Playbook guardrail.
- `backend/src/ai-copilot.mjs`: phân tích staff-only, nguồn Playbook, giả thuyết AI và queue nền.
- `backend/src/ai-quality.mjs`: decision record và quality reporting.
- `backend/test/no-local-ai-v591.test.mjs`: release guard chống tái đưa local AI vào runtime/startup.

## 4. Cấu hình chuẩn

```env
AI_ROUTER_ENABLED=true
AI_PROVIDER_ORDER=gemini,groq,openrouter,sambanova
AI_ROUTING_POLICY=fixed
AI_PROVIDER=rules
AGENT_MODE=rules
AI_CLOUD_ENABLED=true
AI_REDACTION_ENABLED=true
AI_PROVIDER_RETRIES=1
AI_CIRCUIT_FAILURE_THRESHOLD=2
AI_CIRCUIT_COOLDOWN_MS=60000
```

Provider cloud chỉ chạy khi đồng thời có `AI_CLOUD_ENABLED=true`, feature flag tương ứng và API key phía server. API key luôn ở `backend/.env`/secret store, không commit và không gửi xuống Mini App/Admin frontend.

Mock data hiện được phép đặt `AI_REDACTION_ENABLED=false`. Trước dữ liệu thật phải đánh giá lại và thường bật redaction.

## 5. Playbook RAG

Baseline không gọi AI:

```env
PLAYBOOK_RETRIEVAL_MODE=lexical
PLAYBOOK_EMBED_PROVIDER=none
PLAYBOOK_SEMANTIC=false
PLAYBOOK_AUTO_INDEX=false
PLAYBOOK_TOP_K=5
PLAYBOOK_MIN_SCORE=0.20
PLAYBOOK_AUTO_MIN_SCORE=0.72
```

Hybrid tùy chọn chỉ dùng remote embedding:

```env
PLAYBOOK_RETRIEVAL_MODE=hybrid
PLAYBOOK_EMBED_PROVIDER=gemini
PLAYBOOK_EMBED_MODEL=gemini-embedding-001
PLAYBOOK_AUTO_INDEX=true
```

Nếu embedding/index lỗi, search tự quay về BM25. Script `scripts/windows/install-enterprise-playbook.ps1` cấu hình baseline lexical và chạy benchmark, không tải model.

## 6. Guardrail bắt buộc

1. Ticket luôn tạo được khi mọi cloud provider lỗi.
2. Priority mặc định là `normal` (**Bình thường**).
3. AI chỉ đổi priority khi `priorityDetermined=true`, confidence đạt ngưỡng và giá trị hợp lệ.
4. Không có Playbook phù hợp, confidence thấp, provider lỗi hoặc rủi ro cao phải handoff kỹ thuật viên.
5. AI không tự đóng ticket, không thực thi lệnh và không sinh checklist ngoài Playbook đã duyệt.
6. Admin review không tự gỡ human handoff.
7. Copilot không được xuất hiện trong public ticket, Mini App API hoặc conversation messages.
8. Copilot không có quyền tự gửi reply, tự đổi trạng thái hoặc tự đóng ticket.
9. Model Copilot phải lấy từ allowlist server; không nhận model ID tùy ý từ trình duyệt.

## 7. API và compatibility

- `GET /health` trả `version: 5.11.0` và feature `copilot-model-selection`, `staff-ai-copilot`, `copilot-channel-isolation`.
- Router status chỉ liệt kê Gemini, Groq, OpenRouter và SambaNova.
- `POST /api/tickets/:ticketId/request-human-help` chỉ dành cho User sở hữu ticket.
- `GET/POST /api/staff/tickets/:ticketId/copilot[/runs]` yêu cầu staff session; POST chỉ Admin/Technician và nhận provider từ allowlist.
- JSON store tự thêm trường; SQL Server bắt buộc chạy migrations 008 và 009 trước khi restart.

## 8. Validation bắt buộc

```bash
git status -sb
git diff --check

cd backend
npm run check
npm test
npm run playbook:benchmark

cd ../miniapp
npm run build
```

Release gate:

- Full backend suite đạt, gồm test cấu hình legacy fail closed.
- Runtime/source/startup script không còn integration local AI.
- Benchmark Hit@5 ≥ `0.90`, MRR ≥ `0.65`.
- All-provider failure vẫn trả HTTP `201`, priority `normal`, `agent_unavailable` và attempt telemetry chỉ có bốn cloud provider.
- Mini App production build đạt.
- Không có `.env`, API key, database local, upload/cache rác trong diff.

## 9. Deploy và rollback

Sau khi v5.11.0 được merge:

1. Pull `main` trên máy Windows.
2. Sao lưu theo quy trình vận hành hiện hành và giữ nguyên `backend/.env`.
3. Chạy `cd backend; npm ci; npm run db:migrate` và xác nhận schema version `9`.
4. Restart backend và kiểm tra local/ngrok `/health` đều là `5.11.0`.
5. Build/deploy lại Mini App để có hai nút kết quả hướng dẫn.
6. Smoke test handoff, dropdown model, run Tự động/model cụ thể, Dùng làm bản nháp và kiểm tra không rò sang User.
7. Tắt toàn bộ cloud provider và xác nhận Copilot/Agent đều fallback an toàn.

Rollback an toàn không dùng AI model:

```env
AI_ROUTER_ENABLED=false
AI_PROVIDER=rules
AGENT_MODE=rules
AI_CLOUD_ENABLED=false
PLAYBOOK_RETRIEVAL_MODE=lexical
PLAYBOOK_EMBED_PROVIDER=none
```

## 10. Hướng phát triển tiếp theo

- v6.0: repository refactor theo nghiệp vụ, PostgreSQL, private Object Storage, migration đối soát và backup/restore test.
- v6.1: Docker/always-on backend, stable HTTPS domain, job locking/worker và `ZALO_AUTH_MODE=remote`.
- v6.2: CI/CD backend, monitoring/alerting, secret rotation, rollback và audit retention.

Nợ kiến trúc: quota/circuit state vẫn nằm trong process memory; attachment/index vẫn phụ thuộc filesystem; SLA timer, reindex queue và cache chưa hỗ trợ multi-instance.

## 11. Kết quả validation và việc tiếp theo

- `npm run check`: đạt.
- `npm test`: `82/82` đạt.
- `npm run playbook:benchmark`: Hit@1 `0.90`, Hit@5 `1.00`, MRR `0.95`.
- `miniapp npm run build`: đạt; asset mới `index.g5nlUXhh.module.js`, `index.WPkxLTZQ.css`.
- `git diff --check`: đạt.
- Không phát hiện secret hoặc runtime reference local AI trong diff.
- Workspace Linux không có `pwsh`, vì vậy chưa chạy PowerShell AST parser; script Windows cần smoke test trên máy deploy.

Bước vận hành tiếp theo sau khi mã được phát hành: chạy migrations 008–009, restart backend v5.11.0, deploy lại Mini App và smoke test lựa chọn model/cách ly Copilot trên máy Windows.
