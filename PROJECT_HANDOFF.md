# Project Handoff — Zalo IT HelpDesk

> Tài liệu bàn giao sống (single source of continuity). Cập nhật file này khi bắt đầu/kết thúc phiên bản lớn, trước khi dừng giữa chừng và trước khi merge release.

## 1. Trạng thái hiện tại

| Trường | Giá trị |
|---|---|
| Repository | `AnNguyen307/Zalo_IT_HelpDesk_App` |
| Nhánh chuẩn | `main` |
| Phiên bản đang làm | `5.9.0` |
| Trạng thái | Đã hoàn tất mã nguồn và validation; chưa commit/push/merge/deploy |
| Nhánh phát triển | `agent/ai-router-v5.9.0` |
| Baseline | v5.8.0, PR #11, commit `d12a14d` |
| Database migration | Không cần cho v5.9.0 |
| Backend validation | `npm run check` đạt; `71/71` test đạt |
| Retrieval benchmark | 10 mock cases: Hit@1 `0.90`, Hit@5 `1.00`, MRR `0.95` |
| Mini App validation | Production build đạt; asset hash không thay đổi |
| Cập nhật lần cuối | 2026-08-09 (Asia/Ho_Chi_Minh) |

Runtime đã phát hành trước khi bắt đầu v5.9:

- Backend local và ngrok đã xác nhận `ok=True`, `version=5.8.0`.
- Endpoint pilot: `https://7ae2-14-164-186-7.ngrok-free.app`.
- Zalo Development: `zdev-b9eb7815`.
- Git `main` phía người dùng sạch và đồng bộ sau phát hành v5.8.0.

Ngrok là endpoint tạm theo môi trường. Không ghi cứng URL này vào mã nghiệp vụ. Mini App nhận `VITE_API_BASE_URL` ở build time; chỉ cần build/deploy lại khi endpoint hoặc bundle Mini App thay đổi.

## 2. Mục tiêu v5.9.0

1. Ollama là LLM cuối cùng, không còn là lựa chọn đầu hoặc dependency production bắt buộc.
2. Router thử nhiều provider có free tier theo khả năng suy luận rồi quota còn lại.
3. `429`, timeout, `5xx`, JSON/schema sai hoặc confidence thấp phải chuyển provider tiếp theo.
4. Mọi attempt phải có telemetry để Admin biết provider nào đã được thử và vì sao bị bỏ qua/lỗi.
5. Enterprise Playbook retrieval phải chạy khi Ollama tắt hoàn toàn.
6. Mọi provider lỗi vẫn phải tạo ticket, giữ priority mặc định `normal` và handoff HelpDesk.

## 3. Kiến trúc v5.9.0

```text
Ticket / message
  → Rule classification
  → BM25 Enterprise Playbook Top-K
  → optional hybrid embedding (Gemini hoặc Ollama)
  → AI Router V2
      Gemini → Groq → OpenRouter → SambaNova → Ollama
  → backend schema + confidence + Playbook guardrail
  → decision record + attempt telemetry + Audit Log
  → Playbook guidance hoặc Rules/HelpDesk handoff
  → Admin Đúng/Cần sửa + quality dashboard
```

Module quan trọng:

- `backend/src/ai-router.mjs`: provider registry, ordering, quota budget, retry, timeout, circuit breaker và attempt telemetry.
- `backend/src/embeddings.mjs`: abstraction `none|gemini|ollama` cho Playbook embedding.
- `backend/src/playbook.mjs`: BM25 lexical, hybrid scoring, index schema v2 và lexical fallback.
- `backend/src/ai-agent.mjs`: schema/confidence acceptance và Playbook guardrail.
- `backend/src/ai-quality.mjs`: lưu router/attempt telemetry trong decision record.
- `backend/scripts/benchmark-playbook.mjs`: release gate Hit@1/Hit@5/MRR trên mock queries.
- `docs/releases/v5.9.0/CHANGES_V5_9_0_AI_ROUTER_V2.md`: release note và upgrade summary.

## 4. Provider order và cấu hình

Chuỗi mặc định:

```env
AI_ROUTER_ENABLED=true
AI_PROVIDER_ORDER=gemini,groq,openrouter,sambanova,ollama
AI_ROUTING_POLICY=capability_then_free_quota
AI_CLOUD_ENABLED=false
AI_REDACTION_ENABLED=false
AI_PROVIDER_RETRIES=1
AI_CIRCUIT_FAILURE_THRESHOLD=2
AI_CIRCUIT_COOLDOWN_MS=60000
```

Provider cloud chỉ chạy khi đồng thời:

- `AI_CLOUD_ENABLED=true`.
- Feature flag provider (`GEMINI_ENABLED`, `GROQ_ENABLED`, `OPENROUTER_ENABLED`, `SAMBANOVA_ENABLED`) là `true`.
- API key và model của provider có giá trị.

Model/ngân sách app mặc định tại thời điểm v5.9.0:

| Provider | Model | Request/ngày | Token/ngày |
|---|---|---:|---:|
| Gemini | `gemini-3.6-flash` | Provider-managed (`0`) | Provider-managed (`0`) |
| Groq | `openai/gpt-oss-120b` | 1.000 | 200.000 |
| OpenRouter | `openai/gpt-oss-120b:free` | 50 | Provider-managed (`0`) |
| SambaNova | `DeepSeek-V3.2` | 20 | 200.000 |
| Ollama | `qwen3.5:9b` | Local | Local |

Các con số là guardrail cấu hình có thể sửa, không phải cam kết vĩnh viễn của provider. Trước thay model/quota phải kiểm tra lại tài liệu chính thức.

