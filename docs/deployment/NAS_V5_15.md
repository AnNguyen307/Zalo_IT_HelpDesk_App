# NAS + SQL Server — Deployment profile

> Profile được giới thiệu ở v5.15.1 và đã cập nhật cho Backend/Admin `v5.18.6`. Profile NAS dùng SQL Server schema `10` và filesystem volume. Tài liệu không xác nhận một NAS cụ thể đã được triển khai.

## Kiến trúc

```text
Zalo Mini App
  → named HTTPS tunnel / reverse proxy
      → NAS 127.0.0.1:8080
          → SQL Server private network
          → Docker volume zalo_helpdesk_data
```

Không public port SQL Server `1433`. `compose.yaml` chỉ bind API vào `127.0.0.1:8080`; tunnel/reverse proxy phải chạy cùng NAS/host.

## Chuẩn bị

1. Cài Docker/Compose trên NAS x86-64 hoặc server tương thích.
2. Chuẩn bị SQL Server và application login quyền tối thiểu. Database mới/chưa đủ migration phải được nâng đến schema `10` theo quy trình kiểm soát.
3. Copy `deploy/nas/.env.example` thành `deploy/nas/.env`.
4. Thay toàn bộ `CHANGE_ME`; không commit file `.env`.
5. Nếu SQL Server chạy trên NAS host, dùng `SQLSERVER_HOST=host.docker.internal`. Nếu chạy máy khác, dùng hostname/IP private.
6. Cấu hình certificate đúng; chỉ dùng `SQLSERVER_TRUST_SERVER_CERTIFICATE=true` khi đã đánh giá mạng nội bộ/certificate.

## Khởi động

Từ `deploy/nas`:

```bash
docker compose build --pull
docker compose up -d
docker compose ps
docker compose logs --tail=200 backend
```

Health local:

```text
http://127.0.0.1:8080/health
```

Kỳ vọng:

- version `5.18.6`;
- deployment profile `nas`;
- database provider `sqlserver`;
- attachment provider `filesystem`;
- retention tối đa `30` ticket và `10485760` byte attachment/ticket;
- SQL Server schema `10`.

Không chạy `npm run db:migrate` theo thói quen khi deploy. Chỉ chạy khi đã backup, xác nhận database thấp hơn schema `10` và review migration còn thiếu.

## Persistent data

Named volume `zalo_helpdesk_data` mount tại `/app/data`, gồm uploads và generated Playbook index. Redeploy image không xóa volume.

Backup phải gồm:

- SQL Server database backup;
- Docker volume `/app/data`;
- bản kiểm thử restore trên host khác.

Không coi volume trên cùng NAS là bản backup duy nhất.

## Chuyển từ free-hosting sang NAS

Hai profile không dùng chung mô hình lưu state/attachment. Cần một kế hoạch migration có đối soát trước khi chuyển dữ liệu pilot. Hệ thống cố ý không tự động copy hoặc overwrite dữ liệu giữa hai profile.

Sau khi có URL HTTPS NAS cố định, đổi `VITE_API_BASE_URL`, build và deploy lại Mini App. Rollback bằng cách trỏ Mini App về backend trước đó; không xóa database/volume cũ cho tới khi đối soát hoàn tất.
