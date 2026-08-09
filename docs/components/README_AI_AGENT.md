# AI HelpDesk Agent v5.9

AI Agent v5.9 dùng Router V2, BM25 Playbook retrieval và telemetry theo từng provider attempt. Ollama là LLM cuối cùng, không còn là dependency bắt buộc của RAG.

## Luồng quyết định

1. Backend phân loại rule và tìm Enterprise Playbook bằng BM25.
2. Router thử `gemini → groq → openrouter → sambanova → ollama` theo feature flag, cấu hình và quota còn lại.
3. `429`, timeout, `5xx`, JSON/schema sai hoặc confidence thấp sẽ chuyển provider tiếp theo.
4. Backend kiểm tra lại risk, priority, Playbook ID và selected steps.
5. Nếu tất cả provider lỗi, ticket vẫn được tạo với priority `normal` và chuyển HelpDesk.

Model chỉ được chọn các bước tồn tại trong Playbook đã duyệt. Password, OTP, bảo mật, mất dữ liệu, BSOD, BIOS, server, switch, firewall, quyền admin và phần cứng nguy hiểm luôn được chuyển kỹ thuật viên.

## Cấu hình Router V2

```env
AI_ROUTER_ENABLED=true
AI_PROVIDER_ORDER=gemini,groq,openrouter,sambanova,ollama
AI_ROUTING_POLICY=capability_then_free_quota
AI_CLOUD_ENABLED=true
AI_REDACTION_ENABLED=false
GEMINI_API_KEY=
GROQ_API_KEY=
OPENROUTER_API_KEY=
SAMBANOVA_API_KEY=
```

Provider cloud còn cần feature flag tương ứng. Key trống làm provider được bỏ qua, không làm ticket thất bại.

## Retrieval không phụ thuộc Ollama

```env
PLAYBOOK_RETRIEVAL_MODE=lexical
PLAYBOOK_EMBED_PROVIDER=none
PLAYBOOK_TOP_K=5
PLAYBOOK_MIN_SCORE=0.20
PLAYBOOK_AUTO_MIN_SCORE=0.72
```

Hybrid là tùy chọn:

```env
PLAYBOOK_RETRIEVAL_MODE=hybrid
PLAYBOOK_EMBED_PROVIDER=gemini
PLAYBOOK_EMBED_MODEL=gemini-embedding-001
PLAYBOOK_AUTO_INDEX=true
```

Chạy benchmark Top-K:

```bash
cd backend
npm run playbook:benchmark
```

## Health và rollback

`GET /health` trả `version: 5.9.0`, `agent.provider: ai-router-v2`, thứ tự router, provider đang sẵn sàng, quota/circuit state và trạng thái BM25/embedding.

Rollback:

```env
AI_ROUTER_ENABLED=false
AI_PROVIDER=ollama
AI_CLOUD_ENABLED=false
PLAYBOOK_RETRIEVAL_MODE=lexical
PLAYBOOK_EMBED_PROVIDER=none
```

Admin → **AI Agent** hiển thị thứ tự provider, provider sẵn sàng, retrieval mode, quality metrics và review Đúng/Cần sửa.
