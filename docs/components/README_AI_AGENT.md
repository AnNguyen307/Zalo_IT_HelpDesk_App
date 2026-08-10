# AI HelpDesk Agent + Staff Copilot v5.12.0

AI Agent dùng Router V2 chỉ với cloud provider, BM25 Playbook retrieval và telemetry theo từng attempt. Không có local model hoặc local embedding service trong đường chạy.

Sau khi handoff, AI Agent không còn phản hồi trực tiếp User. Staff AI Copilot hoạt động trên API và storage riêng, chỉ gợi ý nội bộ để kỹ thuật viên duyệt.

## Luồng quyết định

1. Backend phân loại rule và tìm Enterprise Playbook bằng BM25.
2. Router thử `gemini → groq → openrouter → sambanova` theo feature flag, cấu hình và quota còn lại.
3. `429`, timeout, `5xx`, JSON/schema sai hoặc confidence thấp sẽ chuyển provider tiếp theo.
4. Backend kiểm tra lại risk, priority, Playbook ID và selected steps.
5. Nếu tất cả cloud provider lỗi, ticket vẫn được tạo với priority `normal` và chuyển HelpDesk.

AI Agent ở kênh User chỉ được chọn các bước tồn tại trong Playbook đã duyệt. Password, OTP, bảo mật, mất dữ liệu, BSOD, BIOS, server, switch, firewall, quyền admin và phần cứng nguy hiểm luôn được chuyển kỹ thuật viên.

## Cấu hình Router V2

```env
AI_ROUTER_ENABLED=true
AI_PROVIDER_ORDER=gemini,groq,openrouter,sambanova
AI_ROUTING_POLICY=fixed
AI_CLOUD_ENABLED=true
AI_REDACTION_ENABLED=true
GEMINI_API_KEY=
GROQ_API_KEY=
OPENROUTER_API_KEY=
SAMBANOVA_API_KEY=
```

Provider cloud còn cần feature flag tương ứng. Key trống làm provider được bỏ qua, không làm ticket thất bại.

## Playbook retrieval

Baseline BM25 không gọi AI:

```env
PLAYBOOK_RETRIEVAL_MODE=lexical
PLAYBOOK_EMBED_PROVIDER=none
PLAYBOOK_TOP_K=5
PLAYBOOK_MIN_SCORE=0.20
PLAYBOOK_AUTO_MIN_SCORE=0.72
```

Hybrid bằng remote embedding là tùy chọn:

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

## Staff AI Copilot

Copilot tự xếp hàng khi AI Agent escalation, User xác nhận chưa xử lý được hoặc staff tiếp nhận ticket. Tab Copilot phân biệt bước Playbook nguyên văn với giả thuyết AI, đồng thời tạo bản nháp không tự gửi.

Mỗi kết quả cloud hợp lệ bắt buộc có:

- Đánh giá Playbook `matched | partial | none`; không ép lỗi vào procedure chỉ vì gần từ khóa.
- Ít nhất hai giả thuyết độc lập, kèm lý do, confidence và cách kiểm chứng.
- Ít nhất hai hướng giải quyết, kèm bước thực hiện, tín hiệu thành công, điều kiện dừng/chuyển cấp và mức rủi ro.
- Chế độ `hybrid` khi Playbook có giá trị hoặc `ai_led` khi không có procedure phù hợp.

Phân tích độc lập là bản tóm tắt lập luận chẩn đoán có thể kiểm chứng, không phải chain-of-thought. Nó chỉ dành cho Helpdesk, không tự thực thi và không làm yếu guardrail của AI Agent ở kênh User.

Helpdesk có thể chọn **Tự động**, Gemini, Groq, OpenRouter hoặc SambaNova cho lần phân tích tiếp theo. Chỉ các model nằm trong route server và đã cấu hình mới được chọn. Chọn model cụ thể không failover sang cloud model khác; nếu provider lỗi, Copilot dùng Rules/Playbook an toàn và lưu cả model yêu cầu lẫn model thực tế vào run audit.

Nội dung Copilot chỉ xuất hiện qua `/api/staff/tickets/:ticketId/copilot`; public ticket và Mini App không có trường Copilot.

## Health và rollback

`GET /health` trả `version: 5.12.0`, các feature `copilot-independent-reasoning`, `copilot-no-playbook-analysis`, `copilot-multi-path-solutions`, `copilot-model-selection`, `agent.provider: ai-router-v2`, thứ tự router, provider đang sẵn sàng, quota/circuit state và trạng thái BM25/embedding.

Rollback không dùng model:

```env
AI_ROUTER_ENABLED=false
AI_PROVIDER=rules
AI_CLOUD_ENABLED=false
PLAYBOOK_RETRIEVAL_MODE=lexical
PLAYBOOK_EMBED_PROVIDER=none
```

Admin → **AI Agent** hiển thị thứ tự provider, provider sẵn sàng, retrieval mode, quality metrics và review Đúng/Cần sửa.
