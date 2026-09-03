# Hướng dẫn sử dụng Nguyễn Phan Trường An HelpDesk

Tài liệu này hướng dẫn đầy đủ cách sử dụng hệ thống IT HelpDesk trên Zalo, từ lúc cấp quyền truy cập đến khi tạo, xử lý và đóng một yêu cầu hỗ trợ.

## 1. Thông tin hệ thống

| Hạng mục | Giá trị hiện tại |
|---|---|
| Tên chính thức trên Zalo | `Nguyễn Phan Trường An HelpDesk` |
| Tên hiển thị ngắn trong ứng dụng | `IT HelpDesk` |
| Zalo Mini App ID | `4185582976193315701` |
| Phiên bản Production | `33` — Live 100% |
| Mini App source | `v5.17.2` |
| Backend/Admin | `v5.18.6` |
| Trang quản trị Production | <https://zalo-it-helpdesk-pilot.onrender.com/admin> |
| Kiểm tra trạng thái Backend | <https://zalo-it-helpdesk-pilot.onrender.com/health> |

Phiên bản 33 là bản Production đã được Zalo xét duyệt. Người dùng mở ứng dụng bằng QR hoặc đường dẫn Mini App Production do HelpDesk cung cấp, không dùng QR Testing.

## 2. Đối tượng sử dụng và quyền hạn

| Vai trò | Mục đích | Quyền chính |
|---|---|---|
| Nhân viên | Gửi yêu cầu hỗ trợ qua Mini App | Tạo, xem, phản hồi, đính kèm file, yêu cầu HelpDesk, mở lại và đánh giá ticket của chính mình |
| Chỉ xem | Theo dõi vận hành | Xem ticket, báo cáo, Playbook và trạng thái hệ thống; không sửa hoặc phản hồi ticket |
| Kỹ thuật viên | Tiếp nhận và xử lý yêu cầu | Phản hồi, phân công, đổi trạng thái/ưu tiên, dùng Copilot, tạo hoặc sửa bản nháp Playbook và gửi duyệt |
| Quản trị viên | Quản trị toàn hệ thống | Toàn bộ quyền kỹ thuật viên; quản lý nhân sự, mã mời, phiên thiết bị, Knowledge Base và phê duyệt Playbook |

Không dùng chung tài khoản quản trị. Mỗi thành viên HelpDesk nên có tài khoản riêng để hệ thống ghi nhận đúng người thao tác trong lịch sử và audit log.

## 3. Bắt đầu nhanh

### 3.1. Quản trị viên cấp quyền cho nhân viên

1. Mở trang **Admin** và đăng nhập bằng tài khoản được cấp.
2. Chọn **Nhân sự**.
3. Trong khu vực **Mã mời nhân viên**, chọn **Tạo mã mời**.
4. Nhập mã nhân viên, họ tên và phòng ban.
5. Xác nhận tạo mã.
6. Sao chép mã dạng `XXXX-XXXX-XXXX` và gửi riêng cho đúng nhân viên.

Mã mời:

- chỉ hiển thị đầy đủ một lần;
- chỉ sử dụng được một lần;
- mặc định hết hạn sau 24 giờ;
- không được gửi trong ticket, nhóm chat công khai hoặc tài liệu dùng chung.

Nếu mã bị lộ, hết hạn hoặc nhập sai nhiều lần, quản trị viên phải thu hồi mã cũ và tạo mã mới.

### 3.2. Nhân viên xác nhận thiết bị lần đầu

1. Mở `Nguyễn Phan Trường An HelpDesk` trong Zalo.
2. Tại màn hình **Nhập mã mời nhân viên**, nhập đủ 12 ký tự chữ/số của mã được cấp (dấu gạch được ứng dụng tự định dạng).
3. Chọn **Xác nhận thiết bị**.
4. Khi vào được **Trang chủ**, kiểm tra tên và phòng ban trong tab **Cá nhân**.

Sau lần xác nhận đầu tiên, ứng dụng ghi nhớ phiên trên thiết bị và tự gia hạn. Phiên thiết bị có thời hạn trượt tối đa 90 ngày. Nếu đăng xuất, bị quản trị viên thu hồi phiên hoặc xóa dữ liệu ứng dụng, người dùng cần một mã mời mới.

