# Windows launchers

Các file `.bat` ở đây là lối tắt cho những tác vụ Windows thường dùng. Chạy từ thư mục gốc repository để log và đường dẫn dễ theo dõi:

```powershell
.\scripts\windows\launchers\START_HELPDESK_VSCODE.bat
```

## Chọn launcher

| Launcher | Dùng khi | Tác động chính |
|---|---|---|
| `START_HELPDESK_VSCODE.bat` | Phát triển hằng ngày | Mở workspace VS Code; các task chạy trong Terminal |
| `START_HELPDESK_AUTO.bat` | Development/Testing với ngrok | Chạy backend, ngrok, đồng bộ API URL và có thể deploy Mini App |
| `CONFIGURE_SQL_SERVER.bat` | Thiết lập profile SQL Server | Cập nhật cấu hình database; cần review trước khi áp dụng |
| `CONFIGURE_UPLOAD_LIMIT_30MB.bat` | Profile tự quản cần giới hạn upload cũ | Thay cấu hình upload; không áp dụng cho Production pilot 10 MB/ticket |
| `INSTALL_ENTERPRISE_PLAYBOOK.bat` | Cài baseline Playbook | Cấu hình retrieval và chạy benchmark |
| `INSTALL_PLAYBOOK_GOVERNANCE.bat` | Cài/nâng governance store | Có thể tác động database; phải backup và đọc prompt |
| `ORGANIZE_PROJECT_FILES.bat` | Chuẩn hóa cây thư mục | Nên chọn Preview trước Apply |

## Lưu ý an toàn

- Đọc nội dung launcher/script trước khi chạy trên môi trường có dữ liệu thật.
- Không chạy công cụ ngrok cho Mini App Production version `33`.
- Không đưa `.env`, API key, ZMP token hoặc mật khẩu vào tham số được ghi log.
- Backup database và attachment trước launcher có liên quan migration/cấu hình.
- Nếu launcher thất bại, giữ nguyên cửa sổ để đọc thông báo; không chạy lặp liên tục khi chưa rõ nguyên nhân.

Xem [Developer Guide](../../../docs/development/DEVELOPER_GUIDE.md) và [Deployment Guide](../../../docs/deployment/README.md) trước khi thiết lập lần đầu.
