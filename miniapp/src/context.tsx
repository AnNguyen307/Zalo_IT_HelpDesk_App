import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, setApiRefreshHandler, setApiToken } from "./lib/api";
import { clearSession, getDeviceId, readSession, saveSession, toast } from "./lib/zalo";
import type { AppNotification, Page, Ticket, User } from "./types";

interface AppContextValue {
  loading: boolean;
  authError: string;
  user: User | null;
  tickets: Ticket[];
  notifications: AppNotification[];
  unreadCount: number;
  page: Page;
  selectedTicketId: string | null;
  loginWithInvite: (code: string) => Promise<void>;
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
  const [authError, setAuthError] = useState("");
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

  const refreshAccessSession = useCallback(async () => {
    const cached = readSession();
    if (!cached?.refreshToken) return false;
    try {
      const result = await api.refreshSession({ refreshToken: cached.refreshToken, deviceId: getDeviceId() });
      setApiToken(result.token);
      saveSession(result.token, result.refreshToken);
      setUser(result.user);
      setAuthError("");
      return true;
    } catch {
      clearSession();
      setApiToken("");
      setUser(null);
      setAuthError("");
      return false;
    }
  }, []);

  useEffect(() => {
    setApiRefreshHandler(refreshAccessSession);
    return () => setApiRefreshHandler(null);
  }, [refreshAccessSession]);

  useEffect(() => {
    (async () => {
      const cached = readSession();
      if (!cached) {
        setLoading(false);
        return;
      }
      try {
        setApiToken(cached.accessToken);
        const result = await api.me();
        setUser(result.user);
        await Promise.all([refreshTickets(), refreshNotifications()]);
        const ticketFromLink = new URLSearchParams(window.location.search).get("ticket");
        if (ticketFromLink) {
          setSelectedTicketId(ticketFromLink);
          setPage("detail");
        }
      } catch (error) {
        setAuthError(readSession() ? (error instanceof Error ? error.message : "Không thể kết nối HelpDesk") : "");
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshNotifications, refreshTickets]);

  useEffect(() => {
    if (!user) return;
    const timer = window.setInterval(() => {
      refreshNotifications(true).catch(() => undefined);
      refreshTickets().catch(() => undefined);
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [user, refreshNotifications, refreshTickets]);

  const loginWithInvite = useCallback(async (code: string) => {
    setAuthError("");
    try {
      const result = await api.loginInvite({ code, deviceId: getDeviceId() });
      setApiToken(result.token);
      saveSession(result.token, result.refreshToken);
      setUser(result.user);
      setPage("home");
      await Promise.all([refreshTickets(), refreshNotifications()]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể xác nhận mã mời";
      setAuthError(message);
      throw error;
    }
  }, [refreshNotifications, refreshTickets]);

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
    const result = await api.updateProfile({ department, phone });
    setUser(result.user);
    toast("Đã cập nhật thông tin");
  }, []);

  const logout = useCallback(async () => {
    const cached = readSession();
    if (cached?.refreshToken) {
      await api.logoutSession({ refreshToken: cached.refreshToken, deviceId: getDeviceId() }).catch(() => undefined);
    }
    clearSession();
    setApiToken("");
    setUser(null);
    setTickets([]);
    setNotifications([]);
    setUnreadCount(0);
    setAuthError("");
    setPage("home");
  }, []);

  const value = useMemo(() => ({
    loading, authError, user, tickets, notifications, unreadCount, page, selectedTicketId,
    loginWithInvite, navigate, refreshTickets, refreshNotifications, markNotificationRead, markAllNotificationsRead,
    updateProfile, logout,
  }), [loading, authError, user, tickets, notifications, unreadCount, page, selectedTicketId, loginWithInvite, navigate, refreshTickets, refreshNotifications, markNotificationRead, markAllNotificationsRead, updateProfile, logout]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used inside AppProvider");
  return value;
}
