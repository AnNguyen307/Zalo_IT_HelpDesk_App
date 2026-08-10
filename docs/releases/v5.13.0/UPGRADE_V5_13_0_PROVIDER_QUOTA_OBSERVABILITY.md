# Upgrade v5.13.0 — Provider Quota Observability

Sau khi v5.13.0 được merge vào `main`, tại máy Windows:

```powershell
git switch main
git pull --ff-only origin main
git log -1 --oneline

cd .\backend
npm ci
npm start
```

Không có migration mới; không cần chạy `npm run db:migrate` nếu schema hiện tại đã là version `9`.

Kiểm tra `/health`:

```json
{
  "version": "5.13.0"
}
```

Các feature cần có:

```text
provider-quota-observability
quota-header-null-safety
provider-readiness-diagnostics
```

Mở Admin, nhấn `Ctrl+F5`, vào **AI Agent** và chọn **Kiểm tra lại**. Mỗi provider phải hiển thị readiness, usage phiên backend, quota/ngân sách khả dụng, lỗi gần nhất và circuit. Với Gemini không có quota header, giao diện phải ghi `Không xác định`; model vẫn sẵn sàng sau request thành công.

Nếu API key từng xuất hiện trong ảnh, chat, log hoặc repository, thu hồi key cũ trong console provider, tạo key mới, cập nhật `backend/.env` rồi restart backend. Không commit `.env`.
