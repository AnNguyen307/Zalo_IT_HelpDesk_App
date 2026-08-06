import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, setApiToken } from "./lib/api";
import { clearSession, getZaloIdentity, readSession, saveSession, toast } from "./lib/zalo";
import type { AppNotification, Page, Ticket, User } from "./types";

interface AppContextValue {
  loading: boolean;
  user: User | null;
  tickets: Ticket[];
  notifications: AppNotification[];
  unreadCount: number;
  page: Page;
  selectedTicketId: string | null;
  navigate: (page: Page, ticketId?: string) => void;
  refreshTickets: () => Promise<void>;
  refreshNotifications: (silent?: boolean) => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  updateProfile: (department: string, phone: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [page, setPage] = useState<Page>("home");
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const previousUnread = useRef(0);

  const refreshTickets = useCallback(async () => {
    const result = await api.tickets();
    setTickets(result.tickets);
  }, []);

  const refreshNotifications = useCallback(async (silent = false) => {
    const result = await api.notifications();
    setNotifications(result.notifications);
    setUnreadCount(result.unreadCount);
    if (silent && result.unreadCount > previousUnread.current) toast("Bạn có phản hồi HelpDesk mới");
    previousUnread.current = result.unreadCount;
  }, []);

  const authenticate = useCallback(async (profile?: { department?: string; phone?: string }) => {
    const identity = await getZaloIdentity();
    const result = await api.loginZalo({ ...identity, ...profile });
    setApiToken(result.token);
    saveSession(result.token);
    setUser(result.user);
    return result.user;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const cached = readSession();
        if (cached) {
          setApiToken(cached);
          try {
            const result = await api.me();
            setUser(result.user);
          } catch {
            clearSession();
            await authenticate();
          }
        } else await authenticate();
        await Promise.all([refreshTickets(), refreshNotifications()]);
        const ticketFromLink = new URLSearchParams(window.location.search).get("ticket");
        if (ticketFromLink) {
          setSelectedTicketId(ticketFromLink);
          setPage("detail");
        }
      } catch (error) {
        toast(error instanceof Error ? error.message : "Không thể đăng nhập HelpDesk");
      } finally {
        setLoading(false);
      }
    })();
  }, [authenticate, refreshNotifications, refreshTickets]);

  useEffect(() => {
    if (!user) return;
    const timer = window.setInterval(() => {
      refreshNotifications(true).catch(() => undefined);
      refreshTickets().catch(() => undefined);
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [user, refreshNotifications, refreshTickets]);

  const navigate = useCallback((next: Page, ticketId?: string) => {
    setPage(next);
    setSelectedTicketId(ticketId || null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const markNotificationRead = useCallback(async (notificationId: string) => {
    await api.readNotification(notificationId);
    await refreshNotifications();
  }, [refreshNotifications]);

  const markAllNotificationsRead = useCallback(async () => {
    await api.readAllNotifications();
    await refreshNotifications();
  }, [refreshNotifications]);

  const updateProfile = useCallback(async (department: string, phone: string) => {
    const updated = await authenticate({ department, phone });
    setUser(updated);
    toast("Đã cập nhật thông tin");
  }, [authenticate]);

  const logout = useCallback(async () => {
    clearSession();
    setApiToken("");
    setUser(null);
    setTickets([]);
    setNotifications([]);
    setUnreadCount(0);
    setLoading(true);
    try {
      await authenticate();
      await Promise.all([refreshTickets(), refreshNotifications()]);
      setPage("home");
    } finally { setLoading(false); }
  }, [authenticate, refreshNotifications, refreshTickets]);

  const value = useMemo(() => ({
    loading, user, tickets, notifications, unreadCount, page, selectedTicketId,
    navigate, refreshTickets, refreshNotifications, markNotificationRead, markAllNotificationsRead,
    updateProfile, logout,
  }), [loading, user, tickets, notifications, unreadCount, page, selectedTicketId, navigate, refreshTickets, refreshNotifications, markNotificationRead, markAllNotificationsRead, updateProfile, logout]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used inside AppProvider");
  return value;
}
