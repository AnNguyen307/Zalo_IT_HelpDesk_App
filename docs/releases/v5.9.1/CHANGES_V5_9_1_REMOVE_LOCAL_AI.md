# v5.9.1 — Remove Local AI Dependency

> [!NOTE]
> Đây là hồ sơ phát hành lịch sử. Nội dung phản ánh hệ thống tại thời điểm phiên bản này được phát hành và có thể đã được bản mới thay thế. Khi vận hành hiện tại, xem [Trung tâm tài liệu](../../INDEX.md).


## Kết quả

v5.9.1 loại Ollama khỏi runtime, Playbook embedding và quy trình khởi động Windows. AI Router V2 chỉ còn:

```text
Gemini → Groq → OpenRouter → SambaNova → Rules/HelpDesk
```

Không có database migration và không thay đổi Mini App workflow.

## Runtime

- Xóa provider `ollama-local`, health probe `/api/tags` và chat request `/api/chat`.
- Xóa toàn bộ cấu hình `OLLAMA_*`.
- `AI_PROVIDER` chỉ nhận `rules|gemini|groq|openrouter|sambanova`.
- `AI_PROVIDER_ORDER` tự bỏ qua giá trị local cũ.
- `AGENT_MODE=ollama` hoặc `AI_PROVIDER=ollama` trong `.env` cũ fail closed về `rules`.
- All-provider failure vẫn tạo ticket priority `normal` và handoff HelpDesk.

## Playbook RAG

- `PLAYBOOK_EMBED_PROVIDER` chỉ nhận `none|gemini`.
- Giá trị `ollama` cũ fail closed về `none`.
- Baseline là BM25 lexical, không cần index vector hoặc AI service.
- Hybrid scoring tùy chọn dùng Gemini embedding; lỗi embedding tự quay về BM25.

## Windows workflow

- Xóa task/script cài, chạy, kiểm tra và chờ Ollama.
- Task **HelpDesk: Backend** chạy `start-backend.bat` trực tiếp.
- Task **HelpDesk: Khởi động toàn bộ** chỉ còn Backend, ngrok và đồng bộ URL/deploy.
- Trình cài Enterprise Playbook cấu hình BM25 và chạy retrieval benchmark.

## Cấu hình sau nâng cấp

```env
AI_ROUTER_ENABLED=true
AI_PROVIDER_ORDER=gemini,groq,openrouter,sambanova
AI_PROVIDER=rules
AGENT_MODE=rules
AI_CLOUD_ENABLED=false

PLAYBOOK_RETRIEVAL_MODE=lexical
PLAYBOOK_EMBED_PROVIDER=none
PLAYBOOK_SEMANTIC=false
PLAYBOOK_AUTO_INDEX=false
PLAYBOOK_EMBED_MODEL=none
```

Xóa các dòng `OLLAMA_*` khỏi `backend/.env` trên máy deploy. Không ghi đè toàn bộ `.env` vì file đang chứa secret/runtime configuration khác.

## Rollback

Rollback không khôi phục local AI. Dùng Rules/Playbook thuần:

```env
AI_ROUTER_ENABLED=false
AI_PROVIDER=rules
AGENT_MODE=rules
AI_CLOUD_ENABLED=false
PLAYBOOK_RETRIEVAL_MODE=lexical
PLAYBOOK_EMBED_PROVIDER=none
```

## Validation

- Backend syntax check: đạt.
- Backend tests: `73/73` đạt.
- BM25 benchmark: Hit@1 `0.90`, Hit@5 `1.00`, MRR `0.95`.
- Mini App production build: đạt; asset hash không đổi.
- All-provider failure: ticket vẫn tạo với priority `normal` và attempt telemetry chỉ có bốn cloud provider.
- Legacy local-AI environment values: fail closed về Rules/BM25.
