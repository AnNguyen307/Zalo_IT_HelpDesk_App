# Tự động đồng bộ URL ngrok

> Chỉ dùng cho Development/Testing local. Production version `33` đang trỏ Render HTTPS cố định; không chạy công cụ này cho Production.

Khi tài khoản/gói ngrok cấp URL thay đổi sau mỗi lần chạy, Mini App cần được build và deploy lại vì `VITE_API_BASE_URL` được Vite nhúng vào JavaScript lúc build.

Script Windows sau tự thực hiện toàn bộ quy trình:

1. Kiểm tra và khởi động backend.
2. Kiểm tra và khởi động ngrok.
3. Đọc URL HTTPS hiện tại từ ngrok Agent API tại `127.0.0.1:4040`.
4. Kiểm tra `URL/health`.
5. Cập nhật `miniapp/.env`.
6. Chạy `npm run build`; `postbuild` tự cập nhật `app-config.json`.
7. Chạy `zmp deploy` nếu URL thay đổi.

## Cách chạy

Nhấp đúp:

```text
scripts\windows\launchers\START_HELPDESK_AUTO.bat
```

Hoặc chạy bằng PowerShell:

```powershell
cd "C:\duong-dan\Zalo_IT_HelpDesk_App"
.\scripts\windows\start-helpdesk-auto.ps1
```

Script tự dò ngrok trong PATH và thư mục Downloads. Có thể chỉ định rõ đường dẫn:

```powershell
.\scripts\windows\start-helpdesk-auto.ps1 `
  -NgrokPath "C:\Tools\ngrok\ngrok.exe"
```

## Tham số hữu ích

Chỉ cập nhật URL và build, chưa deploy:

```powershell
.\scripts\windows\start-helpdesk-auto.ps1 -SkipDeploy
```

Buộc build/deploy ngay cả khi URL không đổi:

```powershell
.\scripts\windows\start-helpdesk-auto.ps1 -ForceDeploy
```

Backend đã được chạy bằng cách khác:

```powershell
.\scripts\windows\start-helpdesk-auto.ps1 -SkipBackend
```

## Lưu ý

- Khi URL không đổi, script không build/deploy lại.
- Khi URL thay đổi, ZMP CLI vẫn hiển thị bước chọn môi trường; chọn `Development` khi đang thử nghiệm.
- Giữ cửa sổ backend và ngrok đang chạy.
- Không đưa authtoken ngrok hoặc `ZMP_TOKEN` lên GitHub.
