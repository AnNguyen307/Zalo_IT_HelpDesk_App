# Hướng dẫn phát triển

Tài liệu này dành cho người cần chạy dự án cục bộ, sửa mã nguồn, thêm kiểm thử và chuẩn bị pull request. Hướng dẫn triển khai môi trường thật nằm tại [Deployment](../deployment/README.md).

## 1. Yêu cầu

- Git.
- Node.js `20+`.
- npm đi kèm Node.js.
- Windows PowerShell, Bash hoặc terminal tương đương.
- SQL Server chỉ cần khi kiểm thử profile `nas/sqlserver`.
- ZMP CLI chỉ cần khi build/deploy Zalo Mini App.

Không cần cài Ollama hoặc local AI service.

## 2. Cấu trúc repository

```text
backend/        Node.js API, Admin Web, database adapters và tests
miniapp/        Zalo Mini App React/TypeScript
deploy/         Cấu hình container/profile triển khai
docs/           Tài liệu hiện hành và hồ sơ release
scripts/        Công cụ Windows, Linux và bảo trì repository
render.yaml     Render Blueprint cho free-hosting
```

## 3. Chạy Backend cục bộ

### PowerShell

```powershell
cd .\backend
Copy-Item .env.example .env
npm ci
npm run check
npm test
npm start
```

### Bash

```bash
cd backend
cp .env.example .env
npm ci
npm run check
npm test
npm start
```

Địa chỉ mặc định:

- Health: <http://127.0.0.1:8080/health>
- Admin: <http://127.0.0.1:8080/admin>

`.env.example` chỉ chứa placeholder. Không commit `backend/.env`.

## 4. Chạy Mini App cục bộ

Tạo `miniapp/.env`:

```env
APP_ID=<ZALO_MINI_APP_ID>
VITE_API_BASE_URL=http://127.0.0.1:8080
```

Sau đó:

```powershell
cd .\miniapp
npm ci
npm start
```

Browser preview mặc định dùng <http://127.0.0.1:3000>. Điện thoại hoặc Zalo không truy cập được `127.0.0.1` của máy phát triển; khi thử trên thiết bị thật phải dùng Backend HTTPS có thể truy cập từ Internet.

## 5. Build Production Mini App

```powershell
cd .\miniapp
npm ci
npm run build
```

Lệnh build chạy TypeScript check, Vite build và đồng bộ `app-config.json`. Kiểm tra:

- `dist/index.html` tồn tại;
- `dist/assets/` có JavaScript và CSS;
- `dist/app-config.json` khớp metadata;
- bundle không chứa secret hoặc URL môi trường sai.

Không deploy Mini App chỉ vì build thành công. Việc deploy Testing/Production cần đúng App ID, token CI/CD và quyết định phát hành riêng.

## 6. Cấu hình phát triển tối thiểu

Baseline không cần cloud AI:

```env
DEPLOYMENT_PROFILE=local
DB_PROVIDER=json
ATTACHMENT_STORAGE_PROVIDER=filesystem
AI_CLOUD_ENABLED=false
AI_PROVIDER=rules
PLAYBOOK_RETRIEVAL_MODE=lexical
PLAYBOOK_EMBED_PROVIDER=none
ZALO_AUTH_MODE=development
ZALO_BOT_ENABLED=false
```

`ZALO_AUTH_MODE=development` chỉ dùng cục bộ. Không chạy cấu hình này trên Backend public.

## 7. Database

### JSON

Phù hợp cho phát triển nhanh. Dữ liệu mặc định nằm dưới `backend/data/` và không được dùng như database production.

### PostgreSQL

Profile Render/Supabase dùng:

```powershell
npm run db:postgres:init
```

Lệnh này idempotent, khởi tạo state schema `1` và Playbook Governance schema `1` khi cấu hình cho phép. Không chạy với URL database không xác định.

### SQL Server

Kiểm tra trước:

```powershell
npm run db:status
```

Chỉ chạy migration khi release có migration mới và đã có backup:

```powershell
npm run db:migrate
npm run db:status
```

Schema hiện hành là `10`. Không chạy migration cho thay đổi chỉ có Markdown/UI.

## 8. Playbook

```powershell
cd .\backend
npm run playbook:benchmark
npm run playbook:index
```

Dùng `playbook:index:force` chỉ khi chủ động cần rebuild toàn bộ index. Runtime chỉ đọc procedure `Published + Active`; bản nháp không được trở thành nguồn trả lời nhân viên.

## 9. Quality gates theo phạm vi

| Thay đổi | Gate tối thiểu |
|---|---|
| Backend/API/storage/auth | `npm ci`, `npm run check`, `npm test`, smoke test liên quan |
| Playbook/retrieval/Copilot | Backend gates + `npm run playbook:benchmark` |
| Mini App/shared contract | Backend gates liên quan + `miniapp npm run build` |
| Admin UI | Backend gates + responsive/accessibility smoke test |
| Tài liệu | link check, `git diff --check`, credential scan; code suite chỉ cần khi tài liệu đi kèm code |

Mọi bug fix phải có regression coverage khi có thể tự động hóa. Nếu một gate không chạy được, PR phải ghi đúng lý do và không được ghi là đã đạt.

## 10. Quy trình nhánh và PR

1. Kiểm tra `git status -sb` và giữ nguyên thay đổi không thuộc nhiệm vụ.
2. Tạo nhánh tập trung theo dạng `codex/<mô-tả-ngắn>`.
3. Sửa mã và thêm test/tài liệu tương ứng.
4. Chạy gate phù hợp.
5. Quét diff để loại `.env`, secret, dữ liệu, backup và artifact build.
6. Commit với thông điệp mô tả kết quả.
7. Tạo PR ghi rõ outcome, impact, validation và rollback.
8. Chỉ merge khi head SHA không đổi, PR mergeable, check không thất bại và không còn review thread cần xử lý.

## 11. Versioning

- Backend/Admin hiện tại: `5.18.6`.
- Mini App source hiện tại: `5.17.2`.
- Mini App Production đang Live: phiên bản `33`.
- SQL Server schema: `10`.
- PostgreSQL state/governance schema: `1/1`.

Thay đổi component-only không bắt buộc tăng đồng thời mọi phiên bản, nhưng phải ghi rõ thành phần nào thay đổi. Release mới phải cập nhật package metadata, health version, cache-busting reference và release note liên quan cùng lúc.

## 12. Nguyên tắc bảo mật khi phát triển

- Không đưa credential vào câu lệnh, screenshot, test fixture hoặc log.
- Chỉ dùng placeholder như `<API_KEY>` trong tài liệu.
- Không dùng dữ liệu nhân viên thật cho test.
- Không giảm guardrail để làm test pass.
- Không xóa database hoặc file người dùng để sửa lỗi.
- Không force-push hoặc reset destructive khi chưa được yêu cầu rõ.

## 13. Xử lý lỗi nhanh

- `npm ci` lỗi: kiểm tra phiên bản Node/npm và quyền ghi npm cache.
- Port `8080` bận: dừng tiến trình cũ hoặc đổi `PORT` trong `.env`.
- Health báo database chưa sẵn sàng: kiểm tra đúng provider và credential server-side.
- Mini App không gọi được Backend: kiểm tra HTTPS/CORS và `VITE_API_BASE_URL` đã được build vào bundle.
- UI cũ: hard refresh Admin; với Mini App cần xác nhận đúng phiên bản đang chạy trên Zalo.

Xem thêm [Troubleshooting](../troubleshooting/README.md) và [Tiêu chuẩn kiểm thử](../quality/EXCEPTION_TESTING_STANDARD.md).