## 4. Hướng dẫn dành cho nhân viên

### 4.1. Các khu vực chính

Thanh điều hướng dưới cùng gồm:

| Khu vực | Chức năng |
|---|---|
| **Trang chủ** | Xem số ticket đang mở, ticket chờ phản hồi, cảnh báo SLA và yêu cầu gần đây |
| **Yêu cầu** | Tìm kiếm, lọc, mở và theo dõi toàn bộ ticket của bạn |
| **Thông báo** | Xem phản hồi HelpDesk, thay đổi trạng thái và cảnh báo SLA |
| **Cá nhân** | Cập nhật phòng ban, số điện thoại nội bộ và đăng xuất thiết bị |

### 4.2. Tạo yêu cầu hỗ trợ

1. Tại **Trang chủ**, chọn **Tạo yêu cầu hỗ trợ**; hoặc vào **Yêu cầu → Tạo mới**.
2. Chọn một nhóm sự cố có sẵn nếu phù hợp:
   - Mất mạng;
   - Máy in Ricoh;
   - Windows;
   - Microsoft Office/Outlook.
3. Nhập **Tiêu đề sự cố** tối thiểu 4 ký tự.
4. Nhập **Mô tả chi tiết** tối thiểu 10 ký tự.
5. Điền thiết bị và vị trí nếu biết.
6. Thêm ảnh hoặc file làm bằng chứng.
7. Kiểm tra nội dung rồi chọn **Gửi cho HelpDesk**.

Mẫu mô tả nên dùng:

```text
Sự cố: Máy in Ricoh tầng 2 hiển thị Offline.
Thời điểm bắt đầu: Khoảng 09:15 hôm nay.
Thông báo/mã lỗi: Printer Offline.
Đã thử: Tắt/mở máy in và kiểm tra dây mạng.
Phạm vi ảnh hưởng: Chỉ máy của tôi.
Thiết bị: PC-ACCT-012 / Ricoh MP...
Vị trí: Tầng 2 - Kế toán.
```

Mô tả rõ thời điểm, mã lỗi, bước đã thử và phạm vi ảnh hưởng giúp AI/Playbook phân loại chính xác hơn và giúp kỹ thuật viên xử lý nhanh hơn.

### 4.3. Quy định file đính kèm

- Tối đa 8 file cho toàn bộ một ticket, tính cả lúc tạo và các lần phản hồi.
- Có thể chọn tối đa 8 file khi tạo ticket; mỗi lần phản hồi chọn tối đa 4 file và không được vượt số file còn lại của ticket.
- Tổng dung lượng của toàn bộ file trong một ticket không vượt quá 10 MB.
- Hỗ trợ ảnh, PDF, TXT, CSV, Word, Excel, PowerPoint và ZIP.
- Chỉ người có quyền với ticket mới được xem hoặc tải file.

Không đính kèm:

- mật khẩu, OTP, mã khôi phục hoặc API key;
- dữ liệu khách hàng hoặc dữ liệu cá nhân không cần thiết;
- file thực thi hoặc nội dung không liên quan tới sự cố.

### 4.4. Nhận hướng dẫn từ AI và Playbook

Sau khi tạo ticket, hệ thống đối chiếu nội dung với Playbook đã được phê duyệt:

- Nếu tình huống đủ an toàn và có Playbook phù hợp, ứng dụng hiển thị hướng dẫn tự xử lý.
- Nếu rủi ro cao, thiếu thông tin, không đủ độ tin cậy hoặc không có quy trình phù hợp, ticket được chuyển tới HelpDesk.
- Người dùng luôn có thể chọn **Tôi vẫn chưa xử lý được** để yêu cầu kỹ thuật viên hỗ trợ.

Khi ticket đã chuyển sang chế độ HelpDesk, AI không tiếp tục trả lời trực tiếp người dùng. Copilot vẫn có thể hỗ trợ kỹ thuật viên ở kênh nội bộ, nhưng nội dung Copilot, provider, model, confidence và định tuyến nội bộ không hiển thị trên Mini App.

### 4.5. Theo dõi và phản hồi ticket

