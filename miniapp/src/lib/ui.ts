import type { Priority, Ticket, TicketStatus } from "../types";

export const statusLabel: Record<TicketStatus, string> = {
  open: "Mới",
  waiting_user: "Chờ bạn phản hồi",
  in_progress: "Đang xử lý",
  resolved: "Đã giải quyết",
  closed: "Đã đóng",
};

export const priorityLabel: Record<Priority, string> = {
  low: "Thấp",
  normal: "Bình thường",
  high: "Cao",
  urgent: "Khẩn cấp",
};

export const categoryLabel: Record<string, string> = {
  network: "Mạng",
  printer: "Máy in",
  windows: "Windows",
  office: "Office",
  account: "Tài khoản",
  software: "Phần mềm",
  hardware: "Phần cứng",
  other: "Khác",
};

export const categoryIcon: Record<string, "network" | "printer" | "windows" | "office" | "account" | "software" | "hardware" | "other"> = {
  network: "network",
  printer: "printer",
  windows: "windows",
  office: "office",
  account: "account",
  software: "software",
  hardware: "hardware",
  other: "other",
};

export function formatDate(value?: string | null, time = false) {
  if (!value) return "—";
  const date = new Date(value);
  return time
    ? date.toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("vi-VN");
}

export function relativeTime(value?: string | null) {
  if (!value) return "—";
  const elapsed = Date.now() - new Date(value).getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (elapsed < minute) return "Vừa xong";
  if (elapsed < hour) return `${Math.floor(elapsed / minute)} phút trước`;
  if (elapsed < day) return `${Math.floor(elapsed / hour)} giờ trước`;
  if (elapsed < 7 * day) return `${Math.floor(elapsed / day)} ngày trước`;
  return formatDate(value);
}

export function ticketOwner(ticket: Ticket) {
  if (ticket.assignedTo) return ticket.assignedTo;
  if (ticket.humanHandoff?.locked) return "Đội HelpDesk";
  if (ticket.aiAnalysis?.canAutoHandle) return "Trợ lý thông minh";
  return "Đang phân công";
}

export function ticketNextStep(ticket: Ticket) {
  if (ticket.status === "waiting_user") return "Bạn gửi thêm thông tin";
  if (ticket.status === "resolved") return "Bạn xác nhận kết quả";
  if (ticket.status === "closed") return "Không còn bước xử lý";
  if (ticket.humanHandoff?.locked && !ticket.assignedTo) return "HelpDesk phân công kỹ thuật viên";
  if (ticket.status === "in_progress") return "Kỹ thuật viên cập nhật xử lý";
  if (ticket.aiAnalysis?.canAutoHandle) return "Thực hiện checklist đã duyệt";
  return "HelpDesk kiểm tra yêu cầu";
}

export function ticketActionSignal(ticket: Ticket) {
  if (ticket.status === "waiting_user") return { label: "Bạn cần phản hồi", tone: "attention" };
  if (ticket.status === "resolved") return { label: "Bạn cần xác nhận", tone: "attention" };
  if (ticket.status === "closed") return { label: "Không cần hành động", tone: "complete" };
  return { label: "HelpDesk đang xử lý", tone: "active" };
}

export function ticketStageIndex(ticket: Ticket) {
  if (["resolved", "closed"].includes(ticket.status)) return 3;
  if (ticket.assignedTo || ticket.humanHandoff?.locked || ["in_progress", "waiting_user"].includes(ticket.status)) return 2;
  if (ticket.aiAnalysis) return 1;
  return 0;
}
