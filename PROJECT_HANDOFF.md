# Project Handoff — Zalo IT HelpDesk

> Historical handoff through v5.12.0. For the current Backend/Admin v5.17.0 / Mini App v5.16.6 source, read `AGENTS.md`, `README.md`, `docs/releases/v5.17.0/`, `docs/releases/v5.16.9/`, `docs/releases/v5.16.8/`, `docs/releases/v5.16.7/`, `docs/releases/v5.16.6/`, `docs/releases/v5.16.5/`, `docs/releases/v5.16.4/` and `docs/releases/v5.16.0/` before acting. v5.17.0 is the PostgreSQL Playbook Governance source of truth; v5.16.9 remains the adaptive Admin sidebar source of truth, v5.16.8 owns the account/settings header, v5.16.7 fits the Overview workflow animation and v5.16.6 remains the Mini App dependency baseline.

> Tài liệu bàn giao sống. Cập nhật khi bắt đầu/kết thúc phiên bản, trước khi dừng giữa chừng và trước khi merge release.

## 1. Trạng thái hiện tại

| Trường | Giá trị |
|---|---|
| Repository | `AnNguyen307/Zalo_IT_HelpDesk_App` |
| Nhánh chuẩn | `main` |
| Baseline release | v5.11.0, merge commit `599227a` |
| Phiên bản phát hành | `5.12.0` |
| Mục tiêu | Staff Copilot phân tích độc lập và đưa nhiều hướng giải quyết kể cả khi không khớp Playbook |
| Nhánh phát triển | `agent/copilot-independent-reasoning` |
| Baseline | Cây mã v5.11.0 đã phát hành qua PR #15 |
| Trạng thái | Mã nguồn và validation hoàn tất; chờ review/merge vào `main`; chưa deploy Windows |
| Database migration | Không có migration mới; giữ schema version `9` |
| Validation | Syntax đạt; `84/84` test đạt; benchmark đạt; Mini App build đạt |
| Cập nhật lần cuối | 2026-08-10 (Asia/Ho_Chi_Minh) |

Máy Windows đã pull merge commit v5.11.0; lần khởi động được ghi nhận ban đầu còn thiếu migrations 008–009. Chưa có output tiếp theo xác nhận schema version `9` và health v5.11.0. Endpoint ngrok cũ chỉ là endpoint tạm; không ghi cứng URL vào mã nghiệp vụ.

## 2. Quyết định kiến trúc v5.12.0

Khóa `human_only` chỉ chặn AI Agent khỏi kênh User; nó không tắt Staff AI Copilot:

- AI Agent chỉ hướng dẫn User khi Playbook phù hợp và đạt guardrail.
- User có hai kết quả rõ ràng: **Tôi đã xử lý được** hoặc **Tôi vẫn chưa xử lý được**.
- Handoff rõ ràng đổi `waiting_user → open`, tiếp tục SLA và xếp Copilot run nền.
- Copilot chỉ dùng endpoint `/api/staff/...`, lưu ở `ai_copilot_runs` và không được đưa vào public ticket/messages.
- Bước Playbook được ánh xạ nguyên văn; kiến thức riêng của model luôn gắn nhãn `ai_inference`.
- Playbook là căn cứ nhưng không còn là giới hạn của Staff Copilot: mỗi cloud run hợp lệ bắt buộc có tối thiểu hai giả thuyết và hai hướng giải quyết độc lập.
- Copilot đánh giá Playbook `matched | partial | none`; khi `none`, nó chuyển `ai_led`, không tạo bước Playbook giả và vẫn hỗ trợ Helpdesk.
- Mỗi giả thuyết có rationale, confidence và cách kiểm chứng; mỗi hướng có các bước, tín hiệu thành công, điều kiện dừng/chuyển cấp và mức rủi ro.
- Backend từ chối output trực tiếp yêu cầu credential, lệnh phá hủy hoặc vô hiệu hóa bảo mật; provider khác được thử theo router trước khi fallback Rules.
- Phân tích hiển thị là reasoning summary có thể kiểm chứng, không xuất chain-of-thought.
- Bản nháp chỉ được chép vào ô reply; kỹ thuật viên vẫn phải duyệt và bấm gửi.
- Helpdesk chọn `auto|gemini|groq|openrouter|sambanova`; chỉ provider nằm trong route và đã cấu hình mới hợp lệ.
- Lịch sử v5.12: `auto` giữ failover cloud, còn model cụ thể từng chỉ gọi đúng provider đã chọn. Quy tắc này đã được v5.16.4 thay thế: model cụ thể là ưu tiên đầu tiên, sau đó router failover qua cloud route trước khi dùng Rules/Playbook.
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
      → đánh giá độ khớp Playbook
      → hybrid hoặc AI-led independent analysis
      → nhiều giả thuyết + nhiều solution path có guardrail
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
5. AI Agent kênh User không sinh checklist ngoài Playbook; Staff Copilot được đề xuất hướng ngoài Playbook nhưng không tự thực thi và phải gắn nhãn AI/risk/stop condition.
6. Admin review không tự gỡ human handoff.
7. Copilot không được xuất hiện trong public ticket, Mini App API hoặc conversation messages.
8. Copilot không có quyền tự gửi reply, tự đổi trạng thái hoặc tự đóng ticket.
9. Model Copilot phải lấy từ allowlist server; không nhận model ID tùy ý từ trình duyệt.

## 7. API và compatibility

- `GET /health` trả `version: 5.12.0` và feature `copilot-independent-reasoning`, `copilot-no-playbook-analysis`, `copilot-multi-path-solutions`, `copilot-model-selection`.
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

Sau khi v5.12.0 được merge:

1. Pull `main` trên máy Windows.
2. Sao lưu theo quy trình vận hành hiện hành và giữ nguyên `backend/.env`.
3. Không có migration mới; xác nhận database vẫn ở schema version `9`.
4. Restart backend và kiểm tra local/ngrok `/health` đều là `5.12.0`.
5. Hard refresh Admin; không bắt buộc deploy lại Mini App cho riêng thay đổi Copilot này.
6. Smoke test ticket có Playbook (`hybrid`) và không khớp Playbook (`ai_led`), mỗi run có tối thiểu hai giả thuyết/hướng.
7. Smoke test dropdown model, Dùng làm bản nháp, guardrail output và kiểm tra không rò sang User.
8. Tắt toàn bộ cloud provider và xác nhận Copilot/Agent đều fallback an toàn.

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
- `npm test`: `84/84` đạt.
- `npm run playbook:benchmark`: Hit@1 `0.90`, Hit@5 `1.00`, MRR `0.95`.
- `miniapp npm run build`: đạt; asset mới `index.g5nlUXhh.module.js`, `index.WPkxLTZQ.css`.
- `git diff --check`: đạt.
- Không phát hiện secret hoặc runtime reference local AI trong diff.
- Workspace Linux không có `pwsh`, vì vậy chưa chạy PowerShell AST parser; script Windows cần smoke test trên máy deploy.

Bước tiếp theo: review/merge draft PR v5.12.0, pull `main` trên Windows, restart backend và smoke test `hybrid`/`ai_led`/`rules_fallback` trong Admin.
