import { Icon } from "./components/Icon";
import { Layout } from "./components/Layout";
import { useApp } from "./context";
import { HomePage } from "./pages/HomePage";
import { InviteLoginPage } from "./pages/InviteLoginPage";
import { NewTicketPage } from "./pages/NewTicketPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { TicketDetailPage } from "./pages/TicketDetailPage";
import { TicketsPage } from "./pages/TicketsPage";

export default function App() {
  const { loading, page, user } = useApp();
  if (loading) return (
    <div className="splash system-state-screen">
      <div className="splash-logo"><Icon name="shield" size={34} /></div>
      <span className="state-kicker">IT SERVICE WORKSHOP</span>
      <h1>Đang chuẩn bị bàn hỗ trợ</h1>
      <p>Kết nối yêu cầu, tiến độ và kỹ thuật viên của bạn…</p>
      <span className="splash-loader" />
    </div>
  );
  if (!user) return <InviteLoginPage />;
  const content = page === "home" ? <HomePage />
    : page === "tickets" ? <TicketsPage />
      : page === "new" ? <NewTicketPage />
        : page === "detail" ? <TicketDetailPage />
          : page === "notifications" ? <NotificationsPage />
            : <ProfilePage />;
  return <Layout>{content}</Layout>;
}
