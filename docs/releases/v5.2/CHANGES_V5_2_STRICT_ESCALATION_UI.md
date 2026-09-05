# IT HelpDesk v5.2 — Strict Escalation & UI Refresh

> [!NOTE]
> Đây là hồ sơ phát hành lịch sử. Nội dung phản ánh hệ thống tại thời điểm phiên bản này được phát hành và có thể đã được bản mới thay thế. Khi vận hành hiện tại, xem [Trung tâm tài liệu](../../INDEX.md).


## 1. Chính sách Agent mới: không suy đoán

Agent chỉ hướng dẫn người dùng khi đồng thời đáp ứng tất cả điều kiện:

- Tìm thấy Enterprise Playbook phù hợp với tình huống.
- Procedure đang hoạt động, dành cho employee và được đánh dấu `autoEligible`.
- Mức rủi ro không phải `high`.
- Điểm Playbook tối thiểu đạt `PLAYBOOK_AUTO_MIN_SCORE`.
- Confidence của Agent đạt `AGENT_MIN_CONFIDENCE`.
- Ollama trả về kết quả hợp lệ và chọn đúng Playbook ID.

Nếu thiếu bất kỳ điều kiện nào, hệ thống sẽ:

- Không đưa checklist mơ hồ.
- Không hỏi vòng vo để trì hoãn handoff.
- Không dùng Knowledge Base đơn lẻ để tự hướng dẫn.
- Chuyển ticket về `open` để kỹ thuật viên tiếp nhận ngay.
- Lưu rõ `escalationCode` và nguyên nhân quyết định.

Các mã escalation:

- `no_playbook_match`
- `playbook_not_auto_eligible`
- `low_confidence`
- `agent_unavailable`
- `policy_blocked`

## 2. Giao diện Mini App mới

- Header, điều hướng dưới và màn hình tải được làm lại hoàn toàn.
- Trang chủ có hero, thống kê ticket, cảnh báo SLA và thông điệp Strict Mode.
- Danh sách ticket có tìm kiếm, bộ lọc, badge trạng thái, priority, SLA và escalation.
- Form tạo ticket chia thành ba bước rõ ràng, có mẫu lỗi thường gặp và vùng kéo/chọn file.
- Chi tiết ticket hiển thị quyết định Agent, nguồn Playbook, SLA, hội thoại, file, reopen, rating và history.
- Trang thông báo và hồ sơ được thiết kế lại cho thao tác một tay trên điện thoại.
- Responsive cho màn hình nhỏ trong Zalo WebView.

## 3. Giao diện Admin mới

- Login portal dạng split-screen.
- Sidebar cố định với trạng thái AI Agent và Playbook.
- Dashboard ticket có KPI, Strict Mode banner, tìm kiếm và bộ lọc đa chiều.
- Ticket workspace hai cột: thông tin, SLA, quyết định Agent, hội thoại, điều phối, file, rating và lịch sử.
- Tab Playbook có health cards, semantic search và hiển thị auto-eligible/technician-only.
- Tab AI Agent hiển thị chính sách Strict Mode, model, Ollama, confidence threshold và sandbox test.
- Responsive thành bottom navigation trên màn hình nhỏ.

## 4. Cấu hình mới

```env
AGENT_STRICT_ESCALATION=true
AGENT_REQUIRE_PLAYBOOK=true
AGENT_MIN_CONFIDENCE=0.82
PLAYBOOK_AUTO_MIN_SCORE=0.72
```

Model mặc định:

```env
OLLAMA_MODEL=qwen3.5:9b
OLLAMA_TIMEOUT_MS=180000
```

## 5. Kiểm thử

- Backend syntax check: đạt.
- Admin JavaScript syntax check: đạt.
- 10 unit tests: đạt.
- Mini App TypeScript validation: đạt.
- Smoke test `/health` và `/admin`: đạt.
