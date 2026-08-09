# Project Handoff — Zalo IT HelpDesk

> Tài liệu bàn giao sống (single source of continuity) cho người và AI agent tiếp tục phát triển dự án.
> Phải cập nhật file này khi bắt đầu/kết thúc một phiên bản lớn, trước khi bàn giao giữa chừng, và trước khi merge release.

## 1. Trạng thái hiện tại

| Trường | Giá trị |
|---|---|
| Repository | `AnNguyen307/Zalo_IT_HelpDesk_App` |
| Nhánh chuẩn | `main` |
| Phiên bản | `5.8.0` |
| Trạng thái | Đã hoàn tất mã nguồn và kiểm thử; phát hành cùng PR v5.8.0 |
| Nhánh phát triển | `agent/ai-quality-cloud-ready-v5.8.0` |
| Baseline đã phát hành | v5.7.4, PR #10, commit `691105b2` |
| Database migration | Không cần cho v5.8.0 |
| Backend validation | `npm run check` đạt; `65/65` test đạt |
| Mini App validation | Production build đạt |
| Cập nhật lần cuối | 2026-08-09 (Asia/Ho_Chi_Minh) |

Endpoint pilot hiện tại: `https://7ae2-14-164-186-7.ngrok-free.app`.

Lưu ý: ngrok là endpoint tạm theo môi trường. Không ghi cứng URL này vào mã nghiệp vụ. Mini App nhận `VITE_API_BASE_URL` ở build time; phải build/deploy lại khi endpoint thay đổi. Tại lần kiểm tra trước phát hành v5.8.0, endpoint vẫn phục vụ backend v5.7.4.

## 2. Mục tiêu và kiến trúc

Zalo IT HelpDesk là hệ thống ticket nội bộ gồm:

- Zalo Mini App để nhân viên tạo ticket, phản hồi, đính kèm file và theo dõi trạng thái.
- Backend Node.js 20 phục vụ API, Admin Dashboard và nghiệp vụ HelpDesk.
- JSON hoặc SQL Server store; attachment hiện vẫn nằm trên filesystem của backend.
- Enterprise Playbook RAG, rule engine, Ollama local và Gemini staging qua AI Router.
- SLA, queue, notification, staff account/RBAC, audit, reporting và Playbook Governance.

Luồng AI v5.8.0:

```text
Ticket/message
  → Rules + Retrieval Top-K nội bộ
  → AI Router (rules | ollama | gemini staging)
  → Redaction trước provider cloud
  → Guardrail backend
  → Decision record + Audit Log
  → Hướng dẫn từ Playbook hoặc handoff kỹ thuật viên
  → Admin đánh giá Đúng/Cần sửa
```

Các module v5.8.0 quan trọng:

- `backend/src/ai-router.mjs`: provider contract, status và request Rules/Ollama/Gemini.
- `backend/src/ai-redaction.mjs`: che credential, token, email, số điện thoại và IP trước cloud.
- `backend/src/ai-quality.mjs`: decision record, review validation và quality report.
- `backend/src/ai-agent.mjs`: retrieval, guardrail và orchestration.
- `backend/src/server.mjs`: API ticket, audit, quality dashboard và Admin review.
- `backend/public/admin.*`: AI Control Plane và giao diện review.
- `docs/releases/v5.8.0/CHANGES_V5_8_0_AI_QUALITY_CONTROL.md`: release note chi tiết.

## 3. Guardrail bắt buộc

Không được thay đổi các nguyên tắc sau nếu chưa có quyết định rõ ràng của chủ dự án:

