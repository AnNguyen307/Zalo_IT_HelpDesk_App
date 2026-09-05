IT HELPDESK - CHẠY MÔI TRƯỜNG LOCAL TRONG VS CODE

Phạm vi
-------
Hướng dẫn này chỉ dành cho Development/Testing trên Windows. Production version 33
đang dùng backend Render HTTPS cố định, không cần chạy ngrok hoặc launcher local.

Cách dùng khuyến nghị
--------------------
1. Mở PowerShell tại thư mục gốc repository.
2. Nếu còn Backend/ngrok cũ, chuyển tới terminal đó và nhấn Ctrl+C.
3. Chạy:

   .\scripts\windows\launchers\START_HELPDESK_VSCODE.bat

4. Nếu VS Code hỏi Workspace Trust hoặc Automatic Tasks, chỉ chọn Trust/Allow khi
   bạn đã xác nhận đây là repository chính xác.
5. Nhấn Ctrl+Shift+B hoặc chọn Terminal > Run Build Task.
6. Theo dõi từng terminal theo tên task, thường gồm Backend, ngrok và đồng bộ URL.
7. Nếu ZMP CLI hỏi môi trường, chọn Development/Testing; không chọn Production khi
   chưa có quyết định phát hành.

Chạy hoặc dừng task
-------------------
- Mở command palette: Ctrl+Shift+P > Tasks: Run Task.
- Dừng: Terminal > Run Task > HelpDesk: Dung backend va ngrok.
- Có thể nhấn biểu tượng thùng rác ở terminal tương ứng, nhưng hãy kiểm tra các tiến
  trình con đã dừng.

Khi ngrok đổi URL
-----------------
VITE_API_BASE_URL được đóng vào bundle Mini App lúc build. Khi URL tunnel thay đổi,
hãy chạy lại tác vụ đồng bộ, build và deploy đúng môi trường Testing. Không sửa URL
Production chỉ để kiểm thử local.

Khắc phục nhanh
---------------
- Không tìm thấy lệnh code: mở VS Code và thêm lệnh code vào PATH.
- Không tìm thấy ngrok.exe: cập nhật đường dẫn trong .vscode/tasks.json hoặc truyền
  -NgrokPath cho scripts\windows\start-helpdesk-auto.ps1.
- Backend không healthy: mở http://127.0.0.1:8080/health và đọc terminal Backend.
- ZMP deploy lỗi: kiểm tra phiên đăng nhập/token, App ID và môi trường đích.

Bảo mật
-------
Không dán token, mật khẩu, connection string hoặc nội dung .env vào terminal được
chia sẻ/chụp màn hình. Không commit miniapp/.env hay backend/.env.