Mở **Yêu cầu**, tìm theo mã hoặc nội dung, sau đó chọn ticket cần xem.

Trang chi tiết hiển thị:

- mã và tiêu đề ticket;
- trạng thái, người phụ trách và bước tiếp theo;
- thời hạn phản hồi và thời hạn xử lý theo SLA;
- toàn bộ trao đổi, file đính kèm và lịch sử thay đổi.

Người dùng có thể nhập phản hồi, đính kèm thêm file và gửi trực tiếp trong cuộc hội thoại. Khi trạng thái là **Chờ bạn**, SLA được tạm dừng cho đến khi người dùng cung cấp thông tin cần thiết.

### 4.6. Ý nghĩa trạng thái

| Trạng thái | Ý nghĩa | Người cần hành động |
|---|---|---|
| **Mới mở** | Ticket đã được tạo và đang chờ tiếp nhận | HelpDesk |
| **Chờ người dùng** | HelpDesk hoặc Playbook đang chờ thêm thông tin/xác nhận | Nhân viên |
| **Đang xử lý** | Kỹ thuật viên đã tiếp nhận và đang thực hiện | HelpDesk |
| **Đã xử lý** | Giải pháp đã được ghi nhận | Nhân viên kiểm tra và đánh giá |
| **Đã đóng** | Quy trình hỗ trợ đã kết thúc | Không còn hành động, trừ khi cần mở lại |

### 4.7. Hoàn tất, mở lại và đánh giá

- Nếu hướng dẫn đã giải quyết được sự cố, chọn hành động xác nhận xử lý trên ticket.
- Ticket đã xử lý/đã đóng có thể được mở lại trong thời hạn mặc định 14 ngày nếu lỗi tái diễn hoặc chưa được xử lý hoàn toàn.
- Khi mở lại, nhập lý do cụ thể để HelpDesk biết điều gì chưa đạt.
- Sau khi hoàn tất, chọn từ 1 đến 5 sao và có thể thêm nhận xét.

## 5. Sử dụng Zalo Chat Bot

`Bot IT HelpDesk` là kênh hỗ trợ bằng tin nhắn riêng, hoạt động song song với Mini App.

### 5.1. Cách hỏi Bot

Gửi một mô tả có đủ triệu chứng và phạm vi ảnh hưởng, ví dụ:

```text
Wi-Fi trên laptop đã kết nối nhưng hiển thị “No Internet”.
Máy khác cùng khu vực vẫn truy cập Internet bình thường.
```

Bot ưu tiên Playbook đã được phát hành. Nếu không có Playbook phù hợp, Bot có thể đưa ra hướng dẫn AI thử nghiệm cho tình huống ít rủi ro. Hãy phản hồi kết quả sau khi thực hiện:

- `Đã được` nếu sự cố đã được xử lý;
- `Tôi đã thử nhưng vẫn chưa được` nếu cần chuyển HelpDesk;
- `Tạo ticket giúp tôi` nếu muốn yêu cầu kỹ thuật viên ngay.

### 5.2. Hành vi cần biết

- Bot chỉ xử lý tin nhắn văn bản trong cuộc trò chuyện riêng.
- Tin nhắn nhóm, sự kiện không phải văn bản và tin do Bot tự gửi không tạo phản hồi tự động.
- Khi đã tạo ticket, các tin nhắn tiếp theo được bổ sung vào ticket đang hoạt động thay vì tạo ticket trùng.
- Tình huống đặc quyền, bảo mật, mất dữ liệu, phần cứng vật lý hoặc rủi ro cao được chuyển thẳng cho HelpDesk.
- Bot không được yêu cầu mật khẩu, OTP, key hoặc hướng dẫn vô hiệu hóa biện pháp bảo mật.

Render Free có thể ngủ khi không có truy cập. Tin nhắn đầu tiên sau thời gian dài không hoạt động có thể chậm trong lúc Backend khởi động và đăng ký lại webhook.

## 6. Hướng dẫn dành cho HelpDesk

### 6.1. Đăng nhập Admin

1. Mở <https://zalo-it-helpdesk-pilot.onrender.com/admin>.
2. Nhập tên đăng nhập và mật khẩu nhân sự được cấp.
3. Chọn **Đăng nhập**.

