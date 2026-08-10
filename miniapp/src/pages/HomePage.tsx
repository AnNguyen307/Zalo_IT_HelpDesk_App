import { useApp } from "../context";
import { TicketCard } from "../components/TicketCard";
import { Icon } from "../components/Icon";
export function HomePage() {
  const { user, tickets, unreadCount, navigate } = useApp(),
    active = tickets.filter((t) => !["resolved", "closed"].includes(t.status)),
    waiting = tickets.filter((t) => t.status === "waiting_user").length,
    overdue = tickets.filter((t) => t.sla?.overdue).length,
    latest = tickets.slice(0, 3);
  const shortcuts = [
    ["printer", "Máy in", "Máy in Ricoh Offline hoặc không in"],
    ["network", "Mạng", "Máy tính không truy cập được Internet"],
    ["windows", "Windows", "Máy tính Windows chạy chậm"],
    ["account", "Tài khoản", "Tài khoản hoặc quyền truy cập gặp lỗi"],
  ] as const;
  const startFromShortcut = (title: string) => {
    sessionStorage.setItem("hd_new_ticket_template", title);
    navigate("new");
  };
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <span className="hero-kicker">
            Xin chào,{" "}
            {user?.name?.split(" ").slice(-1)[0] || "bạn"}
          </span>
          <span className="service-plate">IT SERVICE WORKSHOP · ĐANG TRỰC</span>
          <h1>Có sự cố, luôn biết ai đang xử lý.</h1>
          <p>Tạo yêu cầu, theo dõi SLA và xem rõ bước tiếp theo ngay trong Zalo.</p>
          <div className="hero-actions">
            <button className="primary" onClick={() => navigate("new")}>
              <Icon name="plus" /> Tạo yêu cầu hỗ trợ
            </button>
            <button className="secondary" onClick={() => navigate("tickets")}>
              Xem yêu cầu
            </button>
          </div>
        </div>
        <picture className="hero-visual">
          <source
            media="(min-width: 680px)"
            srcSet="/assets/helpdesk-support-1024.webp"
          />
          <img
            src="/assets/helpdesk-support-640.webp"
            alt="Nhân viên đang nhận hỗ trợ IT trực tuyến"
            width="640"
            height="420"
            fetchPriority="high"
          />
        </picture>
        <div className="hero-trust" aria-label="Cam kết hỗ trợ">
          <span>Đúng Playbook</span>
          <span>Theo dõi SLA</span>
          <span>Có kỹ thuật viên</span>
        </div>
      </section>
      {unreadCount > 0 && (
        <button
          className="unread-banner"
          onClick={() => navigate("notifications")}
        >
          <span>
            <strong>{unreadCount} cập nhật mới</strong>
            <small>Xem phản hồi HelpDesk</small>
          </span>
        </button>
      )}
      <section className="stat-row">
        <button onClick={() => navigate("tickets")}>
          <span className="stat-icon blue">
            <Icon name="tickets" />
          </span>
          <strong>{active.length}</strong>
          <small>Đang mở</small>
        </button>
        <button onClick={() => navigate("tickets")}>
          <span className="stat-icon amber">
            <Icon name="clock" />
          </span>
          <strong>{waiting}</strong>
          <small>Chờ bạn</small>
        </button>
        <button onClick={() => navigate("tickets")}>
          <span className={`stat-icon ${overdue ? "red" : "green"}`}>
            <Icon name={overdue ? "alert" : "check"} />
          </span>
          <strong>{overdue}</strong>
          <small>Quá SLA</small>
        </button>
      </section>
      <section className="section-heading">
        <div>
          <span className="eyebrow">GẦN ĐÂY</span>
          <h2>Yêu cầu của bạn</h2>
        </div>
        <button className="text-button" onClick={() => navigate("tickets")}>
          Xem tất cả <Icon name="arrow-right" />
        </button>
      </section>
      <div className="ticket-list">
        {latest.map((t) => (
          <TicketCard
            key={t.id}
            ticket={t}
            onClick={() => navigate("detail", t.id)}
          />
        ))}
        {!tickets.length && (
          <div className="empty-state">
            <span>
              <Icon name="check" size={30} />
            </span>
            <h3>Mọi thứ đang ổn</h3>
            <p>Chưa có yêu cầu hỗ trợ nào.</p>
            <button className="primary" onClick={() => navigate("new")}>
              Tạo ticket đầu tiên
            </button>
          </div>
        )}
      </div>
      <section className="section-heading shortcut-heading">
        <div>
          <span className="eyebrow">GỬI NHANH</span>
          <h2>Sự cố phổ biến</h2>
        </div>
        <small>Chọn để điền mẫu</small>
      </section>
      <div className="quick-signal-grid">
        {shortcuts.map(([icon, label, title]) => (
          <button key={label} onClick={() => startFromShortcut(title)}>
            <span><Icon name={icon} /></span>
            <strong>{label}</strong>
            <Icon name="arrow-right" size={16} />
          </button>
        ))}
      </div>
      <section className="process-card">
        <div className="process-copy">
          <span className="eyebrow">CÁCH HOẠT ĐỘNG</span>
          <h2>Gọn trong 3 bước</h2>
          <ol>
            <li>
              <b>1</b> Gửi mô tả và ảnh lỗi
            </li>
            <li>
              <b>2</b> HelpDesk kiểm tra
            </li>
            <li>
              <b>3</b> Theo dõi đến khi hoàn tất
            </li>
          </ol>
        </div>
        <img
          src="/assets/ticket-evidence-720.webp"
          alt="Chụp ảnh lỗi và gửi vào ticket"
          width="720"
          height="540"
          loading="lazy"
          decoding="async"
        />
      </section>
    </>
  );
}
