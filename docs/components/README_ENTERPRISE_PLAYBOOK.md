# Enterprise Playbook và RAG

Tài liệu này mô tả cách HelpDesk quản lý, tìm kiếm và sử dụng quy trình hỗ trợ đã được phê duyệt. Nội dung áp dụng cho Backend/Admin `v5.18.6` và thay thế các hướng dẫn cài đặt Playbook rời rạc trước đây.

## Vai trò của Playbook

Enterprise Playbook là nguồn hướng dẫn kỹ thuật có kiểm soát. Hệ thống ưu tiên Playbook hơn Knowledge Base và kiến thức chung của mô hình AI.

```text
Ticket và lịch sử trao đổi
        ↓
Lọc theo đối tượng và trạng thái phát hành
        ↓
Tìm kiếm lexical hoặc hybrid
        ↓
AI chọn sourceId và stepNumbers
        ↓
Backend xác minh nguồn và lấy nguyên văn bước đã duyệt
        ↓
Hướng dẫn tự xử lý hoặc chuyển HelpDesk
```

AI không được tự tạo lệnh kỹ thuật rồi trình bày như một bước Playbook. Khi dịch vụ AI không sẵn sàng, Rules/HelpDesk fallback vẫn tiếp nhận và phân loại ticket.

## Nguồn dữ liệu

| Profile | Nguồn runtime | Mục đích |
|---|---|---|
| JSON/local | `backend/playbooks/enterprise-playbook.json` | Baseline phát triển, kiểm thử và fallback |
| PostgreSQL | Kho governance trong PostgreSQL | Render/Supabase pilot; lưu lifecycle, version và audit |
| SQL Server | Các bảng governance, schema `10` | NAS/doanh nghiệp |

Với kho governance, chỉ phiên bản **Published + Active** được đưa vào chỉ mục RAG. Draft, Submitted, Rejected, Archived hoặc version đã rollback không được trả cho người dùng.

## Cấu trúc procedure tối thiểu

Mỗi procedure cần có:

- `id` ổn định và duy nhất;
- `title`, `category` và `keywords` dễ tìm;
- `audience`: `employee` hoặc `technician`;
- `risk`, điều kiện dừng và điều kiện chuyển cấp;
- `requiredQuestions` để thu thập đủ dữ kiện;
- `steps` theo thứ tự, mỗi bước rõ một hành động;
- `forbiddenSteps` cho hành động không được tự hướng dẫn;
- trạng thái `approved` và `active` phù hợp.

Chỉ dùng `audience=employee` cho thao tác ít rủi ro, có thể hoàn tác và không cần quyền quản trị. Lệnh hạ tầng, thay đổi bảo mật, truy cập dữ liệu hoặc thao tác có khả năng gây gián đoạn phải dùng `audience=technician`.

## Quy trình cập nhật an toàn

1. Tìm procedure hiện có trước khi tạo mới để tránh trùng nội dung.
2. Tạo Draft và ghi rõ lý do thay đổi.
3. Kiểm tra câu hỏi bắt buộc, bước thực hiện, rủi ro và điều kiện dừng.
4. Gửi review; người tạo không tự bỏ qua bước phê duyệt.
5. Publish version đã duyệt và xác nhận version đó là Active.
6. Chờ hoặc kích hoạt re-index.
7. Chạy benchmark và tìm thử bằng cách diễn đạt gần với người dùng thật.
8. Theo dõi audit log; rollback nếu chất lượng tìm kiếm hoặc hướng dẫn giảm.

Không sửa trực tiếp lịch sử version đã Published. Mỗi lần thay đổi phải tạo version mới để còn truy vết và rollback.

## Cài baseline trên Windows

Từ thư mục gốc repository:

```powershell
.\scripts\windows\launchers\INSTALL_ENTERPRISE_PLAYBOOK.bat
```

Hoặc trong VS Code chọn:

```text
Terminal → Run Task → HelpDesk: Cai dat Enterprise Playbook
```

Script giữ nguyên secret hiện có, tạo bản sao lưu cấu hình cần thiết, đặt retrieval mặc định về lexical và chạy benchmark.

## Chế độ tìm kiếm

### Lexical — mặc định an toàn

```env
PLAYBOOK_RETRIEVAL_MODE=lexical
PLAYBOOK_EMBED_PROVIDER=none
PLAYBOOK_AUTO_INDEX=true
```

Lexical dùng BM25, không cần API embedding và vẫn hoạt động khi toàn bộ provider AI tắt.

### Hybrid — tùy chọn

```env
AI_CLOUD_ENABLED=true
GEMINI_ENABLED=true
GEMINI_API_KEY=<server-side-secret>
PLAYBOOK_RETRIEVAL_MODE=hybrid
PLAYBOOK_EMBED_PROVIDER=gemini
PLAYBOOK_EMBED_MODEL=gemini-embedding-001
PLAYBOOK_AUTO_INDEX=true
```

Không commit API key. Sau khi thay cấu hình hoặc cần làm mới toàn bộ chỉ mục:

```powershell
cd backend
npm run playbook:index:force
npm run playbook:benchmark
```

Nếu embedding hoặc semantic index lỗi, retrieval tự hạ về lexical thay vì dừng luồng tạo ticket.

## Kiểm tra vận hành

Mở `/health` và kiểm tra khối Playbook:

- `ready=true`;
- retrieval mode đúng cấu hình;
- semantic chỉ bật khi provider embedding thật sự sẵn sàng;
- index đã hoàn tất, không có lỗi mới;
- dữ liệu lấy từ đúng nguồn governance của profile đang chạy.

Trong `/admin`, mở tab Playbook để:

- tìm thử bằng mô tả sự cố;
- kiểm tra category, audience và risk;
- xem lifecycle/version/audit;
- publish, archive hoặc rollback theo quyền;
- re-index khi cần.

## Tiêu chí nghiệm thu thay đổi Playbook

- Procedure đúng đối tượng và không lộ bước dành cho kỹ thuật viên.
- Chỉ Published + Active xuất hiện trong kết quả runtime.
- Truy vấn chuẩn và ít nhất hai cách diễn đạt gần nghĩa trả đúng Top-K.
- Nội dung không chứa mật khẩu, token, endpoint nội bộ nhạy cảm hoặc dữ liệu ticket thật.
- Điều kiện chuyển cấp rõ ràng; không hướng dẫn thao tác phá hủy.
- `npm run playbook:benchmark` đạt và kết quả được ghi vào PR/release evidence.
- Rollback đã được kiểm tra đối với thay đổi có rủi ro cao.

Xem thêm [Playbook Governance](./README_PLAYBOOK_LIFECYCLE.md), [AI Agent và Staff Copilot](./README_AI_AGENT.md) và [Runbook vận hành](../operations/OPERATIONS_RUNBOOK.md).
