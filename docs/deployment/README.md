# Hướng dẫn triển khai

Đây là điểm bắt đầu cho mọi hoạt động triển khai. Chọn đúng profile trước khi nhập cấu hình hoặc chạy migration.

## 1. Chọn profile

| Profile | Backend | Database | Attachment | Phù hợp |
|---|---|---|---|---|
| `free-hosting` | Render Free | Supabase PostgreSQL | Supabase private Storage | Demo/pilot, không SLA |
| `nas` | Docker trên NAS/server | SQL Server schema `10` | Persistent volume/filesystem | Nội bộ ổn định hơn |
| `local` | Node.js trên máy dev | JSON/PostgreSQL/SQL Server | Filesystem | Phát triển và test |

Production hiện tại dùng `free-hosting`, Backend/Admin `5.18.6`; Zalo Mini App phiên bản `33` đang Live 100%.

## 2. Tài liệu theo nhu cầu

- [Checklist triển khai chung](./DEPLOYMENT_CHECKLIST.md)
- [Render + Supabase free-hosting](./FREE_HOSTING_V5_15.md)
- [NAS + SQL Server](./NAS_V5_15.md)
- [Local/PC + tunnel](./FREE_DEPLOYMENT.md)
- [Tự động đồng bộ URL ngrok](./AUTO_NGROK.md)
- [Terminal và launcher trên Windows](./README_VSCODE_TERMINALS.txt)
- [Runbook sau triển khai](../operations/OPERATIONS_RUNBOOK.md)
- [Hướng dẫn bảo mật](../security/SECURITY_GUIDE.md)

Tên file có hậu tố phiên bản cũ phản ánh thời điểm profile được giới thiệu; phần đầu tài liệu ghi rõ trạng thái tương thích hiện hành.

## 3. Nguyên tắc bắt buộc

1. Không commit `.env`, token, key, database URL hoặc dữ liệu thật.
2. Chạy gate phù hợp trước khi deploy.
3. Xác định rõ migration requirement từ release note.
4. Không deploy Mini App chỉ vì Backend/Admin được merge.
5. Đổi public Backend URL phải build/deploy lại Mini App.
6. Không xóa database/volume cũ trước khi rollback window kết thúc và dữ liệu được đối soát.
7. Deploy commit cụ thể từ `main`, không deploy worktree chưa merge.

## 4. Gate tối thiểu

Backend hoặc thay đổi liên hệ nhiều thành phần:

```powershell
cd .\backend
npm ci
npm run check
npm test
```

Playbook/retrieval:

```powershell
npm run playbook:benchmark
```

Mini App:

```powershell
cd ..\miniapp
npm ci
npm run build
```

Mọi deploy cần thêm credential scan, diff review và release note có outcome, impact, validation, rollback.

## 5. Thứ tự phát hành Backend/Admin

1. Merge PR đã kiểm tra vào `main`.
2. Xác nhận merge commit và version metadata.
3. Nếu có migration, backup và kiểm tra schema trước.
4. Deploy đúng commit lên môi trường đã được phê duyệt.
5. Chờ health check thành công và instance Live.
6. Kiểm tra `/health`, database, storage, Playbook, AI và Bot.
7. Smoke test chức năng bị ảnh hưởng.
8. Ghi lại kết quả và cách rollback.

## 6. Thứ tự phát hành Mini App

1. Xác nhận Backend public đã sẵn sàng.
2. Build với đúng `VITE_API_BASE_URL` HTTPS.
3. Chạy workflow deploy Testing.
4. Kiểm thử E2E trên Zalo/điện thoại thật.
5. Gửi xét duyệt Zalo.
6. Sau khi Approved, Publish theo xác nhận của chủ dự án.
7. Kiểm tra version Live và luồng người dùng thật.

Phiên bản 33 đã hoàn tất chu trình này. Chỉ tạo phiên bản mới khi source/config Mini App thực sự thay đổi.

## 7. Migration matrix

| Môi trường | Schema hiện tại | Lệnh kiểm tra | Khi nào migrate |
|---|---:|---|---|
| SQL Server/NAS | `10` | `npm run db:status` | Chỉ khi release có migration mới |
| PostgreSQL state | `1` | `/health` và init log | Init idempotent khi container khởi động |
| PostgreSQL governance | `1` | `/health` | Init/seed theo cấu hình governance |
| JSON local | Không version SQL | kiểm tra file/state | Không chạy SQL migration |

## 8. Rollback

Rollback ứng dụng và rollback dữ liệu là hai quyết định riêng:

- Backend/Admin: deploy lại commit đã biết tốt.
- Mini App: publish lại version đã duyệt trước nếu Zalo cho phép và API còn tương thích.
- AI: có thể tắt cloud route và dùng Rules fallback.
- Database: không tự rollback migration bằng cách xóa bảng/cột; dùng kế hoạch và backup của release.
- Attachment: giữ object/volume cho đến khi đối soát xong.

## 9. Xác nhận sau deploy

- [ ] `/health` trả HTTP `200`, đúng version/profile.
- [ ] Database và attachment provider ready.
- [ ] Đăng nhập Admin thành công.
- [ ] Ticket read/write hoạt động theo role.
- [ ] Playbook/index ready.
- [ ] AI fallback vẫn an toàn.
- [ ] Bot/webhook ready nếu bật.
- [ ] Không mất ticket/message/file.
- [ ] Mini App đang trỏ đúng Backend.

Nếu có lỗi, dừng phát hành tiếp và dùng [Troubleshooting](../troubleshooting/README.md).
