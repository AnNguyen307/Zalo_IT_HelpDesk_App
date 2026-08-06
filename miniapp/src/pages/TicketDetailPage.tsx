import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { AttachmentGallery, AttachmentList } from "../components/AttachmentList";
import { Icon } from "../components/Icon";
import { useApp } from "../context";
import { api } from "../lib/api";
import { toast } from "../lib/zalo";
import { categoryIcon, categoryLabel, formatDate, priorityLabel, statusLabel } from "../lib/ui";
import type { Attachment, Message, Ticket, TicketHistory } from "../types";

const historyLabel: Record<string, string> = {
  created: "Tạo ticket", status: "Đổi trạng thái", priority: "Đổi ưu tiên", assignment: "Phân công",
  message: "Trao đổi", attachment: "Đính kèm file", ai_handoff: "Bàn giao cho HelpDesk", sla_overdue: "Cảnh báo SLA", reopen: "Mở lại ticket", rating: "Đánh giá",
};
const MAX_FILE = 30 * 1024 * 1024;
const MAX_REPLY_BYTES = 120 * 1024 * 1024;
const MAX_REPLY_FILES = 4;
const ACCEPTED = "image/*,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip";

function timeLeft(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  const absolute = Math.abs(diff);
  const hours = Math.floor(absolute / 3_600_000);
  const minutes = Math.floor((absolute % 3_600_000) / 60_000);
  return `${diff < 0 ? "Quá hạn" : "Còn"} ${hours} giờ ${minutes} phút`;
}

function SelectedReplyFiles({ files, remove }: { files: File[]; remove: (index: number) => void }) {
  if (!files.length) return null;
  return <div className="reply-file-strip">{files.map((file, index) => <div key={`${file.name}-${file.lastModified}-${index}`}>
    <span className="reply-file-icon"><Icon name={file.type.startsWith("image/") ? "attachment" : "file"} /></span>
    <span><strong>{file.name}</strong><small>{(file.size / 1_048_576).toFixed(1)} MB</small></span>
    <button type="button" onClick={() => remove(index)} aria-label={`Bỏ ${file.name}`}>×</button>
  </div>)}</div>;
}