Không lưu mật khẩu trên máy dùng chung. Nếu tài khoản bị khóa hoặc quên mật khẩu, liên hệ quản trị viên để đặt lại; không tạo thêm tài khoản dùng chung để xử lý tạm thời.

### 6.2. Thanh điều hướng Admin

| Khu vực | Chức năng chính |
|---|---|
| **Tổng quan** | Hàng đợi ticket, bộ lọc, SLA và thao tác xử lý |
| **Báo cáo** | Hiệu suất, phân bổ sự cố, CSAT, SLA và xuất CSV |
| **Quy trình** | Tạo, duyệt, phát hành và quản lý vòng đời Playbook |
| **Playbook** | Tra cứu procedure theo tình huống và đối tượng sử dụng |
| **Kiến thức** | Quản lý hướng dẫn kỹ thuật ngắn |
| **Nhân sự** | Tài khoản HelpDesk, mã mời và phiên Mini App; chỉ Admin thấy đầy đủ |
| **Hệ thống & AI** | Trạng thái Backend, provider, quota, chất lượng AI và sandbox kiểm thử |

Trên điện thoại, thanh điều hướng chuyển xuống cạnh dưới. Nút tài khoản ở góc trên mở cài đặt ứng dụng, thông tin tài khoản và đăng xuất.

### 6.3. Tìm và ưu tiên ticket

Trong **Tổng quan**, có thể:

- tìm theo mã ticket, người dùng hoặc nội dung;
- lọc theo trạng thái, mức ưu tiên và danh mục;
- dùng hàng đợi thông minh như **Quá SLA**, **Client vừa trả lời**, **Chờ Client** và **Mở lại**;
- theo dõi số lượng kết quả và thời điểm tự cập nhật.

Ưu tiên xử lý ticket khẩn cấp, quá SLA, nhiều người bị ảnh hưởng hoặc liên quan bảo mật/mất dữ liệu. Không tự hạ mức ưu tiên chỉ để làm đẹp báo cáo SLA.

### 6.4. Xử lý một ticket

1. Chọn ticket trong hàng đợi.
2. Đọc mô tả, hội thoại, file và lịch sử trước khi thay đổi trạng thái.
3. Kiểm tra khu vực **Tín hiệu**, **Lịch sử** và **Copilot** trong phần ngữ cảnh.
4. Chọn người phụ trách.
5. Chuyển ticket sang **Đang xử lý** khi đã tiếp nhận.
6. Gửi phản hồi cho người dùng; có thể đính kèm tối đa 4 file mỗi lần, trong giới hạn 8 file của toàn ticket.
7. Nếu cần người dùng cung cấp thông tin, chuyển sang **Chờ người dùng**.
8. Khi hoàn tất, nhập nguyên nhân/cách xử lý vào **Ghi chú / giải pháp**.
9. Chuyển sang **Đã xử lý** hoặc **Đã đóng**, rồi chọn **Lưu cập nhật**.

Mỗi ticket phải thể hiện rõ bốn thông tin: trạng thái hiện tại, người phụ trách, bước tiếp theo và bên cần hành động.

### 6.5. Sử dụng Staff Copilot

Copilot là công cụ nội bộ dành cho Admin/Kỹ thuật viên:

1. Mở ticket và chọn tab **Copilot**.
2. Chọn chế độ tự động hoặc provider/model được cho phép.
3. Chọn **Phân tích bằng model đã chọn** nếu cần chạy lại.
4. Đọc giả thuyết, nhiều hướng xử lý và bản nháp phản hồi.
5. Kiểm chứng bằng thông tin ticket, Playbook và thực tế thiết bị.
6. Nếu phù hợp, chọn **Dùng làm bản nháp**, chỉnh sửa rồi mới gửi.

Copilot không có quyền tự gửi tin, thực thi lệnh, thay đổi trạng thái hoặc đóng ticket. Kỹ thuật viên chịu trách nhiệm cuối cùng với mọi nội dung gửi cho người dùng.

### 6.6. Báo cáo vận hành

Trong **Báo cáo**:

