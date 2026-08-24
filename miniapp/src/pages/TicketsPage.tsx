import { useMemo, useState, type ChangeEvent } from "react";
import { TicketCard } from "../components/TicketCard";
import { Icon } from "../components/Icon";
import { useApp } from "../context";
const filters = [
  ["all", "Tất cả"],
  ["active", "Đang xử lý"],
  ["waiting_user", "Chờ tôi"],
  ["resolved", "Hoàn tất"],
] as const;
export function TicketsPage() {
  const { tickets, navigate } = useApp();
  const [filter, setFilter] = useState("all"),
    [query, setQuery] = useState("");
  const visible = useMemo(
    () =>
      tickets.filter((t) => {
        const q = query.trim().toLowerCase();
        if (
          q &&
          !`${t.code} ${t.title} ${t.description} ${t.category}`
            .toLowerCase()
            .includes(q)
        )
          return false;
        if (filter === "all") return true;
        if (filter === "active")
          return !["resolved", "closed"].includes(t.status);
        if (filter === "overdue") return !!t.sla?.overdue;
        return t.status === filter;
      }),
    [tickets, filter, query],
  );
  return (
    <>
      <section className="page-title page-title-row">
        <div>
          <span className="eyebrow">TICKET</span>
          <h1>Yêu cầu của tôi</h1>
          <p>Theo dõi trạng thái và người phụ trách.</p>
        </div>
        <button className="compact-create" onClick={() => navigate("new")}>
          <Icon name="plus" /> Tạo mới
        </button>
      </section>
      <label className="search-box">
        <Icon name="search" />
        <input
          value={query}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setQuery(e.target.value)
          }
          placeholder="Tìm theo mã hoặc nội dung…"
        />
      </label>
      <div className="filter-chips">
        {filters.map(([v, l]) => (
          <button
            key={v}
            className={filter === v ? "active" : ""}
            onClick={() => setFilter(v)}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="list-summary">
        <strong>{visible.length} yêu cầu</strong>
        <span>Cập nhật mới nhất</span>
      </div>
      <div className="ticket-list">
        {visible.map((t) => (
          <TicketCard
            key={t.id}
            ticket={t}
            onClick={() => navigate("detail", t.id)}
          />
        ))}
      </div>
      {!visible.length && (
        <div className="empty-state visual-empty">
          <img
            src="/assets/helpdesk-support-640.webp"
            alt=""
            width="640"
            height="420"
            loading="lazy"
          />
          <div>
            <h3>Không tìm thấy ticket</h3>
            <p>Thử đổi bộ lọc hoặc từ khóa.</p>
          </div>
        </div>
      )}
    </>
  );
}
