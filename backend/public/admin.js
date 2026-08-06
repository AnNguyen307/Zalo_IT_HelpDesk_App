const state = {
  token: sessionStorage.getItem("hd_admin") || "",
  user: null, tickets: [], stats: null, kb: [], agent: null, playbook: null, governance: null, procedures: [], activeTab: "tickets",
};
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const labels = {
  open: "Mới mở", waiting_user: "Chờ người dùng", in_progress: "Đang xử lý", resolved: "Đã xử lý", closed: "Đã đóng",
  urgent: "Khẩn cấp", high: "Cao", normal: "Bình thường", low: "Thấp",
  network: "Mạng", printer: "Máy in", windows: "Windows", office: "Office", account: "Tài khoản", software: "Phần mềm", hardware: "Phần cứng", other: "Khác",
};
const escalationLabels = {
  no_playbook_match: "Không có Playbook phù hợp",
  playbook_not_auto_eligible: "Playbook yêu cầu kỹ thuật viên",
  low_confidence: "Chưa đủ độ tin cậy",
  agent_unavailable: "AI Agent chưa sẵn sàng",
  policy_blocked: "Bị chặn bởi chính sách an toàn",
};
const historyLabels = { created: "Tạo ticket", status: "Đổi trạng thái", priority: "Đổi ưu tiên", assignment: "Phân công", message: "Trao đổi", attachment: "Đính kèm", ai_handoff: "Bàn giao cho HelpDesk", sla_overdue: "Cảnh báo SLA", reopen: "Mở lại", rating: "Đánh giá" };
const tabMeta = {
  tickets: ["Tổng quan Ticket", "Theo dõi yêu cầu, SLA và quyết định xử lý theo thời gian thực."],
  knowledge: ["Knowledge Base", "Quản lý checklist ngắn hỗ trợ kỹ thuật viên và Playbook."],
  governance: ["Vòng đời Playbook", "Tạo, duyệt, phát hành và rollback procedure với lịch sử đầy đủ."],
  playbook: ["Enterprise Playbook", "Kiểm tra nguồn quy trình chính thức và semantic index."],
  agent: ["AI HelpDesk Agent", "Giám sát Ollama, chính sách Strict Mode và thử nghiệm quyết định."],
};
const statIcons = ["▦", "◉", "↻", "!", "✓", "★"];
const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
const formatDate = (value) => value ? new Date(value).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }) : "—";
const formatSize = (bytes = 0) => bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
const timeLeft = (iso) => {
  if (!iso) return "Chưa xác định";
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  const hours = Math.floor(abs / 3600000);
  const minutes = Math.floor((abs % 3600000) / 60000);
  return `${diff < 0 ? "Quá hạn" : "Còn"} ${hours}h ${minutes}m`;
};
const initials = (name = "U") => name.split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]).join("").toUpperCase();

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("ngrok-skip-browser-warning", "1");
  if (options.body !== undefined && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (state.token) headers.set("Authorization", `Bearer ${state.token}`);
  const response = await fetch(path, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

const PREVIEWABLE_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf", "text/plain", "text/csv"]);
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
const MAX_REPLY_UPLOAD_BYTES = 120 * 1024 * 1024;
const MAX_REPLY_FILES = 4;
const isPreviewableAttachment = (attachment) => PREVIEWABLE_MIME.has(String(attachment?.mimeType || "").toLowerCase());
async function attachmentBlob(attachment, preview = false) {
  const response = await fetch(`/api/attachments/${encodeURIComponent(attachment.id)}${preview ? "?preview=1" : ""}`, { headers: { Authorization: `Bearer ${state.token}`, "ngrok-skip-browser-warning": "1" } });
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || (preview ? "Không thể xem trước file" : "Không thể tải file")); }
  return response.blob();
}
async function downloadAttachment(attachment) {
  const blob = await attachmentBlob(attachment, false);
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href; anchor.download = attachment.fileName; anchor.click();
  setTimeout(() => URL.revokeObjectURL(href), 30000);
}
function previewDialog() {
  let dialog = $("#attachmentPreviewDialog");
  if (dialog) return dialog;
  dialog = document.createElement("dialog");
  dialog.id = "attachmentPreviewDialog";
  dialog.className = "attachment-preview-dialog";
  dialog.innerHTML = `<div class="attachment-preview-head"><div><strong id="previewFileName">Xem trước</strong><small id="previewFileType"></small></div><button id="closeAttachmentPreview" type="button" aria-label="Đóng">×</button></div><div id="attachmentPreviewBody" class="attachment-preview-body-admin"></div><div class="attachment-preview-actions"><button id="previewDownload" class="button subtle-button" type="button">↓ Tải xuống</button><button id="previewCloseBottom" class="button primary-button" type="button">Đóng</button></div>`;
  document.body.appendChild(dialog);
  return dialog;
}
async function previewAttachment(attachment) {
  if (!isPreviewableAttachment(attachment)) { await downloadAttachment(attachment); return; }
  const dialog = previewDialog(); const body = $("#attachmentPreviewBody");
  $("#previewFileName").textContent = attachment.fileName; $("#previewFileType").textContent = attachment.mimeType;
  body.innerHTML = '<div class="preview-loading">Đang tải bản xem trước…</div>';
  if (!dialog.open) dialog.showModal();
  let href = "";
  try {
    const blob = await attachmentBlob(attachment, true);
    if (["text/plain", "text/csv"].includes(attachment.mimeType)) body.innerHTML = `<pre>${esc(await blob.text())}</pre>`;
    else { href = URL.createObjectURL(blob); body.innerHTML = attachment.mimeType.startsWith("image/") ? `<img src="${href}" alt="${esc(attachment.fileName)}"/>` : `<iframe src="${href}" title="${esc(attachment.fileName)}"></iframe>`; }
  } catch (error) { body.innerHTML = `<div class="preview-error">${esc(error.message)}</div>`; }
  const close = () => { if (href) URL.revokeObjectURL(href); dialog.close(); body.innerHTML = ""; };
  $("#closeAttachmentPreview").onclick = close; $("#previewCloseBottom").onclick = close;
  $("#previewDownload").onclick = () => downloadAttachment(attachment).catch((error) => toast(error.message));
  dialog.onclick = (event) => { if (event.target === dialog) close(); };
}
function toast(message) { const element = $("#toast"); element.textContent = message; element.classList.remove("hidden"); clearTimeout(toast.timer); toast.timer = setTimeout(() => element.classList.add("hidden"), 2800); }
function show() { $("#loginView").classList.toggle("hidden", Boolean(state.token)); $("#appView").classList.toggle("hidden", !state.token); }

