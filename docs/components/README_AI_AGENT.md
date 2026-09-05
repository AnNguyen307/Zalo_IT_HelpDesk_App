# AI Agent và Staff Copilot

Tài liệu hiện hành cho Backend/Admin `5.18.6`. Hệ thống dùng cloud provider có kiểm soát, Enterprise Playbook và Rules fallback; không có local model/Ollama trong runtime.

## Hai kênh AI khác nhau

| Kênh | Đối tượng | Mục tiêu | Không được làm |
|---|---|---|---|
| AI Agent | Nhân viên | Hướng dẫn tự xử lý an toàn | Tạo bước ngoài Playbook, thực thi lệnh, lộ dữ liệu nội bộ |
| Staff Copilot | Admin/Kỹ thuật viên | Hỗ trợ chẩn đoán và soạn phản hồi | Tự gửi tin, tự đổi trạng thái, tự đóng ticket |

Sau human handoff, AI Agent ngừng trả lời trực tiếp nhân viên. Staff Copilot vẫn hoạt động trong kênh nội bộ.

## Luồng AI Agent

1. Backend chuẩn hóa và redaction dữ liệu cần thiết.
2. Rule engine nhận diện rủi ro và priority signal.
3. Playbook retrieval tìm procedure phù hợp.
4. Cloud router thử provider đủ điều kiện.
5. Backend xác minh JSON schema, confidence, Playbook ID và step number.
6. Nếu đạt guardrail, trả hướng dẫn lấy từ Playbook.
7. Nếu không đạt, tạo/giữ ticket và chuyển HelpDesk.

Tài khoản, credential, bảo mật, malware, mất dữ liệu, BSOD, BIOS, server, switch, firewall, quyền admin và phần cứng nguy hiểm luôn cần escalation phù hợp.

## Cloud AI Router

Route mặc định:

```text
Gemini → Groq → OpenRouter → SambaNova → Rules
```

Provider chỉ đủ điều kiện khi:

- `AI_CLOUD_ENABLED=true`;
- feature flag của provider bật;
- có API key server-side;
- circuit không chặn request;
- model nằm trong allowlist/config Backend.

Các tình huống có thể chuyển provider tiếp theo:

- timeout hoặc lỗi mạng;
- HTTP `429`/`5xx`;
- response không phải JSON hợp lệ;
- output không đạt schema/guardrail;
- confidence không đủ.

Khi HelpDesk chọn một provider cụ thể, provider đó được ưu tiên đầu tiên; từ v5.16.4 router vẫn failover sang cloud provider còn lại trước khi dùng Rules/Playbook fallback.

## Cấu hình mẫu

```env
AI_ROUTER_ENABLED=true
AI_PROVIDER_ORDER=gemini,groq,openrouter,sambanova
AI_ROUTING_POLICY=capability_then_free_quota
AI_CLOUD_ENABLED=true
AI_REDACTION_ENABLED=true

GEMINI_ENABLED=true
GEMINI_API_KEY=<SERVER_SIDE_SECRET>
GROQ_ENABLED=false
GROQ_API_KEY=<SERVER_SIDE_SECRET>
OPENROUTER_ENABLED=false
OPENROUTER_API_KEY=<SERVER_SIDE_SECRET>
SAMBANOVA_ENABLED=false
SAMBANOVA_API_KEY=<SERVER_SIDE_SECRET>
```

Không điền key thật vào tài liệu hoặc commit `.env`.

## Staff Copilot

Copilot được xếp hàng khi ticket handoff, người dùng xác nhận chưa xử lý được hoặc staff yêu cầu phân tích.

Một kết quả cloud hợp lệ cần có:

- Playbook fit: `matched`, `partial` hoặc `none`;
- nhiều giả thuyết độc lập, kèm lý do/confidence/cách kiểm chứng;
- nhiều hướng giải quyết, kèm bước, tín hiệu thành công, risk và stop condition;
- bản nháp phản hồi để kỹ thuật viên chỉnh sửa;
- provider/model yêu cầu và provider/model thực tế trong audit.

`matched/partial` có thể dùng chế độ `hybrid`; `none` dùng `ai_led`. Nội dung AI inference phải được phân biệt với bước Playbook nguyên văn.

## Playbook retrieval

Baseline lexical:

```env
PLAYBOOK_RETRIEVAL_MODE=lexical
PLAYBOOK_EMBED_PROVIDER=none
PLAYBOOK_TOP_K=5
PLAYBOOK_MIN_SCORE=0.20
PLAYBOOK_AUTO_MIN_SCORE=0.72
```

Hybrid tùy chọn:

```env
PLAYBOOK_RETRIEVAL_MODE=hybrid
PLAYBOOK_EMBED_PROVIDER=gemini
PLAYBOOK_EMBED_MODEL=gemini-embedding-001
PLAYBOOK_AUTO_INDEX=true
```

Embedding lỗi phải quay về BM25 lexical; không được làm ticket thất bại.

## Quota và observability

Admin **Hệ thống & AI** có thể hiển thị:

- provider readiness/eligibility;
- model và attempt gần đây;
- request/token app đã quan sát;
- quota header khi nhà cung cấp thực sự trả;
- lỗi gần nhất và circuit state.

Thiếu quota header nghĩa là `unknown`, không phải `0`. Không suy diễn provider hết quota chỉ từ việc không có số liệu.

## Data boundary

- Redaction phải bật trước dữ liệu thật.
- Chỉ gửi dữ liệu tối thiểu cần thiết tới provider.
- Không gửi password, OTP, key, cookie hoặc file nhạy cảm vào prompt.
- Employee API/UI không nhận provider, model, confidence, retrieval score hoặc Copilot runs.
- Reasoning hiển thị cho staff là tóm tắt có thể kiểm chứng, không phải chain-of-thought thô.

## API boundary

- Public/employee endpoint chỉ trả dữ liệu được phép cho chủ ticket.
- `/api/staff/.../copilot` yêu cầu staff session.
- `viewer` không được tạo Copilot run hoặc gửi phản hồi.
- Provider/model từ client phải được kiểm tra bằng allowlist Backend.

## Health

`GET /health` trả:

- `version: 5.18.6`;
- AI router/provider state;
- Playbook retrieval/index/governance;
- feature flags liên quan AI/Copilot;
- quota/circuit đã làm sạch.

Health không trả API key hoặc prompt nhạy cảm.

## Validation

```powershell
cd .\backend
npm run check
npm test
npm run playbook:benchmark
```

Các test quan trọng:

- all-provider failure vẫn tạo ticket/handoff;
- provider ưu tiên lỗi thì cloud failover tiếp;
- schema/confidence/risk guardrail;
- Copilot không rò sang employee response;
- quota header thiếu được biểu diễn `unknown`;
- redaction loại dữ liệu nhạy cảm.

## Rollback an toàn

```env
AI_ROUTER_ENABLED=false
AI_CLOUD_ENABLED=false
AI_PROVIDER=rules
AGENT_MODE=rules
PLAYBOOK_RETRIEVAL_MODE=lexical
PLAYBOOK_EMBED_PROVIDER=none
```

Rollback AI không yêu cầu xóa ticket, Playbook hoặc database. Xem [Enterprise Playbook](./README_ENTERPRISE_PLAYBOOK.md), [System Overview](../architecture/SYSTEM_OVERVIEW.md) và [Security](../security/SECURITY_GUIDE.md).
