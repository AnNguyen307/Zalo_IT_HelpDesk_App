import type { Ticket } from "../types";
import {
  categoryIcon,
  categoryLabel,
  priorityLabel,
  relativeTime,
  statusLabel,
  ticketActionSignal,
  ticketNextStep,
  ticketOwner,
  ticketStageIndex,
} from "../lib/ui";
import { Icon } from "./Icon";

const stages = ["Đã nhận", "Đối chiếu", "IT xử lý", "Hoàn tất"];

export function TicketCard({ ticket, onClick }: { ticket: Ticket; onClick: () => void }) {
  const icon = categoryIcon[ticket.category] || "other";
  const action = ticketActionSignal(ticket);
  const stage = ticketStageIndex(ticket);
  return (
    <button className={`ticket-card ${ticket.sla?.overdue ? "ticket-overdue" : ticket.sla?.paused ? "ticket-sla-paused" : ""}`} onClick={onClick}>
      <span className={`ticket-category-icon category-${ticket.category}`}><Icon name={icon} /></span>
      <span className="ticket-card-body">
        <span className="ticket-card-top">
          <span className="ticket-code">{ticket.code}</span>
          <span className={`pill status-${ticket.status}`}>{statusLabel[ticket.status]}</span>
        </span>
        <strong>{ticket.title}</strong>
        <span className="ticket-description">{ticket.description}</span>
        <span className="ticket-signal-grid">
          <span><small>Phụ trách</small><b>{ticketOwner(ticket)}</b></span>
          <span><small>Bước tiếp theo</small><b>{ticketNextStep(ticket)}</b></span>
        </span>
        <span className="ticket-stage-mini" aria-label={`Tiến độ: ${stages[stage]}`}>
          {stages.map((label, index) => <i key={label} className={index < stage ? "done" : index === stage ? "current" : ""}><b />{label}</i>)}
        </span>
        <span className="ticket-card-footer">
          <span>{categoryLabel[ticket.category] || ticket.category}</span>
          <span className={`priority priority-${ticket.priority}`}>{priorityLabel[ticket.priority]}</span>
          <span className={`action-signal ${action.tone}`}>{action.label}</span>
          {ticket.attachmentCount ? <span><Icon name="attachment" size={13} /> {ticket.attachmentCount}</span> : null}
          <time>{relativeTime(ticket.updatedAt)}</time>
        </span>
      </span>
      <Icon name="arrow-right" className="ticket-card-arrow" />
    </button>
  );
}
