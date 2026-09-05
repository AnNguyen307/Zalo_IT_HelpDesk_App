# Hướng dẫn nâng cấp IT HelpDesk lên v5.2

> [!NOTE]
> Đây là hồ sơ phát hành lịch sử. Nội dung phản ánh hệ thống tại thời điểm phiên bản này được phát hành và có thể đã được bản mới thay thế. Khi vận hành hiện tại, xem [Trung tâm tài liệu](../../INDEX.md).


Bản patch v5.2 là bản tích lũy, có thể áp dụng trên dự án v4 hoặc v5 hiện tại. Patch bao gồm Enterprise Playbook, AI autostart, thứ tự khởi động Ollama, Strict Escalation và giao diện mới.

## 1. Dừng hệ thống

Trong các terminal Backend, ngrok và Ollama, nhấn `Ctrl + C`.

## 2. Sao lưu dữ liệu

```powershell
cd "C:\Users\ADMIN\Downloads\Zalo_IT_HelpDesk_Zero_Cost_v2\zalo-helpdesk-ai"

Copy-Item ".\backend\data\db.json" `
  ".\backend\data\db-before-v5.2.json" `
  -Force

if (Test-Path ".\backend\data\uploads") {
  Copy-Item ".\backend\data\uploads" `
    ".\backend\data\uploads-before-v5.2" `
    -Recurse `
    -Force
}
```

## 3. Giải nén patch

```powershell
Expand-Archive `
  -Path "C:\Users\ADMIN\Downloads\Zalo_IT_HelpDesk_v5.2_Strict_Escalation_UI_Patch.zip" `
  -DestinationPath "C:\Users\ADMIN\Downloads\Zalo_IT_HelpDesk_Zero_Cost_v2" `
  -Force
```

Patch không ghi đè:

- `backend/.env`
- `miniapp/.env`
- `backend/data/db.json`
- thư mục upload
- semantic index đang có

## 4. Chuẩn hóa cấu hình Agent

Chạy script sau để xóa các biến `.env` trùng, bật Strict Mode và kiểm tra model:

```powershell
cd "C:\Users\ADMIN\Downloads\Zalo_IT_HelpDesk_Zero_Cost_v2\zalo-helpdesk-ai"

powershell.exe `
  -NoProfile `
  -ExecutionPolicy Bypass `
  -File ".\scripts\windows\install-ai-agent.ps1" `
  -Model "qwen3.5:9b" `
  -TimeoutSeconds 180
```

Cấu hình cần có đúng một dòng cho mỗi key:

```env
AGENT_MODE=ollama
AGENT_STRICT_ESCALATION=true
AGENT_REQUIRE_PLAYBOOK=true
AGENT_MIN_CONFIDENCE=0.82
AUTO_RESOLVE_THRESHOLD=0.78
PLAYBOOK_AUTO_MIN_SCORE=0.72
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3.5:9b
OLLAMA_TIMEOUT_MS=180000
```

## 5. Cài hoặc cập nhật Enterprise Playbook index

```powershell
.\scripts\windows\launchers\INSTALL_ENTERPRISE_PLAYBOOK.bat
```

Script sẽ kiểm tra `embeddinggemma` và tạo semantic index.

## 6. Reload VS Code và khởi động

```text
Ctrl + Shift + P
→ Developer: Reload Window
```

Sau đó:

```text
Ctrl + Shift + B
→ HelpDesk: Khởi động toàn bộ
```

Các terminal cần xuất hiện:

- HelpDesk: Ollama AI
- HelpDesk: Backend
- HelpDesk: ngrok
- HelpDesk: Đồng bộ URL + Deploy

## 7. Build và deploy giao diện Mini App

Do giao diện người dùng đã thay đổi, cần deploy một lần:

```powershell
cd ".\miniapp"
npm install
npm run deploy
```

Chọn phiên bản `Development` để kiểm tra trước.

## 8. Kiểm tra Admin UI

Mở:

```text
https://URL-NGROK-HIEN-TAI/admin
```

Nhấn `Ctrl + F5` để bỏ cache CSS/JavaScript cũ.

## 9. Xác nhận Strict Mode

Kiểm tra:

```powershell
$health = Invoke-RestMethod "http://127.0.0.1:8080/health"
$health.agent | ConvertTo-Json -Depth 6
```

Phải có:

```json
{
  "ready": true,
  "policy": {
    "strictEscalation": true,
    "requirePlaybook": true,
    "minimumConfidence": 0.82,
    "playbookMinimumScore": 0.72
  }
}
```

## 10. Kiểm thử hai tình huống

Tình huống có Playbook:

```text
Máy in Ricoh báo Offline, máy vẫn bật và không có mã SC.
```

Agent chỉ hướng dẫn khi match đủ điều kiện.

Tình huống ngoài Playbook:

```text
Một thiết bị chuyên dụng mới phát tiếng lạ và dừng ngẫu nhiên.
```

Kết quả phải là `ESCALATE`, không có checklist suy đoán.

Lưu ý: phản hồi cũ đã lưu trong ticket không thay đổi. Hãy tạo ticket mới để kiểm tra chính sách v5.2.