1. Ticket phải luôn tạo được khi Rules, Ollama hoặc cloud AI lỗi.
2. Priority mặc định là `normal` (**Bình thường**).
3. AI chỉ đổi priority khi `priorityDetermined=true` và giá trị hợp lệ.
4. AI chỉ đề xuất; backend/Playbook áp guardrail và con người giữ quyền quyết định cuối.
5. Không có Playbook phù hợp, confidence thấp, provider lỗi hoặc rủi ro cao phải handoff kỹ thuật viên.
6. AI không tự đóng ticket, không thực thi lệnh trên máy người dùng và không sinh checklist ngoài Enterprise Playbook đã duyệt.
7. Không gửi toàn bộ Playbook hoặc ticket nguyên bản ra cloud; retrieval chạy trước, sau đó chỉ gửi payload tối thiểu đã redaction.
8. API key/secret chỉ ở backend environment hoặc secret store; không đưa vào Mini App, Admin JavaScript, Git hay tài liệu có giá trị thật.
9. Provider mới phải có feature flag, failure tests và đường rollback.
10. Không gộp migration AI, database, object storage và backend hosting thành một lần chuyển đổi.

## 4. Cấu hình AI v5.8.0

Mặc định production/local:

```env
AI_PROVIDER=ollama
AI_CLOUD_ENABLED=false
AI_REDACTION_ENABLED=true
AI_QUALITY_RETENTION_DAYS=180
```

`AGENT_MODE=rules|ollama` vẫn là alias tương thích ngược. Cloud staging chỉ bật khi có phê duyệt dữ liệu:

```env
AI_PROVIDER=gemini
AI_CLOUD_ENABLED=true
AI_REDACTION_ENABLED=true
GEMINI_API_KEY=server-side-only
GEMINI_MODEL=gemini-3.6-flash
```

Rollback nhanh:

```env
AI_PROVIDER=ollama
AI_CLOUD_ENABLED=false
```

Nếu Gemini bị tắt, thiếu key, timeout hoặc lỗi response, hệ thống phải tạo ticket với priority `normal`, không đưa checklist suy đoán và handoff kỹ thuật viên.

## 5. Chức năng đã có đến v5.8.0

- Ticket/message/attachment, timeline, reopen, satisfaction và notification.
- Staff account, role-based access và xử lý lỗi tài khoản trùng.
- SLA theo giờ làm việc, pause/resume, overdue reminder và smart queues.
- Operations dashboard, workload/reporting và CSV export.
- Playbook lifecycle: Draft → Review → Published → Rollback, reindex và đề xuất từ kỹ thuật viên.
- Enterprise Playbook RAG, lexical/semantic retrieval và strict escalation.
- AI Router cho `rules`, `ollama`, `gemini` staging.
- Decision telemetry: `decisionId`, provider, model, confidence, latency, outcome, escalation, redaction count và usage khi có.
- Admin quality review: Đúng/Cần sửa, correction category/priority/risk và audit/history.
- AI quality dashboard: review coverage, reviewed accuracy, escalation rate, provider unavailable, latency và nhóm lỗi.

## 6. API và dữ liệu v5.8.0

Endpoint mới chính:

- `GET /api/admin/ai-quality?days=30`: báo cáo chất lượng AI cho staff.
- `POST /api/admin/tickets/:ticketId/ai-review`: Admin review decision hiện tại; chống stale `decisionId`.
- `GET /api/admin/agent/status`: trạng thái provider/control plane.
- `GET /health`: phải trả `version: 5.8.0` sau restart.

Không có schema migration cho v5.8.0:

- Decision mới nhất nằm trong `ticket.aiAnalysis.quality`.
- Lịch sử decision/review dùng Audit Log hiện có.
- JSON và SQL Server tiếp tục lưu `aiAnalysis` dạng JSON.

## 7. Cách kiểm tra trước khi tiếp tục hoặc phát hành

Luôn bắt đầu bằng:

```bash
git status -sb
git log -1 --oneline
git diff --check
```

Backend:

```bash
cd backend
npm run check
npm test
```

Mini App:

```bash
cd miniapp
npm run build
```

