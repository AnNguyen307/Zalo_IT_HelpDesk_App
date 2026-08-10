import type { AppNotification, Attachment, Message, Satisfaction, Ticket, TicketHistory, User } from "../types";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8080").replace(/\/$/, "");
let sessionToken = "";

export function setApiToken(token: string) { sessionToken = token; }

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body !== undefined && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  headers.set("ngrok-skip-browser-warning", "1");
  if (sessionToken) headers.set("Authorization", `Bearer ${sessionToken}`);
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Lỗi kết nối (${response.status})`);
  return body as T;
}

export function isPreviewableMime(mimeType: string) {
  return ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf", "text/plain", "text/csv"].includes(String(mimeType || "").toLowerCase());
}


async function fetchAttachmentBlob(attachment: Attachment, preview = false) {
  const headers = new Headers({ "ngrok-skip-browser-warning": "1" });
  if (sessionToken) headers.set("Authorization", `Bearer ${sessionToken}`);
  const suffix = preview ? "?preview=1" : "";
  const response = await fetch(`${API_BASE}/api/attachments/${encodeURIComponent(attachment.id)}${suffix}`, { headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `${preview ? "Không thể xem trước" : "Không thể tải file"} (${response.status})`);
  }
  return response.blob();
}

export const api = {
  loginZalo: (payload: Record<string, unknown>) => request<{ token: string; user: User }>("/api/auth/zalo", { method: "POST", body: JSON.stringify(payload) }),
  me: () => request<{ user: User; settings?: { notificationPollSeconds?: number } }>("/api/me"),
  tickets: () => request<{ tickets: Ticket[] }>("/api/tickets"),
  createTicket: (payload: { title: string; description: string; location?: string; device?: string }) => request<{ ticket: Ticket; messages: Message[] }>("/api/tickets", { method: "POST", body: JSON.stringify(payload) }),
  ticket: (id: string) => request<{ ticket: Ticket; messages: Message[]; attachments: Attachment[]; history: TicketHistory[] }>(`/api/tickets/${encodeURIComponent(id)}`),
  sendMessage: (id: string, message: string) => request<{ messages: Message[] }>(`/api/tickets/${encodeURIComponent(id)}/messages`, { method: "POST", body: JSON.stringify({ message }) }),
  sendReply: async (id: string, message: string, files: File[]) => {
    const form = new FormData();
    form.append("message", message);
    for (const file of files) form.append("attachments", file, file.name);
    return request<{ messages: Message[]; attachments: Attachment[] }>(`/api/tickets/${encodeURIComponent(id)}/replies`, {
      method: "POST",
      body: form,
    });
  },
  resolve: (id: string, resolution: string) => request<{ ticket: Ticket }>(`/api/tickets/${encodeURIComponent(id)}/confirm-resolved`, { method: "POST", body: JSON.stringify({ resolution }) }),
  requestHumanHelp: (id: string) => request<{ ticket: Ticket; messages: Message[]; humanHandoff: Ticket["humanHandoff"]; copilotQueued: boolean }>(`/api/tickets/${encodeURIComponent(id)}/request-human-help`, { method: "POST", body: JSON.stringify({}) }),
  reopen: (id: string, reason: string) => request<{ ticket: Ticket }>(`/api/tickets/${encodeURIComponent(id)}/reopen`, { method: "POST", body: JSON.stringify({ reason }) }),
  rate: (id: string, score: number, comment: string) => request<{ satisfaction: Satisfaction }>(`/api/tickets/${encodeURIComponent(id)}/rating`, { method: "POST", body: JSON.stringify({ score, comment }) }),
  uploadAttachment: async (ticketId: string, file: File) => {
    const form = new FormData();
    form.append("file", file, file.name);
    return request<{ attachment: Attachment }>(`/api/tickets/${encodeURIComponent(ticketId)}/attachments`, {
      method: "POST",
      body: form,
    });
  },
  attachmentBlob: fetchAttachmentBlob,
  downloadAttachment: async (attachment: Attachment) => {
    const blob = await fetchAttachmentBlob(attachment, false);
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = attachment.fileName;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(href), 30_000);
  },
  notifications: () => request<{ notifications: AppNotification[]; unreadCount: number }>("/api/notifications"),
  readNotification: (id: string) => request<{ notification: AppNotification }>(`/api/notifications/${encodeURIComponent(id)}/read`, { method: "POST" }),
  readAllNotifications: () => request<{ ok: boolean }>("/api/notifications/read-all", { method: "POST" }),
  readTicketNotifications: (ticketId: string) => request<{ ok: boolean }>(`/api/tickets/${encodeURIComponent(ticketId)}/read-notifications`, { method: "POST" }),
};
