import type { ReactNode } from "react";
import { useApp } from "../context";
import type { Page } from "../types";
import { Icon } from "./Icon";

const nav: Array<{ page: Page; icon: "home" | "tickets" | "bell" | "user"; label: string }> = [
  { page: "home", icon: "home", label: "Trang chủ" },
  { page: "tickets", icon: "tickets", label: "Yêu cầu" },
  { page: "notifications", icon: "bell", label: "Thông báo" },
  { page: "profile", icon: "user", label: "Cá nhân" },
];

export function Layout({ children }: { children: ReactNode }) {
  const { page, navigate, user, unreadCount } = useApp();
  const active = page === "detail" || page === "new" ? "tickets" : page;
  return (
    <div className={`app-shell ${page === "detail" ? "detail-mode" : ""}`}>
      <header className="app-header">
        <button className="brand-button" onClick={() => navigate("home")} aria-label="Về trang chủ">
          <span className="brand-logo"><Icon name="shield" size={22} /></span>
          <span><strong>Zalo IT HelpDesk</strong><small>Service workshop</small></span>
        </button>
        <div className="header-actions">
          <button className="icon-button" onClick={() => navigate("notifications")} aria-label="Mở thông báo">
            <Icon name="bell" />{unreadCount > 0 && <b>{unreadCount > 99 ? "99+" : unreadCount}</b>}
          </button>
          <button className="avatar" onClick={() => navigate("profile")} aria-label="Mở hồ sơ">
            {user?.avatar ? <img src={user.avatar} alt="" /> : user?.name?.[0] || "U"}
          </button>
        </div>
      </header>
      <main className="page-content">{children}</main>
      <nav className="bottom-nav" aria-label="Điều hướng chính">
        {nav.map((item) => (
          <button key={item.page} className={active === item.page ? "active" : ""} onClick={() => navigate(item.page)}>
            <span><Icon name={item.icon} size={21} />{item.page === "notifications" && unreadCount > 0 && <b>{unreadCount > 9 ? "9+" : unreadCount}</b>}</span>
            <small>{item.label}</small>
          </button>
        ))}
      </nav>
    </div>
  );
}