Không commit `.env`, API key, token, database local, upload hoặc cache/build rác. Kiểm tra URL build từ `miniapp/.env`; `miniapp/app-config.json` chỉ nên thay đổi theo output build hợp lệ.

Sau deploy backend:

```powershell
$health = Invoke-RestMethod "https://7ae2-14-164-186-7.ngrok-free.app/health"
$health | Select-Object ok, version
```

Kết quả v5.8.0 cần là `ok=True`, `version=5.8.0`. Sau đó nghiệm thu một ticket bình thường, một failure/fallback AI, Admin review và quality dashboard.

## 8. Trình tự deploy v5.8.0

1. Pull `main` sau khi PR v5.8.0 được merge.
2. Giữ `AI_CLOUD_ENABLED=false`; dùng Rules/Ollama cho production hiện tại.
3. Restart backend và kiểm tra `/health` là v5.8.0.
4. Xác nhận SQL Server/JSON store, Playbook và Ollama theo cấu hình đều healthy.
5. Build/deploy lại Zalo Mini App vì API base URL được đóng gói ở build time.
6. Mở Admin → AI Agent, kiểm tra provider status và quality dashboard.
7. Chỉ bật Gemini ở staging sau khi phê duyệt policy/retention; rollback bằng cấu hình ở mục 4.

## 9. Hướng phát triển tiếp theo

Ưu tiên đã thống nhất:

- v5.9: chuẩn hóa lexical retrieval, embedding abstraction, benchmark Top-K và loại Ollama khỏi dependency production bắt buộc.
- v6.0: repository refactor theo nghiệp vụ, PostgreSQL, private Object Storage, migration đối soát, backup/restore test.
- v6.1: Docker/always-on backend, stable HTTPS domain, job locking/worker, `ZALO_AUTH_MODE=remote`, cloud API cho Mini App.
- v6.2: CI/CD backend, monitoring/alerting, secret rotation, rollback và audit retention.
- v6.3+: multi-instance, load balancing, queue/realtime khi số liệu tải thực tế yêu cầu.

Nợ kiến trúc cần nhớ:

- SQL Server store hiện chưa phù hợp nhiều backend instance nếu vẫn đồng bộ snapshot lớn.
- Attachment/index vẫn phụ thuộc filesystem local.
- SLA timer, reindex queue và cache vẫn nằm trong process; multi-instance cần DB lease/advisory lock hoặc worker riêng.
- Không dùng free tier sleeping/ephemeral filesystem cho production uptime.

## 10. Quy tắc cập nhật file bàn giao

Agent tiếp theo phải cập nhật chính file `PROJECT_HANDOFF.md`, không tạo thêm file handoff cạnh tranh.

Khi bắt đầu phiên bản lớn:

- Ghi version, branch, baseline, mục tiêu và trạng thái `Đang phát triển`.
- Ghi rõ phạm vi được phép, guardrail và migration dự kiến.
- Cập nhật mục “Việc đang làm dở” bên dưới sau mỗi checkpoint có ý nghĩa.

Trước khi dừng giữa chừng:

- Ghi file đã đổi, test đã chạy/kết quả, lỗi/blocker, quyết định còn mở và bước tiếp theo chính xác.
- Không ghi secret hoặc token.

Trước khi merge release:

- Đổi trạng thái thành `Đã hoàn tất mã nguồn và kiểm thử` hoặc `Đã phát hành`.
- Cập nhật test count, migration, deploy/rollback, endpoint hiện hành và release note.
- Xóa thông tin “đang làm dở” đã hoàn tất; giữ lại nợ kỹ thuật và rủi ro còn thật.

### Việc đang làm dở

- Không còn thay đổi mã v5.8.0 đang dở tại thời điểm lập tài liệu này.
- Sau merge cần pull `main`, restart backend, kiểm tra `/health`, rồi deploy lại Mini App với endpoint pilot hiện tại.
- Gemini vẫn là staging-only và tắt mặc định; chưa được bật production.