1. Chọn khoảng 7, 30, 90 ngày hoặc 12 tháng.
2. Xem thời gian phản hồi/xử lý, tỷ lệ SLA, ticket mở lại và mức hài lòng.
3. Đối chiếu phân bổ theo nhóm sự cố, kỹ thuật viên và phòng ban.
4. Chọn **Xuất CSV** nếu cần phân tích thêm.

Dữ liệu báo cáo phản ánh trạng thái đã ghi trong ticket. Vì vậy, kỹ thuật viên phải cập nhật đúng người phụ trách, trạng thái và giải pháp.

## 7. Hướng dẫn dành cho quản trị viên

### 7.1. Quản lý tài khoản HelpDesk

Trong **Nhân sự → Tài khoản HelpDesk**:

- chọn **Thêm nhân sự** để tạo tài khoản;
- cấp đúng vai trò: Quản trị viên, Kỹ thuật viên hoặc Chỉ xem;
- khóa tài khoản ngay khi nhân sự không còn nhiệm vụ;
- kiểm tra trạng thái và lần đăng nhập gần nhất;
- tránh duy trì nhiều tài khoản Admin không cần thiết.

Vai trò **Chỉ xem** không được gửi phản hồi hoặc thay đổi ticket. Chỉ Admin mới nên được phép quản lý tài khoản, Knowledge Base và duyệt Playbook.

### 7.2. Quản lý mã mời và thiết bị Mini App

Trong **Nhân sự → Mã mời nhân viên**:

- tạo mã cho đúng nhân viên;
- kiểm tra mã còn hiệu lực, đã dùng, hết hạn hoặc bị thu hồi;
- thu hồi mã chưa dùng nếu cấp nhầm;
- kiểm tra danh sách người dùng/thiết bị đã xác nhận;
- thu hồi phiên khi mất điện thoại, thay đổi nhiệm vụ hoặc có nghi ngờ truy cập trái phép.

Thu hồi phiên trong Admin làm access token hiện tại mất hiệu lực ngay. Người dùng phải nhận mã mời mới nếu cần đăng nhập lại.

### 7.3. Quản lý Knowledge Base

Trong **Kiến thức**:

1. Chọn **Thêm hướng dẫn**.
2. Nhập tiêu đề, phân loại, mức rủi ro, từ khóa, tóm tắt và các bước.
3. Chỉ đánh dấu có thể tự hỗ trợ cho nội dung ít rủi ro và an toàn với nhân viên.
4. Lưu và kiểm tra lại bằng tìm kiếm.

Knowledge Base là hướng dẫn ngắn. Quy trình cần kiểm soát phiên bản, duyệt và phát hành phải được quản lý trong **Quy trình/Playbook**.

### 7.4. Quản trị vòng đời Playbook

Vòng đời chuẩn:

1. **Bản nháp** — Admin/Kỹ thuật viên soạn và kiểm tra.
2. **Gửi duyệt** — nội dung được khóa để chờ Admin.
3. **Quản trị duyệt** — Admin kiểm tra phạm vi, rủi ro và điều kiện tự động xử lý.
4. **Đã phát hành** — phiên bản trước chuyển thành phiên bản cũ.
5. **Cập nhật chỉ mục** — cache và chỉ mục tìm kiếm được cập nhật tự động.

Quy tắc quan trọng:

- Kỹ thuật viên có thể tạo/sửa bản nháp và gửi duyệt nhưng không được tự phát hành.
- Chỉ Admin được phát hành, từ chối, đổi vòng đời hoặc rollback.
- AI chỉ đọc procedure đang **Published + Active**.
- Nội dung dành cho kỹ thuật viên hoặc rủi ro cao không được bật tự động hướng dẫn nhân viên.
- Có thể chọn **Tạo Playbook** từ một ticket đã xử lý để tạo bản nháp; phải rà soát trước khi gửi duyệt.

### 7.5. Giám sát Hệ thống & AI

Trong **Hệ thống & AI**, kiểm tra:

- trạng thái Backend, database, Playbook và chỉ mục;
- provider/model thực tế đang hoạt động;
- quota khi provider có cung cấp số liệu đáng tin cậy;
- độ trễ, handoff và chất lượng quyết định;
- các quyết định gần đây cần đánh giá;
- kết quả sandbox với một tình huống giả lập.