Mock data hiện được phép đặt `AI_REDACTION_ENABLED=false`. Trước dữ liệu thật phải đánh giá lại và thường bật redaction. API key luôn ở `backend/.env` hoặc secret store, không commit và không gửi xuống Mini App/Admin frontend.

## 5. Ollama-independent RAG

Cấu hình mặc định:

```env
PLAYBOOK_RETRIEVAL_MODE=lexical
PLAYBOOK_EMBED_PROVIDER=none
PLAYBOOK_SEMANTIC=false
PLAYBOOK_AUTO_INDEX=false
PLAYBOOK_TOP_K=5
PLAYBOOK_MIN_SCORE=0.20
PLAYBOOK_AUTO_MIN_SCORE=0.72
```

BM25 chạy trực tiếp trên Playbook nên không cần vector index, Ollama hoặc cloud. Hybrid là tùy chọn:

```env
PLAYBOOK_RETRIEVAL_MODE=hybrid
PLAYBOOK_EMBED_PROVIDER=gemini
PLAYBOOK_EMBED_MODEL=gemini-embedding-001
PLAYBOOK_AUTO_INDEX=true
```

Nếu embedding/index lỗi, search tự quay về BM25. Index schema v2 khóa theo `provider:model` để không dùng nhầm vector từ model cũ.

## 6. Guardrail bắt buộc

1. Ticket phải luôn tạo được khi mọi model/provider lỗi.
2. Priority mặc định là `normal` (**Bình thường**).
3. AI chỉ đổi priority khi `priorityDetermined=true`, confidence đạt ngưỡng và giá trị hợp lệ.
4. AI chỉ đề xuất; backend/Playbook áp guardrail, con người quyết định cuối.
5. Không Playbook phù hợp, confidence thấp, provider lỗi hoặc rủi ro cao phải handoff kỹ thuật viên.
6. AI không tự đóng ticket, không thực thi lệnh và không sinh checklist ngoài Enterprise Playbook đã duyệt.
7. API key/secret chỉ ở backend environment/secret store.
8. Provider mới phải có feature flag, failure test và rollback.
9. Không gộp AI router với database/object-storage/backend-hosting migration.
10. Admin review không được tự gỡ human handoff.

## 7. API và dữ liệu

- `GET /health`: trả `version: 5.9.0`, agent order/provider/quota/circuit và Playbook retrieval/embedding status.
- `GET /api/admin/agent/status`: cùng control-plane status cho Admin.
- `GET /api/admin/playbook/status`: thêm `retrievalMode`, `embeddingProvider`, `embeddingConfigured`.
- Decision record giữ schema tương thích v5.8, bổ sung `router`, `routingPolicy`, `attempts`.
- Không có database schema migration; JSON và SQL Server tiếp tục lưu `aiAnalysis` dạng JSON.

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

- Full backend suite đạt.
- Benchmark Hit@5 ≥ `0.90`, MRR ≥ `0.65`.
- Test end-to-end xác nhận all-provider failure vẫn trả HTTP `201`, priority `normal`, `agent_unavailable` và attempt telemetry.
- Mini App production build đạt.
- Không có `.env`, API key, database local, upload/cache rác trong diff.

## 9. Deploy và rollback v5.9.0

1. Merge/pull `main` sau khi release được duyệt.
2. Cập nhật thủ công `backend/.env` từ `.env.example`; không ghi đè secret đang dùng.
3. Để kiểm thử Router V2 cloud, bật `AI_CLOUD_ENABLED=true`, bật provider mong muốn và thêm server-side API key.
4. Dùng `PLAYBOOK_RETRIEVAL_MODE=lexical`, `PLAYBOOK_EMBED_PROVIDER=none` cho baseline không phụ thuộc Ollama.
5. Restart backend; kiểm tra local và ngrok `/health` đều `5.9.0`.
6. Nghiệm thu success provider, quota/failure fallback, all-provider failure, Admin review và benchmark.
7. Mini App bundle hiện giữ nguyên asset hash v5.8; chỉ deploy lại nếu cần đồng bộ release Development hoặc endpoint thay đổi.

Rollback nhanh:

```env
AI_ROUTER_ENABLED=false
AI_PROVIDER=ollama
AI_CLOUD_ENABLED=false
PLAYBOOK_RETRIEVAL_MODE=lexical
PLAYBOOK_EMBED_PROVIDER=none
```

Sau rollback phải restart backend và kiểm tra `/health`/ticket creation.

## 10. Hướng phát triển tiếp theo

- v6.0: repository refactor theo nghiệp vụ, PostgreSQL, private Object Storage, migration đối soát và backup/restore test.
- v6.1: Docker/always-on backend, stable HTTPS domain, job locking/worker và `ZALO_AUTH_MODE=remote`.
- v6.2: CI/CD backend, monitoring/alerting, secret rotation, rollback và audit retention.
- v6.3+: multi-instance, load balancing, queue/realtime theo số liệu tải thực tế.

Nợ kiến trúc:

- Quota/circuit state v5.9 nằm trong process memory; multi-instance cần shared state.
- SQL Server store chưa phù hợp nhiều backend instance nếu còn đồng bộ snapshot lớn.
- Attachment/index vẫn phụ thuộc filesystem local.
- SLA timer, reindex queue và cache vẫn trong process.

## 11. Việc đang làm dở

- Chưa commit/push/merge/deploy v5.9.0.
- Validation đã đạt: syntax check, `71/71` test, retrieval benchmark và Mini App production build.
- Chưa thử API thật vì workspace không có provider API key; provider contract được kiểm thử bằng mock HTTP response.
- Bước tiếp theo: rà diff cuối → commit/push/draft PR hoặc hướng dẫn người dùng cập nhật local theo phạm vi được phê duyệt.
