# Zalo IT HelpDesk v5.6.0 — Human Handoff Conversation Lock

## Mục tiêu

Sau khi AI Agent quyết định `escalate`, AI chỉ được gửi **một thông báo bàn giao cuối cùng**. Từ đó trở đi, ticket chuyển sang chế độ `HUMAN ONLY`:

- AI không phân tích phản hồi mới.
- AI không tạo thêm message.
- AI không thay đổi category, priority, risk hoặc status dựa trên phản hồi mới.
- Hội thoại chỉ còn người dùng với Technician/Admin.
- Khóa vẫn được giữ khi ticket được mở lại.
- Không có API hoặc nút giao diện để tự động mở khóa AI trên ticket cũ. Muốn dùng AI lại phải tạo ticket mới.

Khóa cũng được kích hoạt khi Technician/Admin phản hồi, ticket được phân công cho nhân sự, hoặc được chuyển sang `in_progress`.

## Bảo vệ race condition

Backend kiểm tra khóa hai lần:

1. Trước khi gọi Ollama.
2. Bên trong transaction ghi dữ liệu.

Nếu kỹ thuật viên tham gia trong lúc Ollama đang phân tích, kết quả AI sẽ bị hủy và không được ghi vào hội thoại.

## Nâng cấp

### 1. Backup SQL Server

```sql
BACKUP DATABASE ZaloHelpDesk
TO DISK = N'C:\SQLBackup\ZaloHelpDesk-before-v5.6.bak'
WITH INIT, COMPRESSION, CHECKSUM, STATS = 10;
GO
```

### 2. Dừng backend

Nhấn `Ctrl + C` tại terminal đang chạy `npm start`.

### 3. Giải nén patch

```powershell
cd "C:\Users\ADMIN\Downloads\Zalo_IT_HelpDesk_Zero_Cost_v2\zalo-helpdesk-ai"

Expand-Archive `
  -Path "C:\Users\ADMIN\Downloads\Zalo_IT_HelpDesk_v5.6.0_Human_Handoff_Lock_Patch.zip" `
  -DestinationPath "C:\Users\ADMIN\Downloads\Zalo_IT_HelpDesk_Zero_Cost_v2" `
  -Force
```

Patch không chứa `.env`, database, uploads hoặc model Ollama.

### 4. Chạy migration SQL Server

Cách khuyến nghị trong PowerShell:

```powershell
cd ".\backend"
npm install
npm run db:migrate
```

Hoặc mở bằng SSMS và Execute toàn bộ:

```text
backend\sql\006_ai_handoff_conversation_lock.sql
```

Migration thêm các cột:

```text
ai_handoff_locked
ai_handoff_at
ai_handoff_reason
ai_handoff_by
ai_handoff_by_name
```

Migration tự backfill các ticket cũ đã được AI escalate hoặc đã có message của kỹ thuật viên.

Kiểm tra:

```sql
USE ZaloHelpDesk;
GO

SELECT
    COL_LENGTH(N'helpdesk.tickets', N'ai_handoff_locked') AS LockColumn,
    COL_LENGTH(N'helpdesk.tickets', N'ai_handoff_at') AS LockAtColumn;

SELECT version_number, description, applied_at
FROM helpdesk.schema_version
WHERE version_number = 6;

SELECT TOP (20)
    code,
    status,
    ai_handoff_locked,
    ai_handoff_at,
    ai_handoff_reason,
    ai_handoff_by_name
FROM helpdesk.tickets
ORDER BY updated_at DESC;
```

### 5. Kiểm tra backend

```powershell
npm run check
node --test ".\test\human-handoff-lock-v56.test.mjs"
npm start
```

Targeted test phải đạt `5/5`.

Kiểm tra health:

```powershell
$health = Invoke-RestMethod "http://127.0.0.1:8080/health"
$health.version
$health.features
```

Cần có:

```text
5.6.0
human-handoff-conversation-lock
ai-race-condition-guard
```

### 6. Làm mới Admin Dashboard

Mở `http://localhost:8080/admin` và nhấn `Ctrl + F5`.

### 7. Build/deploy Mini App

```powershell
cd "..\miniapp"
npm install
npm run build
zmp login
zmp deploy
```

Chọn `Testing` trong giai đoạn kiểm thử.

## Kiểm thử bắt buộc

### Case A — AI escalate ngay từ ticket mới

1. Tạo ticket không có Playbook phù hợp.
2. AI gửi thông báo bàn giao cuối cùng.
3. Người dùng gửi thêm hai phản hồi.
4. Số message AI không được tăng.
5. SQL phải có `ai_handoff_locked = 1`.

### Case B — Ban đầu AI hướng dẫn, sau đó Technician tham gia

1. Tạo ticket được AI guide.
2. Technician gửi một phản hồi.
3. Người dùng trả lời lại.
4. AI không được phản hồi tiếp.

### Case C — Race condition

1. Người dùng gửi phản hồi khiến Ollama phân tích lâu.
2. Trong lúc đó Technician gửi phản hồi hoặc nhận ticket.
3. Kết quả Ollama hoàn thành sau đó phải bị hủy.
4. Chỉ message của người dùng và kỹ thuật viên được lưu.

### Case D — Reopen

1. Resolve một ticket đã handoff.
2. Reopen ticket.
3. Người dùng gửi phản hồi.
4. AI vẫn không được quay lại.

## Truy vấn kiểm tra

```sql
USE ZaloHelpDesk;
GO

SELECT
    t.code,
    t.ai_handoff_locked,
    t.ai_handoff_reason,
    t.ai_handoff_at,
    SUM(CASE WHEN m.role = N'assistant' THEN 1 ELSE 0 END) AS AiMessages,
    SUM(CASE WHEN m.role = N'technician' THEN 1 ELSE 0 END) AS StaffMessages,
    SUM(CASE WHEN m.role = N'user' THEN 1 ELSE 0 END) AS UserMessages
FROM helpdesk.tickets AS t
LEFT JOIN helpdesk.messages AS m ON m.ticket_id = t.id
GROUP BY t.code, t.ai_handoff_locked, t.ai_handoff_reason, t.ai_handoff_at
ORDER BY t.ai_handoff_at DESC;
```