Tuyến cloud mặc định là:

```text
Gemini → Groq → OpenRouter → SambaNova
```

Nếu provider không gửi quota header, giao diện phải hiểu là **không xác định**, không phải còn 0. Khi toàn bộ cloud provider lỗi, Rules fallback vẫn phải giữ khả năng tạo ticket và bàn giao HelpDesk.

## 8. Quy trình vận hành đề xuất

### 8.1. Một ticket từ lúc tạo đến khi đóng

1. Nhân viên tạo ticket và gửi bằng chứng.
2. AI đối chiếu Playbook, phân loại và quyết định hướng dẫn hoặc bàn giao.
3. Nếu tự xử lý thành công, nhân viên xác nhận và đánh giá.
4. Nếu chưa được, ticket chuyển sang **Mới mở/HUMAN ONLY**.
5. Kỹ thuật viên nhận ticket, phân công và chuyển **Đang xử lý**.
6. Kỹ thuật viên trao đổi, ghi giải pháp và chuyển **Đã xử lý**.
7. Nhân viên kiểm tra, đánh giá hoặc mở lại nếu cần.
8. HelpDesk đóng ticket khi quy trình kết thúc.

### 8.2. Khi cần chuyển cấp ngay

Không hướng dẫn người dùng tự xử lý nếu tình huống liên quan:

- mật khẩu, tài khoản đặc quyền hoặc bảo mật;
- nghi ngờ malware/ransomware;
- mất dữ liệu hoặc nguy cơ ghi đè dữ liệu;
- tắt firewall, antivirus hoặc biện pháp kiểm soát;
- format ổ đĩa, reset thiết bị hoặc thay đổi hệ thống diện rộng;
- phần cứng điện, nhiệt, cháy khét hoặc nguy hiểm vật lý;
- nhiều người/phòng ban bị ảnh hưởng đồng thời.

Trong các trường hợp này, yêu cầu người dùng dừng thao tác rủi ro, giữ nguyên bằng chứng và chuyển HelpDesk.

## 9. Bảo mật, dữ liệu và giới hạn lưu trữ

- Không đưa secret hoặc credential vào Mini App, ticket, ảnh chụp, GitHub hoặc log.
- File đính kèm được lưu trong vùng private; quyền tải được kiểm tra theo ticket.
- Mã mời không được lưu ở dạng có thể đọc lại; hệ thống chỉ lưu HMAC hash.
- Refresh token gắn với thiết bị và được xoay khi sử dụng.
- Toàn hệ thống free-hosting lưu tối đa 30 ticket.
- Khi đạt giới hạn, ticket **Đã xử lý/Đã đóng** cũ nhất có thể được xóa cùng dữ liệu liên quan để tạo chỗ cho ticket mới.
- Ticket đang hoạt động không bị tự động xóa. Nếu cả 30 ticket đều đang hoạt động, hệ thống từ chối tạo ticket mới và yêu cầu HelpDesk xử lý bớt.
- Mỗi ticket có ngân sách file tối đa 10 MB tính cộng dồn qua lúc tạo và mọi lần phản hồi.

Môi trường Render/Supabase Free phù hợp pilot và sử dụng giới hạn, không có cam kết SLA doanh nghiệp. Không sử dụng cho dữ liệu nhạy cảm hoặc quy trình sản xuất quan trọng nếu chưa chuyển sang profile NAS/doanh nghiệp.

## 10. Xử lý sự cố thường gặp

### 10.1. Mã mời không hợp lệ hoặc hết hạn

- Kiểm tra đã nhập đủ 12 ký tự và đúng dấu gạch nhóm.
- Không dùng lại mã đã xác nhận trên thiết bị khác.
- Yêu cầu Admin thu hồi mã cũ và tạo mã mới.

### 10.2. Mini App yêu cầu đăng nhập lại

Nguyên nhân thường gặp:

- người dùng đã chọn **Đăng xuất khỏi thiết bị**;
- Admin đã thu hồi phiên;
- dữ liệu Mini App/Zalo bị xóa;
- phiên 90 ngày không còn hiệu lực.

Tạo mã mời mới và xác nhận lại thiết bị.

