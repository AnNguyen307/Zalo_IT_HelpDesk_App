# Upgrade v5.12.0 — Copilot Independent Reasoning

## Nâng cấp

Sau khi mã v5.12.0 có trên `main`, tại máy Windows:

```powershell
git switch main
git pull --ff-only origin main

cd .\backend
npm ci
npm start
```

Không có migration mới. Database phải đang ở schema version `9` từ v5.11.0.

## Xác minh

`GET /health` phải trả:

```json
{
  "version": "5.12.0",
  "features": [
    "copilot-independent-reasoning",
    "copilot-no-playbook-analysis",
    "copilot-multi-path-solutions"
  ]
}
```

Hard refresh `/admin`, sau đó smoke test:

1. Ticket có Playbook: hiển thị `HYBRID`, bước Playbook và các hướng AI độc lập.
2. Ticket không khớp: hiển thị `AI-LED`, `KHÔNG KHỚP`, không có bước Playbook giả và vẫn có nhiều hướng xử lý.
3. Mỗi hướng có tín hiệu thành công, điều kiện dừng/chuyển cấp và mức rủi ro.
4. User/Mini App không đọc được bất kỳ nội dung Copilot nào.
5. Tắt cloud provider: run chuyển `RULES FALLBACK` và nói rõ chưa có phân tích độc lập.

Không cần deploy lại Mini App chỉ để nhận giao diện Copilot v5.12.0; giao diện này nằm trong backend Admin.
