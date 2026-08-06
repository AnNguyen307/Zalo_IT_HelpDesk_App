# Enterprise Playbook RAG

## Cách hoạt động

```text
Ticket và lịch sử trao đổi
        ↓
Lọc audience=employee
        ↓
Lexical search + embeddinggemma semantic search
        ↓
Top procedure phù hợp
        ↓
Qwen/Ollama chọn sourceId và stepNumbers
        ↓
Backend xác minh và lấy bước thật từ playbook
        ↓
Trả lời người dùng hoặc escalation
```

Playbook nội bộ được ưu tiên hơn Knowledge Base và kiến thức chung của model. AI không được tự viết lệnh kỹ thuật nằm ngoài nguồn đã duyệt.

## Cài đặt trên Windows

Đảm bảo Ollama đang chạy tại `http://127.0.0.1:11434`, sau đó chạy:

```text
INSTALL_ENTERPRISE_PLAYBOOK.bat
```

Hoặc trong VS Code:

```text
Terminal → Run Task → HelpDesk: Cai dat Enterprise Playbook
```

Script sẽ:

1. Tìm `ollama.exe`, bao gồm vị trí `E:\Ollama`.
2. Tải `embeddinggemma` nếu chưa có.
3. Chuẩn hóa các biến PLAYBOOK trong `backend/.env`.
4. Chạy `npm run playbook:index:force`.

Restart backend sau khi hoàn tất.

## Trạng thái mong đợi

Mở:

```text
http://127.0.0.1:8080/health
```

Phần `playbook` cần có:

```json
{
  "enabled": true,
  "totalEntries": 173,
  "semanticEnabled": true,
  "embedModel": "embeddinggemma",
  "indexExists": true,
  "indexCurrent": true,
  "ready": true
}
```

## Dashboard Admin

Mở `/admin`, đăng nhập và chọn tab `Enterprise Playbook`.

Có thể:

- Xem số procedure theo audience/category.
- Tìm thử theo câu mô tả ticket.
- Chọn `employee` hoặc `technician`.
- Xem điểm lexical/semantic và các bước tương ứng.
- Re-index sau khi sửa playbook.

## Cập nhật procedure

File chính:

```text
backend/playbooks/enterprise-playbook.json
```

Sau khi sửa:

```powershell
cd backend
npm run playbook:index:force
```

Sau đó restart backend hoặc bấm `Re-index` trong Dashboard.

## Quy tắc dữ liệu

- Chỉ thêm nội dung đã được IT phê duyệt.
- Không copy raw config có secret vào JSON.
- Mỗi procedure phải có `id`, `title`, `audience`, `risk`, `approved`, `active`, `requiredQuestions`, `steps`, `forbiddenSteps` và `keywords`.
- Dùng `audience=employee` chỉ cho bước an toàn mà người dùng phổ thông được phép thực hiện.
- Dùng `audience=technician` cho lệnh hạ tầng, quyền admin và thay đổi cấu hình.
