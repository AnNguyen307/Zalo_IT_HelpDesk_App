# IT HelpDesk v5.0 - Enterprise Playbook RAG

## Mục tiêu

Thay vì để AI trả lời chủ yếu từ kiến thức chung, phiên bản này ưu tiên quy trình nội bộ đã được duyệt theo thứ tự:

1. Quy tắc an toàn.
2. Enterprise Playbook.
3. Knowledge Base ngắn.
4. Suy luận của Ollama.
5. Escalation cho kỹ thuật viên.

## Nội dung đã bổ sung

- `backend/playbooks/enterprise-playbook.json`: 173 procedure đã chuẩn hóa.
  - 25 procedure an toàn dành cho nhân viên.
  - 12 procedure hạ tầng được tùy biến theo mô hình VS/Samho.
  - 136 runbook kỹ thuật viên được chuyển từ playbook gốc.
- `backend/src/playbook.mjs`: tìm kiếm lexical và semantic bằng Ollama embeddings.
- Model embedding mặc định: `embeddinggemma`.
- AI Agent chỉ nhận procedure `audience=employee` khi phản hồi người dùng.
- Procedure `audience=technician` chỉ hiển thị trong Dashboard Admin.
- AI chỉ chọn `sourceId` và số bước tồn tại; backend lấy nội dung bước thật từ playbook.
- Dashboard Admin có tab `Enterprise Playbook` để kiểm tra trạng thái, tìm thử và re-index.
- API quản trị mới:
  - `GET /api/admin/playbook/status`
  - `GET /api/admin/playbook/entries`
  - `GET /api/admin/playbook/search`
  - `POST /api/admin/playbook/reindex`
- `/health` hiển thị trạng thái playbook và semantic index.
- Script Windows `INSTALL_ENTERPRISE_PLAYBOOK.bat` tự tải embedding model, cập nhật `.env` và tạo index.

## Tùy biến hạ tầng doanh nghiệp

Playbook ghi nhận các nguyên tắc vận hành từ snapshot được cung cấp:

- OS9700 là gateway L3 chính của phần lớn mạng nội bộ.
- FortiGate port1 `192.168.1.230/22` là firewall LAN, không phải gateway lõi.
- Aruba3600 `192.168.0.5` là controller trên VLAN100.
- VLAN10 dùng gateway `192.168.10.1`; Aruba `192.168.10.240` là địa chỉ controller trong subnet.
- VLAN80 dùng Aruba `192.168.80.1` làm gateway/DHCP cho Guest Wi-Fi.
- VLAN90 dùng Aruba `192.168.90.1` làm gateway/DHCP theo cấu hình, nhưng trạng thái route/VAP cần xác minh trước khi đưa vào production.
- Không tự cấp IP tĩnh trong các dải DHCP động của Aruba.

## Bảo mật

- Không đưa raw Aruba/FortiGate/OS9700 config vào semantic index.
- Không lưu Wi-Fi passphrase, RADIUS key, SNMP community, admin hash hoặc pre-shared secret trong playbook.
- Những thao tác hạ tầng, quyền admin, account/security, BSOD/BIOS và tình huống nhiều người dùng luôn được escalation.

## Tương thích

- Không thay đổi schema ticket hiện tại.
- Không ghi đè `backend/.env`, `miniapp/.env`, `backend/data/db.json` hoặc file upload khi dùng patch.
- Không cần build/deploy lại Zalo Mini App vì thay đổi nằm ở backend và Dashboard Admin.
