# Hướng dẫn nâng cấp IT HelpDesk v5 - Enterprise Playbook RAG

## 1. Sao lưu dữ liệu

```powershell
cd "C:\Users\ADMIN\Downloads\Zalo_IT_HelpDesk_Zero_Cost_v2\zalo-helpdesk-ai"

Copy-Item ".\backend\data\db.json" `
  ".\backend\data\db-before-v5.json" `
  -Force

if (Test-Path ".\backend\data\uploads") {
  Copy-Item ".\backend\data\uploads" `
    ".\backend\data\uploads-before-v5" `
    -Recurse `
    -Force
}
```

Dừng terminal backend bằng `Ctrl + C` trước khi giải nén patch.

## 2. Giải nén patch

```powershell
Expand-Archive `
  -Path "C:\Users\ADMIN\Downloads\Zalo_IT_HelpDesk_v5_Enterprise_Playbook_RAG_Patch.zip" `
  -DestinationPath "C:\Users\ADMIN\Downloads\Zalo_IT_HelpDesk_Zero_Cost_v2" `
  -Force
```

Patch có thư mục gốc `zalo-helpdesk-ai`, nên giải nén vào thư mục `Zalo_IT_HelpDesk_Zero_Cost_v2`.

Patch không chứa và không ghi đè:

- `backend/.env`
- `miniapp/.env`
- `backend/data/db.json`
- `backend/data/uploads/`
- `backend/data/playbook-index.json`

## 3. Cài model embedding và tạo index

Đảm bảo Ollama đang chạy và `qwen3.5:9b` vẫn dùng được. Từ thư mục dự án, chạy:

```powershell
.\scripts\windows\launchers\INSTALL_ENTERPRISE_PLAYBOOK.bat
```

Hoặc trong VS Code:

```text
Terminal → Run Task → HelpDesk: Cai dat Enterprise Playbook
```

Script tự tìm Ollama trong PATH, thư mục mặc định Windows và `E:\Ollama`.

Kết quả đúng:

```text
[OK] Embedding model already installed: embeddinggemma
[OK] backend/.env updated
[OK] Enterprise Playbook is ready.
```

Lần đầu tạo index có thể mất vài phút tùy CPU/GPU.

## 4. Restart backend

```powershell
cd ".\backend"
npm start
```

Không cần build hoặc deploy lại Zalo Mini App vì frontend Mini App không thay đổi.

## 5. Kiểm tra health

```powershell
$health = Invoke-RestMethod "http://127.0.0.1:8080/health"
$health.agent | ConvertTo-Json -Depth 5
$health.playbook | ConvertTo-Json -Depth 5
```

Yêu cầu:

```text
agent.mode = ollama
agent.model = qwen3.5:9b
agent.ready = true
playbook.ready = true
playbook.totalEntries = 173
playbook.indexCurrent = true
playbook.embedModel = embeddinggemma
```

## 6. Kiểm tra Dashboard

Mở:

```text
https://URL-NGROK-HIEN-TAI/admin
```

Chọn tab `Enterprise Playbook`, tìm thử:

```text
Máy dùng dây LAN nhận 169.254 và không vào Internet
```

Audience `employee` nên ưu tiên procedure `VS-NET-U02`.

Tìm thử audience `technician`:

```text
Guest Wi-Fi VLAN80 có IP nhưng không ra Internet
```

Kết quả nên có procedure `VS-INF-009`.

## 7. Kiểm tra ticket thật

Tạo ticket mới:

```text
Máy đang dùng dây LAN, nhận địa chỉ 169.254.20.8.
Các máy khác trong phòng vẫn có mạng.
```

Phản hồi mới cần hiển thị nguồn gần giống:

```text
Nguồn Playbook: VS-NET-U02 v1.0
```

Ticket cũ giữ nguyên phản hồi đã lưu và không tự chạy lại AI.

## 8. Khi sửa playbook

Sau khi chỉnh `backend/playbooks/enterprise-playbook.json`:

```powershell
cd backend
npm run playbook:index:force
```

Sau đó restart backend. Không đưa raw Aruba/FortiGate/OS9700 config hoặc secret vào playbook.