export function TicketDetailPage() {
  const { selectedTicketId, navigate, refreshTickets, refreshNotifications } = useApp();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [history, setHistory] = useState<TicketHistory[]>([]);
  const [reply, setReply] = useState("");
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [rating, setRating] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const messageEndRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!selectedTicketId) return;
    const result = await api.ticket(selectedTicketId);
    setTicket(result.ticket);
    setMessages(result.messages);
    setAttachments(result.attachments || []);
    setHistory(result.history || []);
    setRating(result.ticket.satisfaction?.score || 0);
    setRatingComment(result.ticket.satisfaction?.comment || "");
    await api.readTicketNotifications(selectedTicketId).catch(() => undefined);
    await refreshNotifications().catch(() => undefined);
    setLoading(false);
  }, [selectedTicketId, refreshNotifications]);

  useEffect(() => { load().catch((error) => { toast(error.message); setLoading(false); }); }, [load]);
  useEffect(() => {
    if (!loading && messages.length) window.requestAnimationFrame(() => {
      const thread = messageEndRef.current?.parentElement;
      if (thread) thread.scrollTo({ top: thread.scrollHeight });
    });
  }, [loading, messages.length]);
  useEffect(() => {
    if (!contextOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setContextOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [contextOpen]);

  function chooseReplyFiles(event: ChangeEvent<HTMLInputElement>) {
    const picked = [...(event.target.files || [])];
    event.target.value = "";
    if (!picked.length) return;
    const tooLarge = picked.find((file) => file.size > MAX_FILE);
    if (tooLarge) { toast(`${tooLarge.name} vượt quá giới hạn 30 MB`); return; }
    setReplyFiles((current) => {
      const next = [...current, ...picked];
      if (next.length > MAX_REPLY_FILES) toast(`Mỗi phản hồi tối đa ${MAX_REPLY_FILES} file`);
      const limited = next.slice(0, MAX_REPLY_FILES);
      const total = limited.reduce((sum, file) => sum + file.size, 0);
      if (total > MAX_REPLY_BYTES) { toast("Tổng file mỗi phản hồi vượt quá 120 MB"); return current; }
      return limited;
    });
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!ticket || (!reply.trim() && !replyFiles.length)) return;
    setSending(true);
    try {
      await api.sendReply(ticket.id, reply.trim(), replyFiles);
      setReply("");
      setReplyFiles([]);
      await load();
      await refreshTickets();
      toast("Đã gửi phản hồi");
    } catch (error) { toast(error instanceof Error ? error.message : "Không thể gửi phản hồi"); }
    finally { setSending(false); }
  }

  async function resolve() {
    if (!ticket) return;
    try { await api.resolve(ticket.id, "Đã thực hiện hướng dẫn và xác nhận sự cố được xử lý"); await load(); await refreshTickets(); toast("Ticket đã được đánh dấu xử lý"); }
    catch (error) { toast(error instanceof Error ? error.message : "Không thể cập nhật ticket"); }
  }

  async function reopen() {
    if (!ticket) return;
    const reason = window.prompt("Lý do mở lại ticket", "Sự cố đã tái diễn hoặc chưa được xử lý hoàn toàn");
    if (!reason?.trim()) return;
    try { await api.reopen(ticket.id, reason.trim()); await load(); await refreshTickets(); toast("Ticket đã được mở lại"); }
    catch (error) { toast(error instanceof Error ? error.message : "Không thể mở lại ticket"); }
  }

  async function submitRating() {
    if (!ticket || rating < 1) { toast("Hãy chọn từ 1 đến 5 sao"); return; }
    try { await api.rate(ticket.id, rating, ratingComment); await load(); await refreshTickets(); toast("Cảm ơn bạn đã đánh giá"); }
    catch (error) { toast(error instanceof Error ? error.message : "Không thể gửi đánh giá"); }
  }

  if (loading) return <div className="loading-card"><span className="splash-loader" /> Đang tải ticket…</div>;
  if (!ticket) return <div className="empty-state"><h3>Không tìm thấy ticket</h3><button onClick={() => navigate("tickets")}>Quay lại</button></div>;

  const finished = ["resolved", "closed"].includes(ticket.status);
  const ai = ticket.aiAnalysis;
  const guided = Boolean(ai?.canAutoHandle);
  const escalatedByAi = Boolean(ai && !ai.canAutoHandle);
  const humanOnly = Boolean(ticket.humanHandoff?.locked);
  const icon = categoryIcon[ticket.category] || "other";
  return <div className={`ticket-detail-page ${finished ? "" : "has-sticky-composer"}`}>
    <div className="ticket-detail-toolbar">
      <button className="back-button" onClick={() => navigate("tickets")}><Icon name="arrow-left" /> Danh sách</button>
      <button className="ticket-info-button" onClick={() => setContextOpen(true)}><Icon name="file" size={16} /> Thông tin</button>
    </div>

    <section className="ticket-detail-head">
      <div className="ticket-summary-main">
        <span className={`ticket-detail-icon category-${ticket.category}`}><Icon name={icon} size={21} /></span>
        <div className="ticket-summary-copy">
          <div className="ticket-summary-kicker"><span className="ticket-code">{ticket.code}</span><span className={`pill status-${ticket.status}`}>{statusLabel[ticket.status]}</span></div>
          <h1>{ticket.title}</h1>
          <p>{categoryLabel[ticket.category] || ticket.category} · {priorityLabel[ticket.priority]} · {formatDate(ticket.createdAt, true)}</p>
        </div>
      </div>
      <div className={`ticket-quick-sla ${ticket.sla.overdue ? "overdue" : ""}`}>
        <div><span><small>Phản hồi</small><strong>{ticket.sla.firstRespondedAt ? "Đã phản hồi" : timeLeft(ticket.sla.firstResponseDueAt)}</strong></span></div>
        <div><span><small>Hạn xử lý</small><strong>{finished ? "Đã hoàn tất" : timeLeft(ticket.sla.resolutionDueAt)}</strong></span></div>
      </div>
    </section>

    <section className="conversation conversation-card">
      <div className="conversation-head"><div><span className="eyebrow">TRAO ĐỔI TRỰC TIẾP</span><h2>Hội thoại hỗ trợ</h2></div><span className="message-count">{messages.length}</span></div>

      {guided && ai && !!ai.steps?.length && <details className="guidance-drawer">
        <summary><span><Icon name="book" size={18} /></span><div><strong>Hướng dẫn xử lý theo Playbook</strong><small>{ai.steps.length} bước đã được phê duyệt</small></div><b>Mở</b></summary>
        <div className="playbook-steps"><ol>{ai.steps.map((step, index) => <li key={`${step}-${index}`}><b>{index + 1}</b><span>{step}</span></li>)}</ol></div>
        {!humanOnly && <button className="resolve-button" onClick={resolve}><Icon name="check" /> Tôi đã xử lý được</button>}
      </details>}

      <div className="conversation-thread">
        {messages.length ? messages.map((message) => {
          const linked = attachments.filter((attachment) => attachment.messageId === message.id);
          const body = escalatedByAi && message.role === "assistant" ? "Đã chuyển yêu cầu cho kỹ thuật viên." : message.body;
          return <article key={message.id} className={`bubble ${message.role}`}><span className="bubble-avatar">{message.role === "assistant" ? <Icon name="bot" /> : message.role === "technician" ? "IT" : message.authorName?.[0] || "U"}</span><div><strong>{message.authorName}</strong><p>{body}</p>{linked.length > 0 && <AttachmentGallery attachments={linked} compact />}<time>{formatDate(message.createdAt, true)}</time></div></article>;
        }) : <div className="conversation-empty">Chưa có trao đổi trong ticket này.</div>}
        <div ref={messageEndRef} aria-hidden="true" />
      </div>
      {!finished && <div className="conversation-composer"><form className="reply-composer" onSubmit={send}>
        <SelectedReplyFiles files={replyFiles} remove={(index) => setReplyFiles((current) => current.filter((_, currentIndex) => currentIndex !== index))} />
        <div className="reply-composer-row"><label className="reply-attach-button" title="Thêm ảnh hoặc file"><input type="file" multiple accept={ACCEPTED} onChange={chooseReplyFiles} disabled={sending} /><Icon name="attachment" /></label><textarea value={reply} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setReply(event.target.value)} placeholder={humanOnly ? "Nhắn cho kỹ thuật viên…" : guided ? "Gửi kết quả sau khi thực hiện…" : "Nhập phản hồi hoặc mã lỗi…"} rows={1} /><button className="reply-send-button" aria-label="Gửi phản hồi" disabled={sending || (!reply.trim() && !replyFiles.length)}>{sending ? "…" : <Icon name="send" />}</button></div>
        <small className="reply-hint">Tối đa {MAX_REPLY_FILES} file · 30 MB/file · tổng 120 MB</small>
      </form></div>}
    </section>

    {finished && <section className="completion-actions"><button className="reopen-button" onClick={reopen}><Icon name="refresh" /> Mở lại ticket</button><div className="rating-card"><div className="card-title-row"><span className="card-title-icon amber"><Icon name="star" /></span><div><h3>Đánh giá hài lòng</h3><small>Giúp HelpDesk cải thiện</small></div></div><div className="stars">{[1,2,3,4,5].map(value => <button key={value} className={value <= rating ? "active" : ""} onClick={() => setRating(value)}><Icon name="star" size={29} /></button>)}</div><textarea rows={3} value={ratingComment} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setRatingComment(event.target.value)} placeholder="Điều gì đã làm tốt hoặc cần cải thiện?" /><button className="primary" onClick={submitRating}>{ticket.satisfaction ? "Cập nhật đánh giá" : "Gửi đánh giá"}</button></div></section>}

    {contextOpen && <div className="ticket-context-backdrop" onClick={() => setContextOpen(false)}>
      <section className="ticket-context-sheet" role="dialog" aria-modal="true" aria-labelledby="ticket-context-title" onClick={(event) => event.stopPropagation()}>
        <header><div><span>CHI TIẾT TICKET</span><h2 id="ticket-context-title">Thông tin hỗ trợ</h2></div><button onClick={() => setContextOpen(false)} aria-label="Đóng thông tin ticket">×</button></header>
        <div className="ticket-context-scroll">
          <section className="context-section"><div className="card-title-row"><div><h3>Mô tả sự cố</h3><small>Thông tin ban đầu</small></div></div><p>{ticket.description}</p>{(ticket.device || ticket.location) && <div className="detail-meta">{ticket.device && <span><Icon name="device" /> {ticket.device}</span>}{ticket.location && <span><Icon name="location" /> {ticket.location}</span>}</div>}</section>

          {ai && <section className={`agent-card embedded ${guided ? "safe" : "escalated"}`}>
            <div className="agent-title"><span className="agent-icon"><Icon name={guided ? "book" : "alert"} /></span><div><span className="eyebrow">QUYẾT ĐỊNH TỰ ĐỘNG</span><h3>{guided ? "Có Playbook phù hợp" : "Đã chuyển kỹ thuật viên"}</h3></div><b>{guided ? "Hướng dẫn" : "Escalated"}</b></div>
            <p>{ai.summary}</p>
            <div className="agent-runtime"><span><Icon name="bot" size={15} /> {ai.source.includes("playbook") ? "Enterprise Playbook" : ai.source}</span>{ai.model && <span>{ai.model}</span>}<span>{Math.round(ai.confidence * 100)}%</span></div>
            {!guided && <div className="handoff-note"><Icon name="shield" /><span>Không đưa gợi ý suy đoán. Ticket đã được chuyển để HelpDesk kiểm tra trực tiếp.</span></div>}
            <small>{ai.reason}</small>
          </section>}
          <AttachmentList attachments={attachments} />

          <section className="context-history"><h3><Icon name="refresh" size={17} /> Lịch sử thay đổi</h3><div className="history-list">{history.map(item => <div key={item.id}><span className="history-dot"/><div><strong>{historyLabel[item.type] || item.type}</strong>{item.note && <p>{item.note}</p>}<small>{item.actorName} · {formatDate(item.createdAt, true)}</small></div></div>)}</div></section>
        </div>
      </section>
    </div>}
  </div>;
}
