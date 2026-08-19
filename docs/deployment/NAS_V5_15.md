# v5.15.1 — NAS deployment profile

Profile NAS dùng cùng image backend nhưng giữ SQL Server schema `9` và filesystem volume. Chưa có hành động deploy NAS trong release này.

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
2. Chuẩn bị SQL Server đã có schema `9` và application login quyền tối thiểu.
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

- version `5.15.1`;
- deployment profile `nas`;
- database provider `sqlserver`;
- attachment provider `filesystem`;
- retention tối đa `30` ticket và `10485760` byte attachment/ticket;
- SQL Server schema vẫn `9`.

Không chạy `npm run db:migrate` nếu database đã ở schema `9`.

## Persistent data

Named volume `zalo_helpdesk_data` mount tại `/app/data`, gồm uploads và generated Playbook index. Redeploy image không xóa volume.

Backup phải gồm:

- SQL Server database backup;
- Docker volume `/app/data`;
- bản kiểm thử restore trên host khác.

Không coi volume trên cùng NAS là bản backup duy nhất.

## Chuyển từ free-hosting sang NAS

Hai profile không dùng chung database schema. Cần một kế hoạch migration state + attachment có đối soát trước khi chuyển dữ liệu pilot. v5.15.1 cố ý không tự động copy/overwrite dữ liệu giữa hai profile.

Sau khi có URL HTTPS NAS cố định, đổi `VITE_API_BASE_URL`, build và deploy lại Mini App. Rollback bằng cách trỏ Mini App về backend trước đó; không xóa database/volume cũ cho tới khi đối soát hoàn tất.
