import { normalizeText } from "./utils.mjs";

export const KB_SEED = [
  {
    slug: "no-internet",
    title: "Máy tính không truy cập được Internet",
    category: "network",
    keywords: ["khong co mang", "mat mang", "no internet", "wifi khong vao", "limited", "dns"],
    risk: "low",
    autoEligible: true,
    summary: "Kiểm tra kết nối vật lý/Wi-Fi, IP, gateway và làm mới ngăn xếp mạng theo thứ tự an toàn.",
    steps: [
      "Kiểm tra biểu tượng mạng, dây LAN hoặc thử tắt/bật Wi-Fi; xác nhận các máy khác có bị cùng lỗi không.",
      "Mở Command Prompt và chạy: ipconfig /all. Ghi lại IPv4, Default Gateway và DNS.",
      "Nếu địa chỉ bắt đầu bằng 169.254, chạy: ipconfig /release rồi ipconfig /renew.",
      "Thử ping Default Gateway. Nếu không phản hồi, đổi cổng mạng/dây mạng hoặc đứng gần access point hơn.",
      "Nếu ping gateway được nhưng không mở web, chạy: ipconfig /flushdns, sau đó thử lại.",
      "Không tự đổi IP tĩnh hoặc DNS doanh nghiệp. Nếu nhiều người cùng mất mạng, chuyển HelpDesk ngay.",
    ],
  },
  {
    slug: "slow-network",
    title: "Mạng chậm hoặc chập chờn",
    category: "network",
    keywords: ["mang cham", "lag", "cham chap chon", "packet loss", "wifi yeu"],
    risk: "low",
    autoEligible: true,
    summary: "Khoanh vùng lỗi theo thiết bị, kết nối và phạm vi ảnh hưởng trước khi chuyển đội Network.",
    steps: [
      "Tạm dừng tải file lớn, đồng bộ cloud hoặc cuộc họp video không cần thiết.",
      "So sánh bằng một thiết bị khác trên cùng mạng và ghi lại khu vực, thời điểm xảy ra.",
      "Nếu dùng Wi-Fi, thử di chuyển gần access point; nếu có thể, thử dây LAN.",
      "Khởi động lại trình duyệt/ứng dụng đang chậm, không tự khởi động lại switch hoặc access point.",
      "Gửi HelpDesk ảnh kết quả speed test nội bộ hoặc ping gateway nếu sự cố tiếp diễn.",
    ],
  },
  {
    slug: "windows-slow",
    title: "Windows chạy chậm",
    category: "windows",
    keywords: ["may cham", "windows cham", "treo may", "lag may", "disk 100", "cpu 100"],
    risk: "low",
    autoEligible: true,
    summary: "Giảm tải an toàn, kiểm tra tài nguyên và khởi động lại trước khi can thiệp sâu.",
    steps: [
      "Lưu công việc đang mở, đóng các ứng dụng không dùng và chờ 2–3 phút.",
      "Mở Task Manager bằng Ctrl+Shift+Esc, chụp ảnh tab Processes nếu CPU, Memory hoặc Disk duy trì trên 90%.",
      "Kiểm tra dung lượng ổ C; nên còn ít nhất khoảng 15% dung lượng trống.",
      "Khởi động lại máy bằng Restart, không giữ nút nguồn trừ khi máy hoàn toàn không phản hồi.",
      "Không tự xóa thư mục Windows, Program Files hoặc chạy công cụ tối ưu không được công ty phê duyệt.",
    ],
  },
  {
    slug: "windows-bsod",
    title: "Windows màn hình xanh hoặc tự khởi động lại",
    category: "windows",
    keywords: ["man hinh xanh", "bsod", "blue screen", "stop code", "tu khoi dong lai"],
    risk: "high",
    autoEligible: false,
    summary: "Thu thập Stop Code và chuyển kỹ thuật viên; không tự sửa driver hoặc BIOS.",
    steps: [
      "Chụp ảnh Stop Code và phần trăm tiến trình nếu màn hình còn hiển thị.",
      "Ghi lại thao tác ngay trước khi lỗi xảy ra và lỗi đã lặp lại bao nhiêu lần.",
      "Ngắt thiết bị USB vừa cắm nếu có, sau đó để HelpDesk kiểm tra log và dump file.",
      "Không tự cập nhật BIOS, gỡ driver hoặc dùng phần mềm sửa lỗi không được phê duyệt.",
    ],
  },
  {
    slug: "ricoh-offline",
    title: "Máy in Ricoh Offline hoặc không in",
    category: "printer",
    keywords: ["ricoh", "printer offline", "may in offline", "khong in", "print queue", "hang lenh in"],
    risk: "low",
    autoEligible: true,
    summary: "Kiểm tra trạng thái máy, hàng đợi và kết nối mà không thay cấu hình IP máy in.",
    steps: [
      "Kiểm tra màn hình Ricoh có báo hết giấy, hết mực, kẹt giấy hoặc mã SC hay không.",
      "Trên Windows, mở Settings > Printers & scanners > chọn máy Ricoh > Open print queue.",
      "Xóa riêng các lệnh của bạn đang lỗi; không xóa lệnh của người khác nếu máy in dùng chung.",
      "Bỏ tùy chọn Pause Printing/Use Printer Offline nếu đang được bật.",
      "Tắt/bật nguồn máy in chỉ khi được phép và không có người đang scan/copy; chờ máy khởi động hoàn tất.",
      "Không đổi IP, port hoặc cài driver lạ. Gửi mã lỗi/mẫu máy cho HelpDesk nếu vẫn không in.",
    ],
  },
  {
    slug: "ricoh-paper-jam",
    title: "Máy in Ricoh bị kẹt giấy",
    category: "printer",
    keywords: ["ricoh ket giay", "paper jam", "ket giay", "jam"],
    risk: "medium",
    autoEligible: true,
    summary: "Tháo giấy đúng theo sơ đồ trên màn hình, tránh chạm cụm sấy nóng.",
    steps: [
      "Đọc vị trí kẹt giấy trên màn hình Ricoh và mở đúng nắp được chỉ dẫn.",
      "Kéo giấy chậm theo chiều chạy giấy bằng hai tay; kiểm tra không còn mảnh giấy vụn.",
      "Không chạm vào vùng có nhãn cảnh báo nhiệt độ cao hoặc trống ảnh màu xanh/đen.",
      "Đóng chắc các nắp và khay, sau đó in một trang thử.",
      "Nếu giấy rách, kẹt lặp lại hoặc có mã SC, dừng thao tác và chuyển kỹ thuật viên.",
    ],
  },
  {
    slug: "office-activation",
    title: "Microsoft Office yêu cầu kích hoạt",
    category: "office",
    keywords: ["office activation", "product unlicensed", "activate office", "word het han", "excel unlicensed"],
    risk: "medium",
    autoEligible: true,
    summary: "Kiểm tra tài khoản doanh nghiệp và kết nối; không dùng key/crack ngoài quy định.",
    steps: [
      "Kết nối mạng doanh nghiệp hoặc VPN được công ty cấp nếu chính sách yêu cầu.",
      "Trong Word/Excel, mở File > Account và kiểm tra đúng tài khoản công ty đang đăng nhập.",
      "Đăng xuất tài khoản cá nhân không liên quan, đóng toàn bộ ứng dụng Office rồi mở lại.",
      "Chụp ảnh trạng thái Product Information và mã lỗi nếu vẫn không kích hoạt.",
      "Không nhập product key mua ngoài, dùng crack hoặc công cụ KMS không do IT cung cấp.",
    ],
  },
  {
    slug: "outlook-sync",
    title: "Outlook không gửi/nhận hoặc không đồng bộ",
    category: "office",
    keywords: ["outlook khong gui", "outlook khong nhan", "disconnected", "trying to connect", "mail khong dong bo"],
    risk: "low",
    autoEligible: true,
    summary: "Kiểm tra Offline mode, kết nối và quota trước khi tạo lại profile.",
    steps: [
      "Kiểm tra Internet và góc dưới Outlook có hiển thị Working Offline/Disconnected không.",
      "Trong tab Send/Receive, bảo đảm Work Offline không được bật; chọn Send/Receive All Folders.",
      "Đăng nhập webmail để xác định lỗi thuộc tài khoản hay ứng dụng Outlook.",
      "Kiểm tra hộp thư đầy và thư lớn đang kẹt trong Outbox.",
      "Không tự xóa file PST/OST hoặc tạo profile mới trước khi HelpDesk sao lưu và xác nhận.",
    ],
  },
  {
    slug: "account-password",
    title: "Quên mật khẩu hoặc tài khoản bị khóa",
    category: "account",
    keywords: ["quen mat khau", "reset password", "account locked", "tai khoan bi khoa", "khong dang nhap"],
    risk: "high",
    autoEligible: false,
    summary: "Chuyển quy trình xác minh danh tính; AI không đặt lại mật khẩu và không yêu cầu mật khẩu hiện tại.",
    steps: [
      "Không gửi mật khẩu, mã OTP hoặc ảnh giấy tờ qua nội dung ticket.",
      "Dùng cổng tự phục hồi mật khẩu chính thức của doanh nghiệp nếu đã được cấp.",
      "Nếu tài khoản bị khóa hoặc không có self-service, chờ HelpDesk xác minh danh tính và mở khóa.",
    ],
  },
  {
    slug: "software-install",
    title: "Yêu cầu cài đặt phần mềm",
    category: "software",
    keywords: ["cai phan mem", "install software", "can quyen admin", "setup", "license"],
    risk: "medium",
    autoEligible: false,
    summary: "Thu thập tên, mục đích, phiên bản và giấy phép; chuyển phê duyệt trước khi cài.",
    steps: [
      "Cung cấp tên phần mềm, phiên bản, link nhà phát hành và mục đích công việc.",
      "Xác nhận phòng ban/manager phê duyệt và thông tin giấy phép nếu phần mềm trả phí.",
      "Không tự tải bản crack, key lạ hoặc tắt antivirus để cài đặt.",
      "HelpDesk sẽ kiểm tra tương thích và thực hiện bằng tài khoản quản trị được kiểm soát.",
    ],
  },
  {
    slug: "excel-not-responding",
    title: "Excel bị Not Responding hoặc không mở file",
    category: "office",
    keywords: ["excel not responding", "excel bi treo", "khong mo duoc file excel", "file excel loi"],
    risk: "low",
    autoEligible: true,
    summary: "Bảo vệ dữ liệu trước, thử mở ứng dụng/file theo cách an toàn và thu thập thông tin add-in.",
    steps: [
      "Chờ 2–3 phút nếu file lớn; không End Task ngay khi Excel vẫn đang dùng CPU/Disk.",
      "Nếu phải đóng, mở lại Excel và kiểm tra Document Recovery; lưu bản phục hồi bằng tên mới.",
      "Sao chép file về ổ cục bộ rồi thử mở, không chỉnh sửa trực tiếp bản duy nhất trên USB/network share.",
      "Thử mở Excel Safe Mode bằng Win+R, nhập: excel /safe.",
      "Nếu Safe Mode mở được, gửi HelpDesk danh sách add-in; không tự xóa file gốc.",
    ],
  },
];

function tokenScore(text, entry) {
  const haystack = normalizeText(`${entry.title} ${entry.summary} ${(entry.keywords || []).join(" ")}`);
  const tokens = [...new Set(normalizeText(text).split(" ").filter((token) => token.length > 2))];
  if (!tokens.length) return 0;
  let hits = 0;
  for (const token of tokens) if (haystack.includes(token)) hits += 1;
  const keywordBonus = (entry.keywords || []).some((keyword) => normalizeText(text).includes(normalizeText(keyword))) ? 0.45 : 0;
  return Math.min(1, hits / Math.max(3, tokens.length) + keywordBonus);
}

export function searchKnowledgeBase(text, entries, limit = 3) {
  return entries
    .filter((entry) => entry.active !== false)
    .map((entry) => ({ ...entry, score: tokenScore(text, entry) }))
    .filter((entry) => entry.score > 0.08)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