### 10.3. Không tạo được ticket

- Kiểm tra tiêu đề tối thiểu 4 ký tự và mô tả tối thiểu 10 ký tự.
- Bỏ bớt file nếu tổng dung lượng vượt 10 MB.
- Kiểm tra kết nối Internet và thử lại sau khi Backend thức dậy.
- Nếu hệ thống báo đạt giới hạn ticket, HelpDesk phải xử lý/đóng ticket đang hoạt động; không xóa dữ liệu thủ công.

### 10.4. Không xem được file

- Đăng nhập bằng đúng tài khoản đã tạo ticket hoặc tài khoản HelpDesk có quyền.
- Một số định dạng chỉ cho tải xuống, không xem trước trực tiếp.
- Nếu file bị lỗi, yêu cầu người gửi tải lại bản không chứa dữ liệu nhạy cảm.

### 10.5. Bot không phản hồi

- Render Free có thể đang cold start; chờ Backend khởi động rồi gửi lại một tin nhắn mới.
- Kiểm tra <https://zalo-it-helpdesk-pilot.onrender.com/health>.
- Nếu cuộc trò chuyện đã có ticket đang mở, tin nhắn mới sẽ được bổ sung vào ticket đó.
- Admin kiểm tra `bot.enabled`, `bot.configured` và `webhookRegistration.ok` trong health.
- Không đăng Bot Token hoặc webhook secret để nhờ kiểm tra.

### 10.6. Admin hiển thị giao diện cũ

- Nhấn `Ctrl+F5` trên máy tính.
- Trên điện thoại, đóng tab rồi mở lại hoặc xóa cache trình duyệt.
- Kiểm tra `/health` trả đúng Backend `5.18.6`.

### 10.7. AI/provider không sẵn sàng

- Kiểm tra **Hệ thống & AI** và health.
- Không hiểu quota không xác định là đã hết quota.
- Tiếp tục xử lý ticket thủ công; hệ thống phải cho phép tạo ticket bằng Rules fallback.
- Không thay đổi hoặc công khai API key trong quá trình xử lý.

## 11. Checklist sử dụng an toàn

### Nhân viên

- [ ] Mô tả rõ lỗi, thời điểm, mã lỗi và bước đã thử.
- [ ] Cung cấp thiết bị và vị trí nếu biết.
- [ ] Không gửi mật khẩu, OTP, key hoặc dữ liệu nhạy cảm.
- [ ] Phản hồi khi ticket ở trạng thái **Chờ bạn**.
- [ ] Kiểm tra và đánh giá sau khi xử lý.

### Kỹ thuật viên

- [ ] Xác nhận người phụ trách và mức ưu tiên.
- [ ] Đọc lịch sử/file trước khi đề xuất giải pháp.
- [ ] Kiểm chứng nội dung Copilot trước khi gửi.
- [ ] Ghi nguyên nhân và giải pháp khi hoàn tất.
- [ ] Cập nhật đúng trạng thái để SLA và báo cáo chính xác.

### Quản trị viên

- [ ] Chỉ cấp quyền tối thiểu cần thiết.
- [ ] Thu hồi mã/phiên/tài khoản không còn sử dụng.
- [ ] Chỉ phát hành Playbook đã kiểm tra an toàn.
- [ ] Theo dõi health, storage, ticket capacity và chất lượng AI.
- [ ] Không chạy migration hoặc thay đổi secret nếu không có kế hoạch phát hành/rollback rõ ràng.

## 12. Thông tin hỗ trợ

Khi báo lỗi hệ thống, cung cấp:

- thời điểm xảy ra lỗi;
- Mini App hay Admin/Zalo Bot;
- mã ticket nếu có;
- thao tác ngay trước khi lỗi xuất hiện;
- ảnh chụp đã che thông tin nhạy cảm;
- trạng thái từ `/health`, không kèm token, secret hoặc credential.

Không gửi mật khẩu, mã mời còn hiệu lực, Bot Token, webhook secret, Zalo App Secret, database URL hoặc AI key vào ticket/GitHub.

---

Cập nhật theo Production phiên bản 33, Mini App source `v5.17.2` và Backend/Admin `v5.18.6`.
