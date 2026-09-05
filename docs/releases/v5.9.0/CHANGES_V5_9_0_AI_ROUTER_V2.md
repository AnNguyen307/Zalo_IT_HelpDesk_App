# v5.9.0 — AI Router V2 & Ollama-independent RAG

> [!NOTE]
> Đây là hồ sơ phát hành lịch sử. Nội dung phản ánh hệ thống tại thời điểm phiên bản này được phát hành và có thể đã được bản mới thay thế. Khi vận hành hiện tại, xem [Trung tâm tài liệu](../../INDEX.md).


## Mục tiêu

- Đặt Ollama ở vị trí LLM cuối cùng.
- Tận dụng nhiều provider có free tier theo khả năng suy luận rồi quota còn lại.
- Giữ ticket creation và HelpDesk handoff hoạt động khi toàn bộ AI lỗi.
- Loại Ollama khỏi dependency bắt buộc của Playbook retrieval.

## AI Router V2

Chuỗi mặc định: `Gemini → Groq → OpenRouter → SambaNova → Ollama → Rules/HelpDesk`.

- Provider có feature flag, API key/model riêng, timeout và ngân sách request/token cấu hình được.
- Router bỏ qua provider chưa cấu hình, hết ngân sách hoặc circuit đang mở.
- `429`, timeout và `5xx` có retry/fallback; JSON/schema hoặc confidence thấp chuyển sang provider/model-family tiếp theo.
- Telemetry quyết định lưu toàn bộ attempt: provider, model, trạng thái, reason code, latency, usage và redaction summary.
- Status API/Admin hiển thị order, provider đang ưu tiên, quota và circuit state.
- Rollback bằng `AI_ROUTER_ENABLED=false` và `AI_PROVIDER=ollama|rules|gemini`.

Model mặc định:

| Provider | Model | Ngân sách app mặc định |
|---|---|---:|
| Gemini | `gemini-3.6-flash` | Provider-managed (`0`) |
| Groq | `openai/gpt-oss-120b` | 1.000 request / 200.000 token mỗi ngày |
| OpenRouter | `openai/gpt-oss-120b:free` | 50 request mỗi ngày |
| SambaNova | `DeepSeek-V3.2` | 20 request / 200.000 token mỗi ngày |
| Ollama | `qwen3.5:9b` | Local, không giới hạn API |

Các giá trị trên là guardrail cấu hình tại thời điểm phát hành, không thay thế quota thật của provider và có thể chỉnh trong `.env`.

## Ollama-independent RAG

- BM25 lexical ranking thay thế chấm điểm substring đơn giản và là retrieval mặc định.
- Hybrid scoring vẫn được hỗ trợ nhưng embedding provider được tách thành `none|gemini|ollama`.
- `PLAYBOOK_EMBED_PROVIDER=none` không cần index vector hoặc Ollama.
- Gemini embedding dùng OpenAI-compatible endpoint; mọi lỗi embedding tự fallback về BM25.
- Index schema v2 lưu provider/model identity để tránh dùng nhầm vector cũ.
- Bộ benchmark 10 mock queries đo Hit@1, Hit@5 và MRR; release gate yêu cầu Hit@5 ≥ 0,90 và MRR ≥ 0,65.

## Guardrail giữ nguyên

- Ticket luôn được tạo; priority mặc định `normal`.
- AI chỉ đề xuất, không tự đóng ticket hay thực thi lệnh.
- Chỉ chọn checklist từ Enterprise Playbook đã duyệt.
- Không Playbook, confidence thấp, rủi ro cao hoặc tất cả provider lỗi thì chuyển kỹ thuật viên.
- API key không được commit hoặc gửi xuống Mini App/Admin frontend.

## Migration và triển khai

- Không có database migration.
- Không cần build lại Mini App vì không đổi API contract người dùng; package/cache version vẫn được nâng lên `5.9.0` để phát hành đồng bộ.
- Cập nhật `backend/.env` từ `.env.example`, restart backend và kiểm tra `/health` trả `5.9.0`.
- Chạy `npm run check`, `npm test`, `npm run playbook:benchmark` và `npm run build` trong `miniapp` trước merge/deploy.

## Tài liệu provider đã đối chiếu ngày 2026-08-09

- Gemini OpenAI compatibility và structured output: <https://ai.google.dev/gemini-api/docs/openai>
- Gemini rate limits: <https://ai.google.dev/gemini-api/docs/rate-limits>
- Groq rate limits và structured outputs: <https://console.groq.com/docs/rate-limits>, <https://console.groq.com/docs/structured-outputs>
- OpenRouter free-model limits và structured outputs: <https://openrouter.ai/docs/faq>, <https://openrouter.ai/docs/guides/features/structured-outputs>
- SambaNova endpoint và rate limits: <https://docs.sambanova.ai/docs/en/get-started/api-keys-urls>, <https://docs.sambanova.ai/docs/en/models/rate-limits>
