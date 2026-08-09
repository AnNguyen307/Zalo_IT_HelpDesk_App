# Enterprise Playbook RAG

## Cách hoạt động

```text
Ticket và lịch sử trao đổi
        ↓
Lọc audience=employee
        ↓
BM25 lexical search
        ↓
Optional Gemini embedding hybrid score
        ↓
Cloud AI chọn sourceId và stepNumbers
        ↓
Backend xác minh và lấy bước thật từ Playbook
        ↓
Trả lời người dùng hoặc escalation
```

Playbook nội bộ được ưu tiên hơn Knowledge Base và kiến thức chung của model. AI không được tự viết lệnh kỹ thuật nằm ngoài nguồn đã duyệt. Khi cloud AI không sẵn sàng, Rules/HelpDesk fallback vẫn hoạt động.

## Cài baseline trên Windows

Chạy:

```text
scripts\windows\launchers\INSTALL_ENTERPRISE_PLAYBOOK.bat
```

Hoặc trong VS Code:

```text
Terminal → Run Task → HelpDesk: Cai dat Enterprise Playbook
```

Script sẽ:

1. Đặt retrieval về `lexical` và embedding provider về `none`.
2. Giữ nguyên secret hiện có trong `backend/.env` và tạo file backup.
3. Chạy benchmark Playbook Top-K.

Không cần tải model hoặc khởi động thêm AI service trên máy backend.

## Bật hybrid bằng Gemini embedding

```env
AI_CLOUD_ENABLED=true
GEMINI_ENABLED=true
GEMINI_API_KEY=your-server-side-key
PLAYBOOK_RETRIEVAL_MODE=hybrid
PLAYBOOK_EMBED_PROVIDER=gemini
PLAYBOOK_EMBED_MODEL=gemini-embedding-001
PLAYBOOK_AUTO_INDEX=true
```

Sau đó chạy `npm run playbook:index:force`. Nếu embedding/index lỗi, search tự quay về BM25.

## Trạng thái mong đợi

Mở `http://127.0.0.1:8080/health`. Với baseline:

```json
{
  "retrievalMode": "lexical",
  "embeddingProvider": "none",
  "semanticEnabled": false,
  "ready": true
}
```

## Dashboard và cập nhật procedure

Mở `/admin`, đăng nhập và chọn tab `Enterprise Playbook`. Có thể tìm thử theo mô tả ticket, kiểm tra audience/category và re-index sau khi sửa Playbook.

File nguồn mặc định: `backend/playbooks/enterprise-playbook.json`.

```powershell
cd backend
npm run playbook:benchmark
```

## Quy tắc dữ liệu

- Chỉ thêm nội dung đã được IT phê duyệt.
- Không copy raw config có secret vào JSON.
- Mỗi procedure phải có `id`, `title`, `audience`, `risk`, `approved`, `active`, `requiredQuestions`, `steps`, `forbiddenSteps` và `keywords`.
- Dùng `audience=employee` chỉ cho bước an toàn mà người dùng phổ thông được phép thực hiện.
- Dùng `audience=technician` cho lệnh hạ tầng, quyền admin và thay đổi cấu hình.