function setHealth(dotSelector, textSelector, ready, text) {
  const dot = $(dotSelector); const label = $(textSelector);
  dot.classList.remove("pending", "ready", "error"); dot.classList.add(ready ? "ready" : "error"); label.textContent = text;
}
function switchTab(name) {
  state.activeTab = name;
  $$(".tab").forEach((item) => item.classList.toggle("active", item.dataset.tab === name));
  ["tickets", "knowledge", "governance", "playbook", "agent"].forEach((tab) => $(`#${tab}Tab`).classList.toggle("hidden", tab !== name));
  const [title, description] = tabMeta[name] || tabMeta.tickets;
  $("#activeSectionTitle").textContent = title; $("#activeSectionDescription").textContent = description;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function load() {
  const [me, tickets, stats, kb, agent, playbook, governance, procedures] = await Promise.all([
    api("/api/me"), api("/api/tickets"), api("/api/admin/stats"), api("/api/admin/knowledge-base"),
    api("/api/admin/agent/status").catch((error) => ({ agent: { ready: false, error: error.message } })),
    api("/api/admin/playbook/status").catch((error) => ({ playbook: { ready: false, error: error.message } })),
    api("/api/staff/playbook/governance/status").catch((error) => ({ governance: { ready: false, error: error.message, counts: {} } })),
    api("/api/staff/playbook/procedures").catch(() => ({ procedures: [] })),
  ]);
  state.user = me.user || null; state.tickets = tickets.tickets || []; state.stats = stats || {}; state.kb = kb.entries || [];
  state.agent = agent.agent || {}; state.playbook = playbook.playbook || {}; state.governance = governance.governance || {}; state.procedures = procedures.procedures || [];
  applyRoleVisibility(); renderStats(); renderTickets(); renderKb(); renderAgent(); renderPlaybook(); renderGovernance();
}

function applyRoleVisibility() {
  const admin = state.user?.role === "admin";
  $$(".admin-only").forEach((element) => element.classList.toggle("hidden", !admin));
  if ($("#newKbBtn")) $("#newKbBtn").classList.toggle("hidden", !admin);
  if ($("#staffIdentity")) $("#staffIdentity").textContent = `${state.user?.name || "Staff"} · ${admin ? "ADMIN" : "TECHNICIAN"}`;
}

function renderStats() {
  const byStatus = state.stats?.byStatus || {};
  const items = [
    ["Tổng ticket", state.stats?.total || 0, ""],
    ["Mới mở", byStatus.open || 0, ""],
    ["Đang xử lý", byStatus.in_progress || 0, ""],
    ["Quá SLA", state.stats?.overdue || 0, Number(state.stats?.overdue) ? "danger" : ""],
    ["Đã xử lý", (byStatus.resolved || 0) + (byStatus.closed || 0), "success"],
    ["Hài lòng TB", state.stats?.averageSatisfaction ? `${state.stats.averageSatisfaction}/5` : "—", "success"],
  ];
  $("#stats").innerHTML = items.map(([label, value, style], index) => `<article class="stat-card ${style}"><div class="stat-top"><span>${esc(label)}</span><b class="stat-icon">${statIcons[index]}</b></div><strong>${esc(value)}</strong><small>${index === 3 && Number(value) ? "Cần ưu tiên xử lý" : "Dữ liệu hiện tại"}</small></article>`).join("");
  const openCount = (byStatus.open || 0) + (byStatus.in_progress || 0) + (byStatus.waiting_user || 0);
  $("#openTicketBadge").textContent = openCount > 99 ? "99+" : String(openCount);
}

function renderTickets() {
  const query = $("#search").value.trim().toLowerCase();
  const status = $("#statusFilter").value; const priority = $("#priorityFilter")?.value || ""; const category = $("#categoryFilter")?.value || "";
  const tickets = state.tickets.filter((ticket) => {
    const haystack = `${ticket.code} ${ticket.title} ${ticket.description} ${ticket.category} ${ticket.assignedTo || ""} ${ticket.requesterName || ""}`.toLowerCase();
    return (!status || ticket.status === status) && (!priority || ticket.priority === priority) && (!category || ticket.category === category) && (!query || haystack.includes(query));
  });
  $("#ticketResultCount").textContent = `${tickets.length} / ${state.tickets.length} ticket`;
  $("#ticketRows").innerHTML = tickets.map((ticket) => {
    const analysis = ticket.aiAnalysis || {}; const guided = Boolean(analysis.canAutoHandle); const humanOnly = Boolean(ticket.humanHandoff?.locked);
    const decisionTitle = humanOnly ? "Chỉ hội thoại con người" : guided ? "Hướng dẫn theo Playbook" : "Đã chuyển kỹ thuật viên";
    const decisionReason = humanOnly ? "AI đã rời ticket và không phản hồi thêm" : guided ? `${Math.round((analysis.confidence || 0) * 100)}% · ${(analysis.playbookIds || []).join(", ") || analysis.source || "Playbook"}` : escalationLabels[analysis.escalationCode] || analysis.reason || "Không đủ điều kiện tự hướng dẫn";
    return `<tr class="${ticket.sla?.overdue ? "overdue-row" : ""}">
      <td><div class="ticket-link" data-ticket="${ticket.id}">${esc(ticket.code)}</div><div class="ticket-title-cell">${esc(ticket.title)}</div><div class="ticket-subline"><span>${formatDate(ticket.createdAt)}</span>${ticket.attachmentCount ? `<span>▧ ${ticket.attachmentCount}</span>` : ""}</div></td>
      <td><span class="badge">${esc(labels[ticket.category] || ticket.category)}</span> <span class="badge ${ticket.priority}">${esc(labels[ticket.priority] || ticket.priority)}</span></td>
      <td><span class="badge ${ticket.status}">${esc(labels[ticket.status] || ticket.status)}</span>${ticket.sla?.overdue ? '<div class="sla-danger">● Quá thời hạn SLA</div>' : ""}</td>
      <td class="decision-cell"><span class="badge ${humanOnly ? "escalate" : guided ? "guide" : "escalate"}">${humanOnly ? "HUMAN ONLY" : guided ? "✓ PLAYBOOK" : "↗ ESCALATE"}</span><strong>${esc(decisionTitle)}</strong><small>${esc(decisionReason)}</small></td>
      <td><strong class="ticket-updated">${formatDate(ticket.updatedAt)}</strong><div class="muted">${esc(ticket.assignedTo || "Chưa phân công")}</div></td>
    </tr>`;
  }).join("");
  $("#emptyTickets").classList.toggle("hidden", tickets.length > 0);
  $$('[data-ticket]').forEach((element) => { element.onclick = () => openTicket(element.dataset.ticket); });
}

function renderKb() {
  const canEdit = state.user?.role === "admin";
  $("#kbList").innerHTML = state.kb.map((entry) => `<article class="kb-card ${entry.active ? "" : "inactive"}"><div><span class="badge">${esc(labels[entry.category] || entry.category)}</span> <span class="badge ${entry.risk}">${esc(entry.risk)}</span></div><h3>${esc(entry.title)}</h3><p>${esc(entry.summary || "Chưa có tóm tắt.")}</p><footer><span class="muted">${entry.autoEligible ? "Có thể hỗ trợ khi Playbook cho phép" : "Chỉ dành cho kỹ thuật viên"}</span>${canEdit ? `<button class="button subtle-button compact" data-kb="${entry.id}">Sửa</button>` : '<span class="badge">READ ONLY</span>'}</footer></article>`).join("") || '<div class="empty-state"><span>◇</span><h3>Knowledge Base trống</h3><p>Hãy tạo hướng dẫn đầu tiên.</p></div>';
  $$('[data-kb]').forEach((element) => { element.onclick = () => editKb(element.dataset.kb); });
}

function healthCard(label, value, stateClass = "") { return `<div class="health-item ${stateClass}"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`; }
function renderPlaybook() {
  const playbook = state.playbook || {};
  const items = [
    ["Trạng thái", playbook.ready ? "Sẵn sàng" : "Chưa sẵn sàng", playbook.ready ? "ready" : "not-ready"],
    ["Bộ Playbook", playbook.name || "—", ""], ["Phiên bản", playbook.version || "—", ""], ["Procedure", playbook.totalEntries ?? "—", ""],
    ["Employee-safe", playbook.byAudience?.employee ?? 0, ""], ["Technician", playbook.byAudience?.technician ?? 0, ""],
    ["Embedding", playbook.embedModel || "—", ""], ["Semantic index", playbook.indexCurrent ? "Đã cập nhật" : (playbook.indexExists ? "Cần cập nhật" : "Chưa tạo"), playbook.indexCurrent ? "ready" : "not-ready"],
  ];
  $("#playbookStatus").innerHTML = items.map(([label, value, style]) => healthCard(label, value, style)).join("") + (playbook.error ? `<div class="agent-error">${esc(playbook.error)}</div>` : "");
  setHealth("#topPlaybookState", "#topPlaybookText", Boolean(playbook.ready), playbook.ready ? `${playbook.totalEntries || 0} procedure sẵn sàng` : "Chưa sẵn sàng");
}
function renderPlaybookMatches(entries) {
  $("#playbookSearchResult").innerHTML = entries.length ? entries.map((entry) => `<article class="playbook-result-card"><div><span class="badge">${esc(labels[entry.category] || entry.category)}</span> <span class="badge ${entry.risk}">${esc(entry.risk)}</span> <span class="badge">${esc(entry.audience)}</span> ${entry.autoEligible ? '<span class="badge guide">AUTO-ELIGIBLE</span>' : '<span class="badge escalate">TECHNICIAN</span>'}</div><h3>${esc(entry.id)} — ${esc(entry.title)}</h3><p>${esc(entry.summary)}</p><div class="playbook-score">Độ phù hợp ${Math.round((entry.score || 0) * 100)}%${entry.semanticUsed ? ` · semantic ${Math.round((entry.semanticScore || 0) * 100)}%` : " · lexical"}</div>${entry.steps?.length ? `<details><summary>Các bước được phép (${entry.steps.length})</summary><ol>${entry.steps.map((step) => `<li>${esc(step)}</li>`).join("")}</ol></details>` : ""}${entry.forbiddenSteps?.length ? `<details><summary>Điểm dừng / thao tác cấm</summary><ul>${entry.forbiddenSteps.map((step) => `<li>${esc(step)}</li>`).join("")}</ul></details>` : ""}</article>`).join("") : '<div class="empty-state compact-empty"><span>↗</span><h3>Không có procedure phù hợp</h3><p>Trong Strict Mode, tình huống này sẽ được chuyển kỹ thuật viên ngay.</p></div>';
}


const versionStatusLabels = { draft: "Bản nháp", submitted: "Chờ duyệt", rejected: "Bị từ chối", published: "Published", superseded: "Phiên bản cũ", archived: "Lưu trữ" };
const splitLines = (value) => String(value || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);

function renderGovernance() {
  const governance = state.governance || {}; const counts = governance.counts || {}; const index = governance.index || {};
  const items = [
    ["Procedure", counts.procedures || 0, ""], ["Published", counts.published || 0, "success"],
    ["Chờ duyệt", counts.submitted || 0, Number(counts.submitted) ? "danger" : ""], ["Bản nháp", counts.drafts || 0, ""], ["Bị từ chối", counts.rejected || 0, ""],
  ];
  $("#governanceStats").innerHTML = items.map(([label, value, style], indexValue) => `<article class="stat-card ${style}"><div class="stat-top"><span>${esc(label)}</span><b class="stat-icon">${["▤","✓","!","◇","×"][indexValue]}</b></div><strong>${esc(value)}</strong><small>${indexValue === 2 && Number(value) ? "Cần quản trị viên review" : "Vòng đời có kiểm soát"}</small></article>`).join("");
  $("#reviewBadge").textContent = Number(counts.submitted || 0) > 99 ? "99+" : String(counts.submitted || 0);
  const indexClass = index.status === "ready" ? "index-ready" : index.status === "failed" ? "index-failed" : "index-building";
  $("#indexStateChip").className = `badge ${indexClass}`;
  $("#indexStateChip").textContent = `INDEX: ${(index.status || "not installed").toUpperCase()}`;
  const query = $("#governanceSearch")?.value.trim().toLowerCase() || "";
  const status = $("#governanceStatus")?.value || ""; const lifecycle = $("#governanceLifecycle")?.value || "";
  const rows = state.procedures.filter((item) => {
    const haystack = `${item.code} ${item.title} ${item.version?.content?.summary || ""}`.toLowerCase();
    return (!query || haystack.includes(query)) && (!status || item.version?.status === status) && (!lifecycle || item.lifecycleStatus === lifecycle);
  });
  $("#governanceCount").textContent = `${rows.length} / ${state.procedures.length} procedure`;
  $("#governanceList").innerHTML = rows.length ? rows.map((item) => `<article class="governance-item" data-procedure="${item.id}"><div class="governance-title"><span class="governance-code">${esc(item.code)}</span><strong>${esc(item.title)}</strong><small>${esc(item.version?.content?.summary || "Chưa có tóm tắt")}</small></div><div class="governance-col"><span>Phiên bản</span><strong>v${item.version?.versionNumber || "—"} · ${esc(item.version?.createdByName || item.ownerName || "—")}</strong></div><div class="governance-col"><span>Phạm vi</span><strong>${esc(item.audience)} · ${esc(labels[item.category] || item.category)}</strong></div><span class="governance-status ${esc(item.version?.status || "draft")}">${esc(versionStatusLabels[item.version?.status] || item.version?.status || "Chưa có")}</span></article>`).join("") : '<div class="empty-state"><span>◫</span><h3>Chưa có procedure phù hợp</h3><p>Tạo bản nháp mới hoặc nhập baseline Enterprise Playbook.</p></div>';
  $$('[data-procedure]').forEach((element) => { element.onclick = () => openPlaybookEditor(element.dataset.procedure).catch((error) => toast(error.message)); });
}

async function refreshGovernance() {
  const query = encodeURIComponent($("#governanceSearch")?.value.trim() || "");
  const status = encodeURIComponent($("#governanceStatus")?.value || "");
  const lifecycle = encodeURIComponent($("#governanceLifecycle")?.value || "");
  const [governance, procedures] = await Promise.all([
    api("/api/staff/playbook/governance/status"),
    api(`/api/staff/playbook/procedures?q=${query}&status=${status}&lifecycle=${lifecycle}`),
  ]);
  state.governance = governance.governance || {}; state.procedures = procedures.procedures || []; renderGovernance();
}

function playbookPayloadFromForm() {
  return {
    code: $("#pbCode").value.trim(), title: $("#pbTitle").value.trim(), category: $("#pbCategory").value,
    audience: $("#pbAudience").value, risk: $("#pbRisk").value, priority: $("#pbPriority").value,
    summary: $("#pbSummary").value.trim(), symptoms: splitLines($("#pbSymptoms").value),
    requiredQuestions: splitLines($("#pbQuestions").value), steps: splitLines($("#pbSteps").value),
    forbiddenSteps: splitLines($("#pbForbidden").value), keywords: $("#pbKeywords").value.split(",").map((item) => item.trim()).filter(Boolean),
    notes: $("#pbNotes").value.trim(), changeSummary: $("#pbChangeSummary").value.trim(), autoEligible: $("#pbAutoEligible").checked,
  };
}

function setPlaybookFields(content = {}, procedure = null, version = null) {
  $("#pbProcedureId").value = procedure?.id || ""; $("#pbVersionId").value = version?.id || "";
  $("#pbCode").value = procedure?.code || content.id || ""; $("#pbTitle").value = content.title || procedure?.title || "";
  $("#pbCategory").value = content.category || procedure?.category || "other"; $("#pbAudience").value = content.audience || procedure?.audience || "technician";
  $("#pbRisk").value = content.risk || "medium"; $("#pbPriority").value = content.priority || "normal";
  $("#pbSummary").value = content.summary || ""; $("#pbSymptoms").value = (content.symptoms || []).join("\n");
  $("#pbQuestions").value = (content.requiredQuestions || []).join("\n"); $("#pbSteps").value = (content.steps || []).join("\n");
  $("#pbForbidden").value = (content.forbiddenSteps || []).join("\n"); $("#pbKeywords").value = (content.keywords || []).join(", ");
  $("#pbNotes").value = content.notes || ""; $("#pbChangeSummary").value = version?.changeSummary || ""; $("#pbAutoEligible").checked = Boolean(content.autoEligible);
}

function setEditorReadonly(readonly) {
  ["pbTitle","pbCategory","pbAudience","pbRisk","pbPriority","pbSummary","pbSymptoms","pbQuestions","pbSteps","pbForbidden","pbKeywords","pbNotes","pbChangeSummary","pbAutoEligible"].forEach((id) => { const element = $(`#${id}`); if (element) element.disabled = readonly; });
}

async function openPlaybookEditor(procedureId = "", versionId = "") {
  let procedure = null; let version = null;
  if (procedureId) {
    const result = await api(`/api/staff/playbook/procedures/${procedureId}`); procedure = result.procedure;
    version = versionId ? procedure.versions.find((item) => item.id === versionId) : procedure.versions.find((item) => ["draft","rejected","submitted"].includes(item.status)) || procedure.versions.find((item) => item.id === procedure.currentVersionId) || procedure.versions[0];
  }
  const content = version?.content || { audience: "technician", risk: "medium", priority: "normal", category: "other", autoEligible: false };
  setPlaybookFields(content, procedure, version);
  $("#pbCode").disabled = Boolean(procedure);
  const editable = !procedure || (["draft", "rejected"].includes(version?.status) && (state.user?.role === "admin" || version?.createdBy === state.user?.id));
  setEditorReadonly(!editable);
  $("#playbookEditorTitle").textContent = procedure ? `${procedure.code} — ${procedure.title}` : "Tạo bản nháp Playbook";
  $("#playbookEditorMeta").textContent = version ? `v${version.versionNumber} · ${versionStatusLabels[version.status] || version.status} · ${version.createdByName}` : "Draft mới chưa được AI sử dụng";
  $("#pbSaveBtn").classList.toggle("hidden", !editable); $("#pbSubmitBtn").classList.toggle("hidden", !editable || !version);
  const canReview = state.user?.role === "admin" && version && ["submitted", "draft", "rejected"].includes(version.status);
  $("#pbPublishBtn").classList.toggle("hidden", !canReview); $("#pbRejectBtn").classList.toggle("hidden", !(state.user?.role === "admin" && version?.status === "submitted"));
  const versions = procedure?.versions || [];
  $("#playbookVersionHistory").innerHTML = procedure ? `<div class="version-history-head">Lịch sử phiên bản · ${esc(procedure.lifecycleStatus)} ${state.user?.role === "admin" ? `<button type="button" data-new-version="${procedure.id}">＋ Tạo version mới</button> <button type="button" data-lifecycle="${procedure.id}">${procedure.lifecycleStatus === "active" ? "Ngừng dùng" : "Kích hoạt"}</button>` : ""}</div>${versions.map((item) => `<div class="version-row"><b>v${item.versionNumber}</b><span class="governance-status ${item.status}">${esc(versionStatusLabels[item.status] || item.status)}</span><span>${esc(item.changeSummary || "Không có mô tả")}<br/><small>${esc(item.createdByName)} · ${formatDate(item.updatedAt)}</small></span><span><button type="button" data-version="${item.id}">Mở</button>${state.user?.role === "admin" && ["superseded","published"].includes(item.status) ? ` <button type="button" data-rollback="${item.id}">Rollback</button>` : ""}</span></div>`).join("")}` : "";
  $$('[data-version]').forEach((element) => { element.onclick = () => openPlaybookEditor(procedure.id, element.dataset.version); });
  $$('[data-new-version]').forEach((element) => { element.onclick = async () => { try { const result = await api(`/api/staff/playbook/procedures/${element.dataset.newVersion}/versions`, { method: "POST", body: JSON.stringify({ changeSummary: "Tạo phiên bản cập nhật" }) }); toast("Đã tạo version mới"); await refreshGovernance(); await openPlaybookEditor(result.procedure.id); } catch (error) { toast(error.message); } }; });
  $$('[data-rollback]').forEach((element) => { element.onclick = async () => { if (!confirm("Rollback sẽ tạo một phiên bản mới và publish ngay. Tiếp tục?")) return; try { const result = await api(`/api/admin/playbook/versions/${element.dataset.rollback}/rollback`, { method: "POST", body: JSON.stringify({ reviewNote: "Rollback từ Admin Dashboard" }) }); toast(result.indexQueued ? "Đã rollback; semantic index đang cập nhật" : "Đã rollback"); await refreshGovernance(); await openPlaybookEditor(result.procedure.id); } catch (error) { toast(error.message); } }; });
  $$('[data-lifecycle]').forEach((element) => { element.onclick = async () => { const status = procedure.lifecycleStatus === "active" ? "deprecated" : "active"; if (!confirm(`Chuyển procedure sang ${status}?`)) return; try { await api(`/api/admin/playbook/procedures/${element.dataset.lifecycle}/lifecycle`, { method: "POST", body: JSON.stringify({ status, note: "Cập nhật từ Dashboard" }) }); toast("Đã cập nhật vòng đời"); $("#playbookEditorDialog").close(); await refreshGovernance(); } catch (error) { toast(error.message); } }; });
  enforcePlaybookSafetyUi();
  if (!$("#playbookEditorDialog").open) $("#playbookEditorDialog").showModal();
}

function renderAgent() {
  const agent = state.agent || {}; const policy = agent.policy || {};
  const items = [
    ["Trạng thái", agent.ready ? "Sẵn sàng" : "Chưa sẵn sàng", agent.ready ? "ready" : "not-ready"], ["Chế độ", agent.mode || "—", ""],
    ["Provider", agent.provider || "—", ""], ["Model", agent.model || "—", ""], ["Ollama", agent.reachable ? "Đã kết nối" : "Không kết nối", agent.reachable ? "ready" : "not-ready"],
    ["Model đã tải", agent.modelInstalled ? "Có" : "Chưa", agent.modelInstalled ? "ready" : "not-ready"], ["Strict escalation", policy.strictEscalation ? "Đang bật" : "Đang tắt", policy.strictEscalation ? "ready" : "not-ready"],
    ["Ngưỡng tin cậy", policy.minimumConfidence != null ? `${Math.round(policy.minimumConfidence * 100)}%` : "—", ""],
  ];
  $("#agentStatus").innerHTML = items.map(([label, value, style]) => healthCard(label, value, style)).join("") + (agent.error ? `<div class="agent-error">${esc(agent.error)}</div>` : "");
  setHealth("#topAgentState", "#topAgentText", Boolean(agent.ready), agent.ready ? `${agent.model || "AI"} đang hoạt động` : "Đang dùng handoff an toàn");
}

async function openTicket(ticketId) {
  const { ticket, messages = [], requester, attachments = [], history = [] } = await api(`/api/tickets/${ticketId}`);
  $("#dialogTicketCode").textContent = `${ticket.code} — ${ticket.title}`;
  const analysis = ticket.aiAnalysis || {}; const guided = Boolean(analysis.canAutoHandle); const humanOnly = Boolean(ticket.humanHandoff?.locked);
  const sourceList = Array.isArray(analysis.playbookSources) ? analysis.playbookSources : [];
  const attachmentHtml = attachments.length ? attachments.map((attachment) => `<div class="attachment-row"><button class="attachment-preview-admin" data-preview-attachment="${attachment.id}" ${isPreviewableAttachment(attachment) ? "" : "disabled"}><span>▧</span><span><strong>${esc(attachment.fileName)}</strong><small>${formatSize(attachment.size)} · ${esc(attachment.uploaderName)} · ${isPreviewableAttachment(attachment) ? "Xem trước" : "Chỉ tải xuống"}</small></span></button><button class="attachment-download-admin" data-download-attachment="${attachment.id}" title="Tải xuống">↓</button></div>`).join("") : '<div class="muted">Chưa có file đính kèm.</div>';
  const historyHtml = history.length ? history.map((item) => `<div class="history-row"><span></span><div><strong>${esc(historyLabels[item.type] || item.type)}</strong>${item.from !== null && item.from !== undefined && item.to !== null && item.to !== undefined ? `<p>${esc(item.from || "—")} → ${esc(item.to || "—")}</p>` : ""}${item.note ? `<p>${esc(item.note)}</p>` : ""}<small>${esc(item.actorName)} · ${formatDate(item.createdAt)}</small></div></div>`).join("") : '<div class="muted">Chưa có lịch sử.</div>';
  const sourceHtml = sourceList.length ? `<div class="playbook-source"><strong>Nguồn Playbook đã đối chiếu</strong><ul>${sourceList.map((item) => `<li><b>${esc(item.id)}</b> — ${esc(item.title || "")}${item.version ? ` · v${esc(item.version)}` : ""}${item.score != null ? ` · ${Math.round(item.score * 100)}%` : ""}</li>`).join("")}</ul></div>` : "";
  const messageHtml = messages.length ? messages.map((message) => { const linked = attachments.filter((attachment) => attachment.messageId === message.id); const linkedHtml = linked.length ? `<div class="message-attachments">${linked.map((attachment) => `<button data-preview-attachment="${attachment.id}" ${isPreviewableAttachment(attachment) ? "" : "disabled"}>▧ <span>${esc(attachment.fileName)}</span></button><button class="message-download" data-download-attachment="${attachment.id}">↓</button>`).join("")}</div>` : ""; return `<div class="message ${message.role}"><small>${esc(message.authorName)} · ${formatDate(message.createdAt)}</small><div>${esc(message.body)}</div>${linkedHtml}</div>`; }).join("") : '<div class="muted">Chưa có trao đổi.</div>';
  $("#ticketDetail").innerHTML = `<div class="ticket-workbench">
    <div class="workbench-main">
      <article class="detail-card requester-card"><div class="requester-avatar">${esc(initials(requester?.name))}</div><div><strong>${esc(requester?.name || "Không xác định")}</strong><small>${esc(requester?.department || "Chưa có phòng ban")} · ${esc(requester?.phone || "Chưa có số liên hệ")}</small></div><span class="badge ${ticket.status}">${esc(labels[ticket.status] || ticket.status)}</span></article>
      <article class="detail-card"><div class="meta-grid"><div class="meta-box"><span>Danh mục</span><strong>${esc(labels[ticket.category] || ticket.category)}</strong></div><div class="meta-box"><span>Ưu tiên</span><strong>${esc(labels[ticket.priority] || ticket.priority)}</strong></div><div class="meta-box"><span>Phụ trách</span><strong>${esc(ticket.assignedTo || "Chưa phân công")}</strong></div><div class="meta-box"><span>Thiết bị</span><strong>${esc(ticket.device || "—")}</strong></div><div class="meta-box"><span>Vị trí</span><strong>${esc(ticket.location || "—")}</strong></div><div class="meta-box"><span>Tạo lúc</span><strong>${formatDate(ticket.createdAt)}</strong></div></div></article>
      <div class="sla-panel"><div class="sla-box ${ticket.sla?.firstResponseOverdue ? "overdue" : ""}"><span>SLA phản hồi đầu tiên</span><strong>${ticket.sla?.firstRespondedAt ? `Đã phản hồi ${formatDate(ticket.sla.firstRespondedAt)}` : timeLeft(ticket.sla?.firstResponseDueAt)}</strong></div><div class="sla-box ${ticket.sla?.resolutionOverdue || ticket.sla?.overdue ? "overdue" : ""}"><span>SLA hoàn tất</span><strong>${["resolved", "closed"].includes(ticket.status) ? "Đã hoàn tất" : timeLeft(ticket.sla?.resolutionDueAt)}</strong></div></div>
      <article class="detail-card"><div class="card-head"><h3>Mô tả từ người dùng</h3><span class="badge">RAW REQUEST</span></div><div class="description">${esc(ticket.description)}</div></article>
      <article class="decision-panel ${guided ? "" : "escalated"}"><div class="decision-head"><span class="decision-symbol">${guided ? "✓" : "↗"}</span><div><strong>${guided ? "Được phép hướng dẫn theo Playbook" : "Đã chuyển kỹ thuật viên ngay"}</strong><small>${guided ? "Đủ nguồn, an toàn và đạt ngưỡng tin cậy" : esc(escalationLabels[analysis.escalationCode] || "Không đủ điều kiện tự động xử lý")}</small></div><span class="badge ${guided ? "guide" : "escalate"}">${guided ? "GUIDE" : "ESCALATE"}</span></div><div class="decision-copy"><strong>${esc(analysis.summary || "Chưa có đánh giá.")}</strong>\n\n${esc(analysis.reason || "")}</div><div class="decision-meta"><span class="badge">${esc(analysis.source || "—")}</span><span class="badge">${esc(analysis.model || "Rules")}</span><span class="badge">Confidence ${Math.round((analysis.confidence || 0) * 100)}%</span></div>${sourceHtml}</article>
      <article class="detail-card"><div class="card-head"><h3>Hội thoại</h3><span class="badge">${messages.length} tin nhắn</span></div><div class="messages">${messageHtml}</div><div id="adminReplyFileList" class="admin-reply-file-list"></div><div class="admin-reply-composer"><label class="admin-reply-attach" title="Thêm ảnh hoặc file">▧<input id="adminReplyFilesInput" type="file" multiple accept="image/*,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip"/></label><textarea id="adminReply" placeholder="Gửi phản hồi, ảnh hoặc file cho người dùng…"></textarea><button id="sendReply" class="button primary-button" type="button">Gửi phản hồi</button></div><small class="reply-security-note">Tối đa 4 file; mỗi file tối đa 30 MB; tổng mỗi phản hồi tối đa 120 MB. Ảnh, PDF, TXT và CSV có thể xem trước.</small></article>
    </div>
    <aside class="workbench-side">
      <article class="detail-card"><div class="card-head"><h3>Điều phối xử lý</h3><span class="badge">${state.user?.role === "admin" ? "ADMIN" : "TECHNICIAN"}</span></div><div class="control-grid"><div class="two"><label>Trạng thái<select id="editStatus">${["open", "waiting_user", "in_progress", "resolved", "closed"].map((value) => `<option value="${value}" ${ticket.status === value ? "selected" : ""}>${labels[value]}</option>`).join("")}</select></label><label>Ưu tiên<select id="editPriority">${["low", "normal", "high", "urgent"].map((value) => `<option value="${value}" ${ticket.priority === value ? "selected" : ""}>${labels[value]}</option>`).join("")}</select></label></div><label>Người phụ trách<input id="editAssignee" value="${esc(ticket.assignedTo || "")}" placeholder="Tên kỹ thuật viên" /></label><label>Ghi chú / giải pháp<textarea id="editResolution" rows="5" placeholder="Ghi nguyên nhân và cách xử lý…">${esc(ticket.resolution || "")}</textarea></label><button id="saveTicket" class="button primary-button save-button" type="button">Lưu cập nhật</button><button id="draftFromTicketBtn" class="button source-ticket-button" type="button">◫ Tạo đề xuất Playbook từ ticket</button></div></article>
      <article class="detail-card"><div class="card-head"><h3>File đính kèm</h3><span class="badge">${attachments.length}</span></div><div class="attachment-admin-list">${attachmentHtml}</div><label class="admin-upload">＋ Tải thêm file<input id="adminFiles" type="file" multiple accept="image/*,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip" /></label></article>
      <article class="detail-card"><div class="card-head"><h3>Đánh giá hài lòng</h3></div><div class="rating-admin">${ticket.satisfaction ? `<strong>${"★".repeat(ticket.satisfaction.score)}${"☆".repeat(5 - ticket.satisfaction.score)}</strong><p>${esc(ticket.satisfaction.comment || "Không có nhận xét")}</p><small>${formatDate(ticket.satisfaction.ratedAt)}</small>` : '<span class="muted">Người dùng chưa đánh giá.</span>'}</div></article>
      <article class="detail-card"><div class="card-head"><h3>Lịch sử xử lý</h3><span class="badge">${history.length}</span></div><div class="history-admin">${historyHtml}</div></article>
    </aside>
  </div>`;

  $$('[data-preview-attachment]').forEach((element) => { element.onclick = async () => { const attachment = attachments.find((item) => item.id === element.dataset.previewAttachment); if (attachment) try { await previewAttachment(attachment); } catch (error) { toast(error.message); } }; });
  $$('[data-download-attachment]').forEach((element) => { element.onclick = async () => { const attachment = attachments.find((item) => item.id === element.dataset.downloadAttachment); if (attachment) try { await downloadAttachment(attachment); } catch (error) { toast(error.message); } }; });
  $("#adminFiles").onchange = async (event) => {
    const files = [...event.target.files]; event.target.value = ""; if (!files.length) return;
    const tooLarge = files.find((file) => file.size >= MAX_UPLOAD_BYTES);
    if (tooLarge) return toast(`${tooLarge.name} vượt quá giới hạn 30 MB`);
    try {
      for (const file of files) {
        const form = new FormData();
        form.append("file", file, file.name);
        await api(`/api/tickets/${ticket.id}/attachments`, { method: "POST", body: form });
      }
      toast(`Đã tải ${files.length} file`);
      await load(); await openTicket(ticket.id);
    } catch (error) { toast(error.message); }
  };
  let replyFiles = [];
  const renderReplyFiles = () => { $("#adminReplyFileList").innerHTML = replyFiles.map((file, index) => `<div><span>▧</span><span><strong>${esc(file.name)}</strong><small>${formatSize(file.size)}</small></span><button type="button" data-remove-reply-file="${index}">×</button></div>`).join(""); $$('[data-remove-reply-file]').forEach((element) => { element.onclick = () => { replyFiles.splice(Number(element.dataset.removeReplyFile), 1); renderReplyFiles(); }; }); };
  $("#adminReplyFilesInput").onchange = (event) => {
    const files = [...event.target.files]; event.target.value = "";
    const tooLarge = files.find((file) => file.size >= MAX_UPLOAD_BYTES);
    if (tooLarge) return toast(`${tooLarge.name} vượt quá giới hạn 30 MB`);
    const proposed = [...replyFiles, ...files];
    if (proposed.length > MAX_REPLY_FILES) toast(`Mỗi phản hồi tối đa ${MAX_REPLY_FILES} file`);
    const limited = proposed.slice(0, MAX_REPLY_FILES);
    const total = limited.reduce((sum, file) => sum + file.size, 0);
    if (total > MAX_REPLY_UPLOAD_BYTES) return toast("Tổng file mỗi phản hồi vượt quá 120 MB");
    replyFiles = limited; renderReplyFiles();
  };
  $("#saveTicket").onclick = async () => { try { await api(`/api/admin/tickets/${ticket.id}`, { method: "PATCH", body: JSON.stringify({ status: $("#editStatus").value, priority: $("#editPriority").value, assignedTo: $("#editAssignee").value, resolution: $("#editResolution").value }) }); toast("Đã cập nhật ticket"); await load(); await openTicket(ticket.id); } catch (error) { toast(error.message); } };
  $("#sendReply").onclick = async () => {
    const message = $("#adminReply").value.trim(); if (!message && !replyFiles.length) return;
    const button = $("#sendReply"); const originalLabel = button.textContent; button.disabled = true; button.textContent = replyFiles.length ? "Đang tải file…" : "Đang gửi…";
    try {
      const form = new FormData();
      form.append("message", message);
      for (const file of replyFiles) form.append("attachments", file, file.name);
      await api(`/api/tickets/${ticket.id}/replies`, { method: "POST", body: form });
      toast("Đã gửi phản hồi và thông báo người dùng");
      await load(); await openTicket(ticket.id);
    } catch (error) {
      toast(error.message); button.disabled = false; button.textContent = originalLabel;
    }
  };
  $("#draftFromTicketBtn").onclick = async () => { try { const result = await api(`/api/staff/playbook/drafts/from-ticket/${ticket.id}`, { method: "POST", body: JSON.stringify({}) }); $("#ticketDialog").close(); await refreshGovernance(); switchTab("governance"); toast("Đã tạo draft từ ticket. Hãy chuẩn hóa trước khi gửi duyệt."); await openPlaybookEditor(result.procedure.id); } catch (error) { toast(error.message); } };
  $("#ticketDialog").showModal();
}

function editKb(id = "") {
  const entry = state.kb.find((item) => item.id === id);
  $("#kbDialogTitle").textContent = entry ? "Sửa hướng dẫn" : "Thêm hướng dẫn"; $("#kbId").value = entry?.id || ""; $("#kbTitle").value = entry?.title || ""; $("#kbCategory").value = entry?.category || "other"; $("#kbRisk").value = entry?.risk || "low"; $("#kbKeywords").value = (entry?.keywords || []).join(", "); $("#kbSummary").value = entry?.summary || ""; $("#kbSteps").value = (entry?.steps || []).join("\n"); $("#kbAuto").checked = Boolean(entry?.autoEligible); $("#kbActive").checked = entry?.active !== false; $("#kbDialog").showModal();
}

$("#loginForm").onsubmit = async (event) => { event.preventDefault(); $("#loginError").textContent = ""; try { const result = await api("/api/auth/staff", { method: "POST", body: JSON.stringify({ password: $("#password").value, name: $("#staffName").value }) }); state.token = result.token; sessionStorage.setItem("hd_admin", result.token); show(); await load(); } catch (error) { $("#loginError").textContent = error.message; } };
$("#logoutBtn").onclick = () => { state.token = ""; state.user = null; sessionStorage.removeItem("hd_admin"); show(); };
$("#refreshBtn").onclick = async () => { try { await load(); toast("Dữ liệu đã được làm mới"); } catch (error) { toast(error.message); } };
$("#search").oninput = renderTickets; $("#statusFilter").onchange = renderTickets; $("#priorityFilter").onchange = renderTickets; $("#categoryFilter").onchange = renderTickets;
$("#resetFiltersBtn").onclick = () => { $("#search").value = ""; $("#statusFilter").value = ""; $("#priorityFilter").value = ""; $("#categoryFilter").value = ""; renderTickets(); };
$$(".tab").forEach((tab) => { tab.onclick = () => switchTab(tab.dataset.tab); });
$("#newKbBtn").onclick = () => editKb(); $$("[data-close-kb]").forEach((button) => { button.onclick = () => $("#kbDialog").close(); });
$("#kbForm").onsubmit = async (event) => { event.preventDefault(); const entryId = $("#kbId").value; const payload = { title: $("#kbTitle").value, category: $("#kbCategory").value, risk: $("#kbRisk").value, keywords: $("#kbKeywords").value.split(",").map((item) => item.trim()).filter(Boolean), summary: $("#kbSummary").value, steps: $("#kbSteps").value.split("\n").map((item) => item.trim()).filter(Boolean), autoEligible: $("#kbAuto").checked, active: $("#kbActive").checked }; try { await api(entryId ? `/api/admin/knowledge-base/${entryId}` : "/api/admin/knowledge-base", { method: entryId ? "PATCH" : "POST", body: JSON.stringify(payload) }); $("#kbDialog").close(); toast("Đã lưu Knowledge Base"); await load(); } catch (error) { toast(error.message); } };

$("#refreshPlaybookBtn").onclick = async () => { try { const result = await api("/api/admin/playbook/status?force=1"); state.playbook = result.playbook; renderPlaybook(); toast(state.playbook.ready ? "Playbook đã sẵn sàng" : "Playbook chưa sẵn sàng"); } catch (error) { toast(error.message); } };
$("#reindexPlaybookBtn").onclick = async () => { const button = $("#reindexPlaybookBtn"); button.disabled = true; button.textContent = "Đang index…"; try { const result = await api("/api/admin/playbook/reindex", { method: "POST", body: JSON.stringify({}) }); state.playbook = result.playbook; renderPlaybook(); toast(`Đã index ${result.index.entries} procedure`); } catch (error) { toast(error.message); } finally { button.disabled = false; button.textContent = "Re-index semantic"; } };
$("#playbookSearchForm").onsubmit = async (event) => { event.preventDefault(); const q = $("#playbookSearchPrompt").value.trim(); if (!q) return; $("#playbookSearchResult").innerHTML = '<div class="empty-state compact-empty"><span>↻</span><h3>Đang tra cứu…</h3><p>Semantic search đang đối chiếu procedure.</p></div>'; try { const result = await api(`/api/admin/playbook/search?q=${encodeURIComponent(q)}&audience=${encodeURIComponent($("#playbookAudience").value)}`); renderPlaybookMatches(result.entries || []); } catch (error) { $("#playbookSearchResult").innerHTML = `<div class="agent-error">${esc(error.message)}</div>`; } };


$("#governanceSearch").oninput = renderGovernance; $("#governanceStatus").onchange = renderGovernance; $("#governanceLifecycle").onchange = renderGovernance;
$("#refreshGovernanceBtn").onclick = async () => { try { await refreshGovernance(); toast("Đã làm mới vòng đời Playbook"); } catch (error) { toast(error.message); } };
$("#newPlaybookDraftBtn").onclick = () => openPlaybookEditor();
$("#seedPlaybookBtn").onclick = async () => { if (!confirm("Nhập 173 procedure baseline vào SQL Server? Procedure đã tồn tại sẽ được bỏ qua.")) return; try { const result = await api("/api/admin/playbook/governance/seed", { method: "POST", body: JSON.stringify({}) }); toast(`Đã nhập ${result.result.inserted}; bỏ qua ${result.result.skipped}`); await refreshGovernance(); } catch (error) { toast(error.message); } };
$$('[data-close-playbook-editor]').forEach((button) => { button.onclick = () => $("#playbookEditorDialog").close(); });
$("#playbookEditorForm").onsubmit = async (event) => { event.preventDefault(); const procedureId = $("#pbProcedureId").value; const versionId = $("#pbVersionId").value; const payload = playbookPayloadFromForm(); try { let result; if (!procedureId) result = await api("/api/staff/playbook/drafts", { method: "POST", body: JSON.stringify(payload) }); else if (versionId) result = await api(`/api/staff/playbook/versions/${versionId}`, { method: "PATCH", body: JSON.stringify(payload) }); else throw new Error("Không xác định được phiên bản cần lưu"); toast("Đã lưu bản nháp"); await refreshGovernance(); await openPlaybookEditor(result.procedure.id); } catch (error) { toast(error.message); } };
$("#pbSubmitBtn").onclick = async () => { const versionId = $("#pbVersionId").value; if (!versionId) return; if (!confirm("Gửi phiên bản này cho quản trị viên duyệt?")) return; try { const result = await api(`/api/staff/playbook/versions/${versionId}/submit`, { method: "POST", body: JSON.stringify({}) }); toast("Đã gửi duyệt. AI chưa sử dụng phiên bản này."); await refreshGovernance(); await openPlaybookEditor(result.procedure.id, versionId); } catch (error) { toast(error.message); } };
$("#pbPublishBtn").onclick = async () => { const versionId = $("#pbVersionId").value; if (!versionId) return; const reviewNote = prompt("Ghi chú phê duyệt (khuyến nghị ghi phạm vi đã kiểm tra):", "Đã kiểm tra nội dung, phân quyền và điều kiện an toàn") ?? null; if (reviewNote === null) return; try { const result = await api(`/api/admin/playbook/versions/${versionId}/publish`, { method: "POST", body: JSON.stringify({ reviewNote }) }); toast(result.indexQueued ? "Đã publish; AI đang tự động cập nhật semantic index" : "Đã publish"); await refreshGovernance(); await load(); await openPlaybookEditor(result.procedure.id, versionId); } catch (error) { toast(error.message); } };
$("#pbRejectBtn").onclick = async () => { const versionId = $("#pbVersionId").value; if (!versionId) return; const reviewNote = prompt("Lý do từ chối (bắt buộc):", ""); if (!reviewNote?.trim()) return; try { const result = await api(`/api/admin/playbook/versions/${versionId}/reject`, { method: "POST", body: JSON.stringify({ reviewNote }) }); toast("Đã trả lại bản nháp cho kỹ thuật viên"); await refreshGovernance(); await openPlaybookEditor(result.procedure.id, versionId); } catch (error) { toast(error.message); } };
function enforcePlaybookSafetyUi() { const blocked = $("#pbRisk").value === "high" || $("#pbAudience").value === "technician"; if (blocked) $("#pbAutoEligible").checked = false; $("#pbAutoEligible").disabled = blocked || $("#pbSummary").disabled; }
$("#pbRisk").onchange = enforcePlaybookSafetyUi; $("#pbAudience").onchange = enforcePlaybookSafetyUi;

$("#refreshAgentBtn").onclick = async () => { try { const result = await api("/api/admin/agent/status?force=1"); state.agent = result.agent; renderAgent(); toast(state.agent.ready ? "AI Agent đã sẵn sàng" : "AI Agent chưa sẵn sàng"); } catch (error) { toast(error.message); } };
$("#agentTestForm").onsubmit = async (event) => { event.preventDefault(); const prompt = $("#agentTestPrompt").value.trim(); if (!prompt) return; const button = $("#agentTestForm button"); button.disabled = true; button.textContent = "AI đang phân tích…"; $("#agentTestResult").textContent = "Đang đối chiếu Enterprise Playbook và chính sách an toàn…"; try { const result = await api("/api/admin/agent/test", { method: "POST", body: JSON.stringify({ prompt }) }); const a = result.analysis || {}; $("#agentTestResult").textContent = `${a.canAutoHandle ? "✓ HƯỚNG DẪN THEO PLAYBOOK" : "↗ ESCALATE NGAY"}\n\n${result.reply}\n\n────────────────────────────────\nsource: ${a.source || "—"}\nmodel: ${a.model || "rules"}\nconfidence: ${Math.round((a.confidence || 0) * 100)}%\nlatency: ${a.latencyMs || 0} ms\nescalation: ${a.escalationCode || "none"}\nplaybook: ${(a.playbookIds || []).join(", ") || "none"}`; } catch (error) { $("#agentTestResult").textContent = `Lỗi: ${error.message}`; } finally { button.disabled = false; button.textContent = "✦ Phân tích bằng AI Agent"; } };

show(); switchTab("tickets");
if (state.token) load().catch(() => { state.token = ""; sessionStorage.removeItem("hd_admin"); show(); });
setInterval(() => { if (state.token && !$("#ticketDialog").open) load().catch(() => undefined); }, 30000);
