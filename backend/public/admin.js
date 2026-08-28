import { buildStaffAccountPayload, staffActivePresentation, staffErrorFieldId } from "./admin-staff.js";

const AUTO_REFRESH_STORAGE_KEY = "hd_admin_auto_refresh";
const SIDEBAR_STORAGE_KEY = "hd_admin_sidebar_compact";
function savedAutoRefreshPreference() {
  try { return localStorage.getItem(AUTO_REFRESH_STORAGE_KEY) !== "false"; } catch { return true; }
}
function savedSidebarPreference() {
  try { return localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true"; } catch { return false; }
}

const state = {
  token: sessionStorage.getItem("hd_admin") || "",
  user: null, tickets: [], stats: null, kb: [], agent: null, aiQuality: null, playbook: null, governance: null, procedures: [], staff: [], userAccess: { invites: [], users: [] }, directory: [], report: null, legacyLoginEnabled: true, activeQueue: "all", activeTab: "tickets", autoRefreshEnabled: savedAutoRefreshPreference(),
};
const COPILOT_PROVIDER_STORAGE_KEY = "hd_copilot_provider";
const copilotProviderLabels = { gemini: "Gemini", groq: "Groq", openrouter: "OpenRouter", sambanova: "SambaNova" };
function savedCopilotProvider() {
  try { return localStorage.getItem(COPILOT_PROVIDER_STORAGE_KEY) || "auto"; } catch { return "auto"; }
}
function saveCopilotProvider(value) {
  try { localStorage.setItem(COPILOT_PROVIDER_STORAGE_KEY, value); } catch {}
}
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
function setSidebarCompact(compact, { persist = true } = {}) {
  const layout = $("#appView"); const toggle = $("#sidebarToggle");
  if (!layout || !toggle) return;
  layout.classList.toggle("sidebar-compact", Boolean(compact));
  toggle.setAttribute("aria-expanded", compact ? "false" : "true");
  toggle.setAttribute("aria-label", compact ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng");
  toggle.title = compact ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng";
  toggle.querySelector("span").textContent = compact ? "›" : "‹";
  if (persist) {
    try { localStorage.setItem(SIDEBAR_STORAGE_KEY, String(Boolean(compact))); } catch {}
  }
}
function keepActiveMobileTabVisible(tab = document.querySelector(".sidebar-nav .tab.active")) {
  if (!tab || !window.matchMedia("(max-width: 680px)").matches) return;
  window.requestAnimationFrame(() => tab.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" }));
}
const labels = {
  open: "Mới mở", waiting_user: "Chờ người dùng", in_progress: "Đang xử lý", resolved: "Đã xử lý", closed: "Đã đóng",
  urgent: "Khẩn cấp", high: "Cao", normal: "Bình thường", low: "Thấp",
  network: "Mạng", printer: "Máy in", windows: "Windows", office: "Office", account: "Tài khoản", software: "Phần mềm", hardware: "Phần cứng", other: "Khác",
};
const staffRoleLabels = { admin: "Quản trị viên", technician: "Kỹ thuật viên", viewer: "Chỉ xem" };
const escalationLabels = {
  no_playbook_match: "Không có Playbook phù hợp",
  playbook_not_auto_eligible: "Playbook yêu cầu kỹ thuật viên",
  low_confidence: "Chưa đủ độ tin cậy",
  agent_unavailable: "AI Agent chưa sẵn sàng",
  policy_blocked: "Bị chặn bởi chính sách an toàn",
};
const historyLabels = { created: "Tạo ticket", status: "Đổi trạng thái", category: "Đổi danh mục", priority: "Đổi ưu tiên", risk: "Đổi rủi ro", assignment: "Phân công", message: "Trao đổi", attachment: "Đính kèm", ai_handoff: "Bàn giao cho HelpDesk", ai_review: "Đánh giá quyết định AI", sla_warning: "SLA sắp đến hạn", sla_overdue: "Cảnh báo SLA", reopen: "Mở lại", rating: "Đánh giá" };
const tabMeta = {
  tickets: ["Tổng quan Ticket", "Theo dõi số lượng, trạng thái, SLA và người phụ trách."],
  operations: ["Báo cáo", "Xem hiệu quả xử lý ticket theo thời gian."],
  staff: ["Nhân sự", "Quản lý tài khoản HelpDesk và truy cập Mini App."],
  knowledge: ["Kiến thức", "Tra cứu và cập nhật hướng dẫn hỗ trợ kỹ thuật."],
  governance: ["Quy trình", "Tạo, duyệt và phát hành procedure Playbook."],
  playbook: ["Playbook", "Tra cứu procedure theo tình huống hỗ trợ."],
  agent: ["Hệ thống & AI", "Kiểm tra cấu hình, provider và chất lượng AI Agent."],
};
const statIcons = ["▦", "◉", "↻", "!", "✓", "★"];
const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
const formatDate = (value) => value ? new Date(value).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }) : "—";
const formatSize = (bytes = 0) => bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
const formatCount = (value) => Number.isFinite(Number(value)) ? new Intl.NumberFormat("vi-VN").format(Number(value)) : "—";
const timeLeft = (iso) => {
  if (!iso) return "Chưa xác định";
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  const hours = Math.floor(abs / 3600000);
  const minutes = Math.floor((abs % 3600000) / 60000);
  return `${diff < 0 ? "Quá hạn" : "Còn"} ${hours}h ${minutes}m`;
};
const initials = (name = "U") => name.split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]).join("").toUpperCase();
function ticketNextAction(ticket) {
  if (ticket.status === "waiting_user") return "Chờ người dùng bổ sung thông tin";
  if (ticket.status === "resolved") return "Chờ người dùng xác nhận kết quả";
  if (ticket.status === "closed") return "Không còn hành động";
  if (!ticket.assignedTo) return "Phân công kỹ thuật viên";
  if (ticket.sla?.overdue) return "Cập nhật người dùng và xử lý SLA";
  return "Tiếp tục chẩn đoán và cập nhật";
}
function ticketActionOwner(ticket) {
  if (["waiting_user", "resolved"].includes(ticket.status)) return "NGƯỜI DÙNG";
  if (ticket.status === "closed") return "HOÀN TẤT";
  return "HELPDESK";
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("ngrok-skip-browser-warning", "1");
  if (options.body !== undefined && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (state.token) headers.set("Authorization", `Bearer ${state.token}`);
  const response = await fetch(path, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || `HTTP ${response.status}`);
    error.status = response.status; error.code = body.code || ""; error.field = body.field || "";
    throw error;
  }
  return body;
}

const PREVIEWABLE_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf", "text/plain", "text/csv"]);
const MAX_TICKET_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_REPLY_FILES = 4;
const paperclipIcon = '<svg class="admin-attachment-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m20.5 11.5-8.93 8.93a6 6 0 0 1-8.49-8.49l9.64-9.64a4 4 0 0 1 5.66 5.66l-9.65 9.65a2 2 0 0 1-2.83-2.83l8.94-8.93"/></svg>';
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
function toast(message) {
  const element = $("#toast"); const openDialog = $$('dialog[open]').at(-1); const host = openDialog || document.body;
  if (element.parentElement !== host) host.appendChild(element);
  element.textContent = message; element.classList.remove("hidden"); clearTimeout(toast.timer); toast.timer = setTimeout(() => element.classList.add("hidden"), 2800);
}
function show() {
  $("#loginView").classList.toggle("hidden", Boolean(state.token));
  $("#appView").classList.toggle("hidden", !state.token);
  if (!state.token) {
    $("#password").value = ""; setPasswordVisibility(false);
    setAccountMenuOpen(false);
    if ($("#settingsDialog")?.open) $("#settingsDialog").close();
    if (!window.matchMedia("(max-width: 680px)").matches) window.requestAnimationFrame(() => $("#staffUsername")?.focus());
  }
}

function setLoginBusy(busy) {
  const form = $("#loginForm"); const button = $("#loginSubmitButton"); const label = $("#loginSubmitLabel");
  form.setAttribute("aria-busy", busy ? "true" : "false");
  button.disabled = Boolean(busy); button.setAttribute("aria-busy", busy ? "true" : "false");
  label.textContent = busy ? "Đang xác thực…" : "Vào Control Centre";
}

function setPasswordVisibility(visible) {
  const field = $("#password"); const toggle = $("#passwordVisibilityToggle"); const label = $("#passwordVisibilityLabel");
  field.type = visible ? "text" : "password";
  toggle.setAttribute("aria-pressed", visible ? "true" : "false");
  toggle.setAttribute("aria-label", visible ? "Ẩn mật khẩu" : "Hiện mật khẩu");
  label.textContent = visible ? "Ẩn" : "Hiện";
}

function setAccountMenuOpen(open) {
  const menu = $("#accountMenu"); const toggle = $("#accountMenuToggle");
  if (!menu || !toggle) return;
  menu.classList.toggle("hidden", !open);
  toggle.setAttribute("aria-expanded", open ? "true" : "false");
  document.querySelector(".main-header")?.classList.toggle("account-menu-open", Boolean(open));
}

function selectSettingsView(view = "account") {
  const activeView = view === "app" ? "app" : "account";
  $$('[data-settings-tab]').forEach((button) => {
    const active = button.dataset.settingsTab === activeView;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
  $$('[data-settings-panel]').forEach((panel) => {
    const active = panel.dataset.settingsPanel === activeView;
    panel.classList.toggle("active", active);
    panel.classList.toggle("hidden", !active);
  });
  $("#settingsDialogTitle").textContent = activeView === "app" ? "Ứng dụng" : "Tài khoản";
}

function openSettings(view = "account") {
  setAccountMenuOpen(false);
  selectSettingsView(view);
  $("#autoRefreshSetting").checked = state.autoRefreshEnabled;
  if (!$("#settingsDialog").open) $("#settingsDialog").showModal();
}

function setAutoRefreshPreference(enabled) {
  state.autoRefreshEnabled = Boolean(enabled);
  try { localStorage.setItem(AUTO_REFRESH_STORAGE_KEY, String(state.autoRefreshEnabled)); } catch {}
  $("#autoRefreshSetting").checked = state.autoRefreshEnabled;
}

function endStaffSession({ switchAccount = false } = {}) {
  setAccountMenuOpen(false);
  if ($("#settingsDialog").open) $("#settingsDialog").close();
  state.token = ""; state.user = null;
  sessionStorage.removeItem("hd_admin");
  if (switchAccount) { $("#staffUsername").value = ""; $("#password").value = ""; setPasswordVisibility(false); }
  show();
  if (switchAccount) window.requestAnimationFrame(() => $("#staffUsername").focus());
}

async function refreshDashboard() {
  setAccountMenuOpen(false);
  try { await load(); toast("Dữ liệu đã được làm mới"); }
  catch (error) { toast(error.message); }
}

function setHealth(dotSelector, textSelector, ready, text) {
  const dot = $(dotSelector); const label = $(textSelector);
  dot.classList.remove("pending", "ready", "error"); dot.classList.add(ready ? "ready" : "error"); label.textContent = text;
}
function switchTab(name) {
  if (name === "staff" && state.user?.role !== "admin") name = "tickets";
  state.activeTab = name;
  $$(".tab").forEach((item) => {
    const active = item.dataset.tab === name;
    item.classList.toggle("active", active);
    if (active) item.setAttribute("aria-current", "page"); else item.removeAttribute("aria-current");
  });
  ["tickets", "operations", "staff", "knowledge", "governance", "playbook", "agent"].forEach((tab) => $(`#${tab}Tab`)?.classList.toggle("hidden", tab !== name));
  const [title, description] = tabMeta[name] || tabMeta.tickets;
  $("#activeSectionTitle").textContent = title; $("#activeSectionDescription").textContent = description;
  keepActiveMobileTabVisible(document.querySelector(`.sidebar-nav .tab[data-tab="${name}"]`));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function load() {
  const me = await api("/api/me");
  state.user = me.user || null;
  const [tickets, stats, kb, agent, aiQuality, playbook, governance, procedures, report, directory, staff, userAccess] = await Promise.all([
    api(`/api/tickets?queue=${encodeURIComponent(state.activeQueue)}`), api("/api/admin/stats"), api("/api/admin/knowledge-base"),
    api("/api/admin/agent/status").catch((error) => ({ agent: { ready: false, error: error.message } })),
    api(`/api/admin/ai-quality?days=${encodeURIComponent($("#aiQualityDays")?.value || 30)}`).catch((error) => ({ report: { error: error.message, summary: {}, recent: [] } })),
    api("/api/admin/playbook/status").catch((error) => ({ playbook: { ready: false, error: error.message } })),
    api("/api/staff/playbook/governance/status").catch((error) => ({ governance: { ready: false, error: error.message, counts: {} } })),
    api("/api/staff/playbook/procedures").catch(() => ({ procedures: [] })),
    api(`/api/admin/operations?days=${encodeURIComponent($("#reportDays")?.value || 30)}`).catch(() => ({ report: null })),
    api("/api/staff/directory").catch(() => ({ accounts: [] })),
    state.user?.role === "admin" ? api("/api/admin/staff").catch(() => ({ accounts: [] })) : Promise.resolve({ accounts: [] }),
    state.user?.role === "admin" ? api("/api/admin/user-access").catch(() => ({ invites: [], users: [] })) : Promise.resolve({ invites: [], users: [] }),
  ]);
  state.tickets = tickets.tickets || []; state.stats = { ...stats, queueCounts: tickets.queueCounts || stats.queueCounts || {} }; state.kb = kb.entries || [];
  state.agent = agent.agent || {}; state.aiQuality = aiQuality.report || {}; state.playbook = playbook.playbook || {}; state.governance = governance.governance || {}; state.procedures = procedures.procedures || [];
  state.report = report.report || null; state.directory = directory.accounts || []; state.staff = staff.accounts || []; state.userAccess = { invites: userAccess.invites || [], users: userAccess.users || [] }; state.legacyLoginEnabled = staff.legacyLoginEnabled !== false;
  applyRoleVisibility(); renderStats(); renderSmartQueues(); renderTickets(); renderOperations(); renderStaff(); renderUserAccess(); renderKb(); renderAgent(); renderAiQuality(); renderPlaybook(); renderGovernance();
}

function applyRoleVisibility() {
  const role = state.user?.role || "viewer";
  const admin = role === "admin";
  const writable = ["admin", "technician"].includes(role);
  $$(".admin-only").forEach((element) => {
    if (element.id === "staffTab") element.classList.toggle("hidden", !admin || state.activeTab !== "staff");
    else element.classList.toggle("hidden", !admin);
  });
  $$(".write-only").forEach((element) => element.classList.toggle("hidden", !writable));
  if ($("#newKbBtn")) $("#newKbBtn").classList.toggle("hidden", !admin);
  ["#newPlaybookDraftBtn", "#reindexPlaybookBtn", "#agentTestForm"].forEach((selector) => $(selector)?.classList.toggle("hidden", !writable));
  const displayName = state.user?.name || state.user?.displayName || "Nhân sự HelpDesk";
  const roleLabel = staffRoleLabels[role] || "Nhân sự HelpDesk";
  const accountContext = state.user?.legacy ? `${roleLabel} · Tài khoản dùng chung` : state.user?.username ? `${roleLabel} · @${state.user.username}` : roleLabel;
  if ($("#staffIdentity")) $("#staffIdentity").textContent = `${displayName} · ${roleLabel}`;
  if ($("#headerIdentity")) {
    $("#headerIdentity").dataset.role = role;
    $("#headerIdentity").setAttribute("aria-label", `Mở cài đặt tài khoản: ${displayName}, ${accountContext}`);
  }
  if ($("#headerIdentityAvatar")) $("#headerIdentityAvatar").textContent = initials(displayName);
  if ($("#headerAccountName")) $("#headerAccountName").textContent = displayName;
  if ($("#accountMenuName")) $("#accountMenuName").textContent = displayName;
  if ($("#accountMenuMeta")) $("#accountMenuMeta").textContent = accountContext;
  if ($("#settingsAccountAvatar")) $("#settingsAccountAvatar").textContent = initials(displayName);
  if ($("#settingsAccountName")) $("#settingsAccountName").textContent = displayName;
  if ($("#settingsAccountMeta")) $("#settingsAccountMeta").textContent = accountContext;
  if ($("#settingsAccountUsername")) $("#settingsAccountUsername").textContent = state.user?.legacy ? "Tài khoản dùng chung" : state.user?.username ? `@${state.user.username}` : "Chưa có tên đăng nhập";
  if ($("#settingsAccountRole")) $("#settingsAccountRole").textContent = roleLabel;
  if ($("#settingsAccountAvatar")?.parentElement) $("#settingsAccountAvatar").parentElement.dataset.role = role;
}

const queueMeta = [
  ["all", "Tất cả"], ["mine", "Của tôi"], ["unassigned", "Chưa phân công"], ["sla_risk", "Sắp quá SLA"],
  ["overdue", "Quá SLA"], ["client_replied", "Client vừa trả lời"], ["waiting_user", "Chờ Client"], ["reopened", "Mở lại"],
];

function renderSmartQueues() {
  const counts = state.stats?.queueCounts || {};
  $("#smartQueues").innerHTML = queueMeta.map(([key, label]) => `<button type="button" class="smart-queue ${state.activeQueue === key ? "active" : ""} ${key === "overdue" && counts[key] ? "danger" : ""}" data-queue="${key}"><span>${esc(label)}</span><b>${counts[key] || 0}</b></button>`).join("");
  $$('[data-queue]').forEach((button) => { button.onclick = () => selectQueue(button.dataset.queue); });
}

async function selectQueue(queue) {
  state.activeQueue = queue;
  try {
    const result = await api(`/api/tickets?queue=${encodeURIComponent(queue)}`);
    state.tickets = result.tickets || [];
    state.stats.queueCounts = result.queueCounts || state.stats.queueCounts;
    renderSmartQueues(); renderTickets();
  } catch (error) { toast(error.message); }
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
  $("#stats").innerHTML = items.map(([label, value, style], index) => `<article class="stat-card ${style}"><div class="stat-top"><span>${esc(label)}</span><b class="stat-icon">${statIcons[index]}</b></div><strong>${esc(value)}</strong><small>${index === 3 && Number(value) ? "Cần xử lý" : ""}</small></article>`).join("");
  const openCount = (byStatus.open || 0) + (byStatus.in_progress || 0) + (byStatus.waiting_user || 0);
  setNavCountBadge("#openTicketBadge", openCount);
}

function setNavCountBadge(selector, value) {
  const badge = $(selector);
  if (!badge) return;
  const count = Math.max(0, Number(value) || 0);
  badge.textContent = count ? (count > 99 ? "99+" : String(count)) : "";
  badge.classList.toggle("hidden", count === 0);
  badge.setAttribute("aria-hidden", count === 0 ? "true" : "false");
}

function durationLabel(minutes) {
  if (!Number.isFinite(minutes)) return "—";
  if (minutes < 60) return `${Math.round(minutes)} phút`;
  const hours = Math.floor(minutes / 60); const rest = Math.round(minutes % 60);
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function renderBreakdown(target, values = {}) {
  const entries = Object.entries(values).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, value]) => value));
  $(target).innerHTML = entries.length ? entries.map(([label, value]) => `<div class="breakdown-row"><div><strong>${esc(labels[label] || label)}</strong><span>${value}</span></div><i><b style="width:${Math.max(4, value * 100 / max)}%"></b></i></div>`).join("") : '<div class="empty-state compact-empty"><h3>Chưa có dữ liệu</h3><p>Dữ liệu sẽ xuất hiện khi có ticket trong kỳ.</p></div>';
}

function renderOperations() {
  const report = state.report; if (!report) return;
  const summary = report.summary || {};
  const metrics = [
    ["Phản hồi đầu", durationLabel(summary.averageFirstResponseMinutes), "Trong giờ làm việc"],
    ["Thời gian xử lý", durationLabel(summary.averageResolutionMinutes), "Không tính lúc chờ Client"],
    ["Đạt SLA", summary.slaComplianceRate == null ? "—" : `${summary.slaComplianceRate}%`, `${summary.total || 0} ticket trong kỳ`],
    ["Mở lại", summary.reopenRate == null ? "—" : `${summary.reopenRate}%`, "Tỷ lệ ticket tái diễn"],
    ["CSAT", summary.averageSatisfaction == null ? "—" : `${summary.averageSatisfaction}/5`, summary.satisfactionCoverage == null ? "Chưa có đánh giá" : `${summary.satisfactionCoverage}% ticket hoàn tất đã đánh giá`],
  ];
  $("#operationsMetrics").innerHTML = metrics.map(([label, value, note]) => `<article class="operation-metric"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`).join("");
  const trend = report.trend || []; const max = Math.max(1, ...trend.flatMap((item) => [item.created, item.resolved]));
  $("#operationsTrend").innerHTML = trend.map((item) => `<div class="trend-day" title="${esc(item.date)} · ${item.created} tạo mới · ${item.resolved} hoàn tất"><div><i style="height:${Math.max(3, item.created * 100 / max)}%"></i><i style="height:${Math.max(3, item.resolved * 100 / max)}%"></i></div><span>${esc(item.date.slice(8))}</span></div>`).join("");
  renderBreakdown("#categoryBreakdown", report.byCategory);
  renderBreakdown("#departmentBreakdown", report.byDepartment);
  $("#technicianReportRows").innerHTML = (report.byTechnician || []).map((item) => `<tr><td><strong>${esc(item.name)}</strong></td><td>${item.assigned}</td><td>${item.resolved}</td><td>${item.slaRate == null ? "—" : `${item.slaRate}%`}</td><td>${item.satisfaction == null ? "—" : `${item.satisfaction}/5`}</td></tr>`).join("") || '<tr><td colspan="5" class="muted">Chưa có dữ liệu phân công trong kỳ.</td></tr>';
}

function renderStaff() {
  if (!$("#staffList") || state.user?.role !== "admin") return;
  const counts = Object.fromEntries(["admin", "technician", "viewer"].map((role) => [role, state.staff.filter((item) => item.role === role && item.active).length]));
  $("#staffSummary").innerHTML = `<article class="staff-summary-item active"><b>${state.staff.filter((item) => item.active).length}</b><span>Đang hoạt động</span><small>Có thể đăng nhập HelpDesk</small></article><article class="staff-summary-item admin"><b>${counts.admin}</b><span>Quản trị viên</span><small>Toàn quyền quản trị</small></article><article class="staff-summary-item technician"><b>${counts.technician}</b><span>Kỹ thuật viên</span><small>Tiếp nhận và xử lý</small></article><article class="staff-summary-item viewer"><b>${counts.viewer}</b><span>Chỉ xem</span><small>Theo dõi, không chỉnh sửa</small></article>`;
  $("#staffList").innerHTML = state.staff.map((account) => `<article class="staff-card ${account.active ? "" : "inactive"}"><span class="staff-avatar" aria-hidden="true">${esc(initials(account.displayName))}</span><div class="staff-card-main"><div class="staff-name-line"><strong>${esc(account.displayName)}</strong><span class="staff-account-status ${account.active ? "active" : "inactive"}">${account.active ? "Đang hoạt động" : "Đã khóa"}</span></div><p>@${esc(account.username)}</p><small>${account.lastLoginAt ? `Đăng nhập gần nhất ${formatDate(account.lastLoginAt)}` : "Chưa đăng nhập lần nào"}</small></div><div class="staff-card-side"><span class="role-chip ${esc(account.role)}">${esc(staffRoleLabels[account.role] || account.role)}</span><button type="button" class="button staff-secondary-button compact" data-staff-edit="${esc(account.id)}" aria-label="Chỉnh sửa tài khoản ${esc(account.displayName)}">Chỉnh sửa</button></div></article>`).join("") || '<div class="empty-state staff-empty"><h3>Chưa có tài khoản riêng</h3><p>Thêm nhân sự đầu tiên và kiểm tra đăng nhập trước khi tắt tài khoản dùng chung.</p></div>';
  $$('[data-staff-edit]').forEach((button) => { button.onclick = () => openStaffEditor(button.dataset.staffEdit); });
}

const inviteStatusLabels = { active: "Còn hiệu lực", used: "Đã sử dụng", expired: "Hết hạn", revoked: "Đã thu hồi" };

function renderUserAccess() {
  if (!$("#inviteList") || state.user?.role !== "admin") return;
  const invites = state.userAccess.invites || []; const users = state.userAccess.users || [];
  const activeInvites = invites.filter((item) => item.status === "active").length;
  const activeSessions = users.reduce((total, item) => total + Number(item.activeSessions || 0), 0);
  $("#userAccessSummary").innerHTML = `<div class="access-summary-item"><b>${activeInvites}</b><span>Mã còn hiệu lực</span><small>Sẵn sàng để xác nhận</small></div><div class="access-summary-item"><b>${users.length}</b><span>Nhân viên đã xác nhận</span><small>Đã đăng nhập ít nhất một lần</small></div><div class="access-summary-item"><b>${activeSessions}</b><span>Thiết bị đang đăng nhập</span><small>Phiên đang còn hiệu lực</small></div>`;
  $("#inviteList").innerHTML = invites.slice(0, 20).map((invite) => `<article class="access-row"><span class="access-avatar" aria-hidden="true">${esc(initials(invite.displayName))}</span><div class="access-identity"><div class="access-name-line"><strong>${esc(invite.displayName)}</strong><span class="access-status ${invite.status}">${esc(inviteStatusLabels[invite.status] || invite.status)}</span></div><p>${esc(invite.employeeCode)}${invite.department ? ` · ${esc(invite.department)}` : ""}</p><small>${invite.status === "active" ? `Hết hạn ${formatDate(invite.expiresAt)}` : `Cập nhật ${formatDate(invite.usedAt || invite.revokedAt || invite.expiresAt)}`}</small></div>${invite.status === "active" ? `<button type="button" class="button access-secondary-button compact" data-invite-revoke="${invite.id}" aria-label="Thu hồi mã mời của ${esc(invite.displayName)}">Thu hồi mã</button>` : ""}</article>`).join("") || '<div class="empty-state compact-empty"><h3>Chưa có mã mời</h3><p>Tạo mã đầu tiên để nhân viên xác nhận Mini App.</p></div>';
  $("#miniUserList").innerHTML = users.map((user) => `<article class="access-row"><span class="access-avatar user" aria-hidden="true">${esc(initials(user.name))}</span><div class="access-identity"><div class="access-name-line"><strong>${esc(user.name)}</strong><span class="access-status ${user.activeSessions ? "session-active" : "revoked"}">${user.activeSessions ? "Đang đăng nhập" : "Đã đăng xuất"}</span></div><p>${esc(user.employeeCode)}${user.department ? ` · ${esc(user.department)}` : ""}</p><small>${user.activeSessions ? `${user.activeSessions} thiết bị · hoạt động ${formatDate(user.lastSeenAt)}` : "Không có thiết bị đang đăng nhập"}</small></div>${user.activeSessions ? `<button type="button" class="button access-secondary-button compact" data-user-revoke="${user.id}" aria-label="Đăng xuất thiết bị của ${esc(user.name)}">Đăng xuất thiết bị</button>` : ""}</article>`).join("") || '<div class="empty-state compact-empty"><h3>Chưa có người dùng</h3><p>Người dùng sẽ xuất hiện sau khi dùng mã mời.</p></div>';
  $$('[data-invite-revoke]').forEach((button) => { button.onclick = async () => {
    if (!confirm("Thu hồi mã mời này? Mã sẽ không thể sử dụng.")) return;
    try { await api(`/api/admin/user-invites/${button.dataset.inviteRevoke}/revoke`, { method: "POST", body: "{}" }); await refreshUserAccess(); toast("Đã thu hồi mã mời"); } catch (error) { toast(error.message); }
  }; });
  $$('[data-user-revoke]').forEach((button) => { button.onclick = async () => {
    if (!confirm("Đăng xuất người dùng khỏi tất cả thiết bị? Người dùng sẽ cần mã mời mới để đăng nhập lại.")) return;
    try { const result = await api(`/api/admin/users/${button.dataset.userRevoke}/revoke-sessions`, { method: "POST", body: "{}" }); await refreshUserAccess(); toast(`Đã thu hồi ${result.revoked} phiên đăng nhập`); } catch (error) { toast(error.message); }
  }; });
}

async function refreshUserAccess() {
  const result = await api("/api/admin/user-access");
  state.userAccess = { invites: result.invites || [], users: result.users || [] };
  renderUserAccess();
}

function openInviteDialog() {
  $("#inviteForm").reset();
  $("#inviteFormFields").classList.remove("hidden");
  $("#inviteResult").classList.add("hidden");
  $("#inviteSaveBtn").classList.remove("hidden");
  $("#inviteFormError").classList.add("hidden");
  $("#inviteFormError").textContent = "";
  ["#inviteEmployeeCode", "#inviteDisplayName", "#inviteDepartment"].forEach((selector) => $(selector).removeAttribute("aria-invalid"));
  $("#inviteDialog").showModal();
  $("#inviteEmployeeCode").focus();
}

function openStaffEditor(staffId = "") {
  const account = state.staff.find((item) => item.id === staffId);
  clearStaffFormError();
  $("#staffDialogTitle").textContent = account ? "Chỉnh sửa nhân sự" : "Thêm nhân sự";
  $("#staffId").value = account?.id || "";
  $("#staffAccountUsername").value = account?.username || "";
  $("#staffDisplayName").value = account?.displayName || "";
  $("#staffRole").value = account?.role || "technician";
  $("#staffActive").checked = account?.active !== false;
  $("#staffPassword").value = "";
  $("#staffPassword").required = !account;
  $("#staffPassword").placeholder = account ? "Để trống nếu không đổi mật khẩu" : "Tối thiểu 10 ký tự, có chữ và số";
  updateStaffActivePresentation();
  $("#staffDialog").showModal();
}

function clearStaffFormError() {
  const error = $("#staffFormError");
  if (error) { error.textContent = ""; error.classList.add("hidden"); }
  ["#staffAccountUsername", "#staffDisplayName", "#staffRole", "#staffPassword", "#staffActive"].forEach((selector) => $(selector)?.removeAttribute("aria-invalid"));
}

function showStaffFormError(error) {
  const target = $("#staffFormError");
  target.textContent = error.message || "Không thể lưu tài khoản. Vui lòng kiểm tra lại.";
  target.classList.remove("hidden");
  const field = document.getElementById(staffErrorFieldId(error.field));
  if (field) {
    field.setAttribute("aria-invalid", "true");
    field.focus();
    if (typeof field.select === "function" && field.tagName === "INPUT" && field.type !== "checkbox") field.select();
  }
}

function updateStaffActivePresentation() {
  const presentation = staffActivePresentation($("#staffActive").checked);
  $("#staffActiveText").textContent = presentation.label;
  $("#staffActiveHelp").textContent = presentation.help;
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
    const slaNote = ticket.sla?.paused ? '<div class="sla-paused">Tạm dừng · Chờ Client</div>' : ticket.sla?.overdue ? '<div class="sla-danger">Quá thời hạn SLA</div>' : ticket.sla?.state === "at_risk" ? '<div class="sla-risk">Sắp đến hạn SLA</div>' : "";
    const decisionTitle = humanOnly ? "Chỉ hội thoại con người" : guided ? "Hướng dẫn theo Playbook" : "Đã chuyển kỹ thuật viên";
    const decisionReason = humanOnly ? "AI đã rời ticket và không phản hồi thêm" : guided ? `${Math.round((analysis.confidence || 0) * 100)}% · ${(analysis.playbookIds || []).join(", ") || analysis.source || "Playbook"}` : escalationLabels[analysis.escalationCode] || analysis.reason || "Không đủ điều kiện tự hướng dẫn";
    const nextAction = ticketNextAction(ticket); const actionOwner = ticketActionOwner(ticket);
    return `<tr class="${ticket.sla?.overdue ? "overdue-row" : ""}">
      <td><button type="button" class="ticket-link" data-ticket="${ticket.id}">${esc(ticket.code)}</button><div class="ticket-title-cell">${esc(ticket.title)}</div><div class="ticket-subline"><span>${formatDate(ticket.createdAt)}</span>${ticket.attachmentCount ? `<span>▧ ${ticket.attachmentCount}</span>` : ""}</div></td>
      <td><span class="badge">${esc(labels[ticket.category] || ticket.category)}</span> <span class="badge ${ticket.priority}">${esc(labels[ticket.priority] || ticket.priority)}</span></td>
      <td><span class="badge ${ticket.status}">${esc(labels[ticket.status] || ticket.status)}</span>${slaNote}</td>
      <td class="decision-cell"><span class="badge ${humanOnly ? "escalate" : guided ? "guide" : "escalate"}">${humanOnly ? "HUMAN ONLY" : guided ? "✓ PLAYBOOK" : "↗ ESCALATE"}</span><strong>${esc(decisionTitle)}</strong><small>${esc(decisionReason)}</small></td>
      <td><span class="badge ${actionOwner === "NGƯỜI DÙNG" ? "normal" : actionOwner === "HOÀN TẤT" ? "guide" : "in_progress"}">${esc(actionOwner)}</span><strong class="ticket-next-action">${esc(nextAction)}</strong><div class="muted">${esc(ticket.assignedTo || "Chưa phân công")} · ${formatDate(ticket.updatedAt)}</div></td>
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
    ["Retrieval", (playbook.retrievalMode || "lexical").toUpperCase(), "ready"], ["Embedding", `${playbook.embeddingProvider || "none"} · ${playbook.embedModel || "—"}`, ""],
    ["Semantic index", playbook.semanticEnabled ? (playbook.indexCurrent ? "Đã cập nhật" : (playbook.indexExists ? "Cần cập nhật" : "Chưa tạo")) : "Không bắt buộc", !playbook.semanticEnabled || playbook.indexCurrent ? "ready" : "not-ready"],
  ];
  $("#playbookStatus").innerHTML = items.map(([label, value, style]) => healthCard(label, value, style)).join("") + (playbook.error ? `<div class="agent-error">${esc(playbook.error)}</div>` : "");
  const heroState = $("#playbookHeroState");
  if (heroState) { heroState.className = `playbook-state-chip ${playbook.ready ? "ready" : "not-ready"}`; heroState.innerHTML = `<i></i>${playbook.ready ? "Sẵn sàng" : "Chưa sẵn sàng"}`; }
  if ($("#playbookHeroCount")) $("#playbookHeroCount").textContent = formatCount(playbook.totalEntries ?? 0);
  if ($("#playbookHeroMode")) $("#playbookHeroMode").textContent = (playbook.retrievalMode || "lexical").toUpperCase();
  setHealth("#topPlaybookState", "#topPlaybookText", Boolean(playbook.ready), playbook.ready ? `${playbook.totalEntries || 0} procedure sẵn sàng` : "Chưa sẵn sàng");
}
function renderPlaybookMatches(entries) {
  $("#playbookSearchResult").innerHTML = entries.length ? entries.map((entry) => `<article class="playbook-result-card"><div><span class="badge">${esc(labels[entry.category] || entry.category)}</span> <span class="badge ${entry.risk}">${esc(entry.risk)}</span> <span class="badge">${esc(entry.audience)}</span> ${entry.autoEligible ? '<span class="badge guide">AUTO-ELIGIBLE</span>' : '<span class="badge escalate">TECHNICIAN</span>'}</div><h3>${esc(entry.id)} — ${esc(entry.title)}</h3><p>${esc(entry.summary)}</p><div class="playbook-score">Độ phù hợp ${Math.round((entry.score || 0) * 100)}%${entry.semanticUsed ? ` · semantic ${Math.round((entry.semanticScore || 0) * 100)}%` : " · lexical"}</div>${entry.steps?.length ? `<details><summary>Các bước được phép (${entry.steps.length})</summary><ol>${entry.steps.map((step) => `<li>${esc(step)}</li>`).join("")}</ol></details>` : ""}${entry.forbiddenSteps?.length ? `<details><summary>Điểm dừng / thao tác cấm</summary><ul>${entry.forbiddenSteps.map((step) => `<li>${esc(step)}</li>`).join("")}</ul></details>` : ""}</article>`).join("") : '<div class="empty-state compact-empty"><span>↗</span><h3>Không có procedure phù hợp</h3><p>Trong Strict Mode, tình huống này sẽ được chuyển kỹ thuật viên ngay.</p></div>';
}


const versionStatusLabels = { draft: "Bản nháp", submitted: "Chờ duyệt", rejected: "Bị từ chối", published: "Đã phát hành", superseded: "Phiên bản cũ", archived: "Lưu trữ" };
const splitLines = (value) => String(value || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);

function renderGovernance() {
  const governance = state.governance || {}; const counts = governance.counts || {}; const index = governance.index || {};
  const items = [
    ["Tổng procedure", counts.procedures || 0, "procedures", "Tất cả quy trình đang quản lý"],
    ["Đã phát hành", counts.published || 0, "published", "AI được phép sử dụng"],
    ["Chờ duyệt", counts.submitted || 0, "submitted", Number(counts.submitted) ? "Cần quản trị xử lý" : "Không có việc tồn đọng"],
    ["Bản nháp", counts.drafts || 0, "draft", "Đang được hoàn thiện"],
    ["Bị từ chối", counts.rejected || 0, "rejected", "Cần chỉnh sửa trước khi gửi lại"],
  ];
  $("#governanceStats").innerHTML = items.map(([label, value, style, note]) => `<article class="governance-summary-item ${style}"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`).join("");
  setNavCountBadge("#reviewBadge", counts.submitted);
  const indexClass = index.status === "ready" ? "index-ready" : index.status === "failed" ? "index-failed" : "index-building";
  const indexLabels = { ready: "Sẵn sàng", failed: "Lỗi", building: "Đang cập nhật", "not installed": "Chưa cài đặt" };
  $("#indexStateChip").className = `badge ${indexClass}`;
  $("#indexStateChip").textContent = `Chỉ mục: ${indexLabels[index.status || "not installed"] || index.status}`;
  const query = $("#governanceSearch")?.value.trim().toLowerCase() || "";
  const status = $("#governanceStatus")?.value || ""; const lifecycle = $("#governanceLifecycle")?.value || "";
  const rows = state.procedures.filter((item) => {
    const haystack = `${item.code} ${item.title} ${item.version?.content?.summary || ""}`.toLowerCase();
    return (!query || haystack.includes(query)) && (!status || item.version?.status === status) && (!lifecycle || item.lifecycleStatus === lifecycle);
  });
  $("#governanceCount").textContent = `${rows.length} / ${state.procedures.length} procedure`;
  $("#governanceList").innerHTML = rows.length ? rows.map((item) => `<article class="governance-item" data-procedure="${esc(item.id)}"><div class="governance-title"><span class="governance-code">${esc(item.code)}</span><strong>${esc(item.title)}</strong><small>${esc(item.version?.content?.summary || "Chưa có tóm tắt")}</small></div><div class="governance-col"><span>Phiên bản</span><strong>v${item.version?.versionNumber || "—"} · ${esc(item.version?.createdByName || item.ownerName || "—")}</strong></div><div class="governance-col"><span>Phạm vi</span><strong>${esc(item.audience)} · ${esc(labels[item.category] || item.category)}</strong></div><span class="governance-status ${esc(item.version?.status || "draft")}">${esc(versionStatusLabels[item.version?.status] || item.version?.status || "Chưa có")}</span></article>`).join("") : '<div class="empty-state governance-empty"><span>◫</span><h3>Chưa có procedure để hiển thị</h3><p>Tạo bản nháp mới hoặc nhập Playbook gốc để bắt đầu vòng đời phê duyệt.</p></div>';
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
  const writable = ["admin", "technician"].includes(state.user?.role);
  const editable = writable && (!procedure || (["draft", "rejected"].includes(version?.status) && (state.user?.role === "admin" || version?.createdBy === state.user?.id)));
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
  const degraded = agent.operationalState === "degraded";
  const operationalLabel = degraded ? "Suy giảm" : agent.ready ? "Sẵn sàng" : "Chưa sẵn sàng";
  const operationalStyle = degraded ? "degraded" : agent.ready ? "ready" : "not-ready";
  const connection = agent.reachable == null ? (agent.configured ? "Theo cấu hình" : "Chưa cấu hình") : agent.reachable ? "Đã kết nối" : "Không kết nối";
  const modelState = agent.modelInstalled == null ? (agent.configured ? "Đã cấu hình" : "Chưa") : agent.modelInstalled ? "Sẵn sàng" : "Chưa tải";
  const items = [
    ["Trạng thái", operationalLabel, operationalStyle], ["Chế độ", agent.mode || "—", ""],
    ["Provider", agent.provider || "—", ""], ["Model hiện tại", agent.model || "Rules", ""], ["Kết nối", connection, agent.ready ? "ready" : "not-ready"],
    ["Thứ tự", Array.isArray(agent.order) ? agent.order.join(" → ") : (agent.providerKey || "—"), ""], ["Đang ưu tiên", agent.activeProvider || agent.providerKey || "Rules", ""],
    ["Trạng thái model", modelState, agent.ready ? "ready" : "not-ready"], ["Ranh giới dữ liệu", agent.dataBoundary === "mixed" ? "Cloud + nội bộ" : agent.dataBoundary === "external" ? "Cloud bên ngoài" : "Nội bộ", agent.dataBoundary === "external" || agent.dataBoundary === "mixed" ? "" : "ready"],
    ["Redaction cloud", agent.dataBoundary === "external" || agent.dataBoundary === "mixed" ? (agent.redactionEnabled ? "Đang bật" : "Đang tắt (mock)") : "Không áp dụng", ""],
    ["Strict escalation", policy.strictEscalation ? "Đang bật" : "Đang tắt", policy.strictEscalation ? "ready" : "not-ready"],
    ["Ngưỡng tin cậy", policy.minimumConfidence != null ? `${Math.round(policy.minimumConfidence * 100)}%` : "—", ""],
  ];
  $("#agentStatus").innerHTML = items.map(([label, value, style]) => healthCard(label, value, style)).join("") + (agent.error ? `<div class="agent-error">${esc(agent.error)}</div>` : "");
  renderProviderObservability(agent.providers || []);
  const heroState = $("#aiHeroState");
  if (heroState) { heroState.className = `ai-state-chip ${operationalStyle}`; heroState.innerHTML = `<i></i>${degraded ? "Cloud AI suy giảm" : agent.ready ? "AI sẵn sàng" : "Đang handoff"}`; }
  if ($("#aiHeroRoute")) $("#aiHeroRoute").textContent = (agent.activeProvider || agent.providerKey || "RULES").toUpperCase();
  if ($("#aiHeroModel")) $("#aiHeroModel").textContent = degraded
    ? "Provider vừa lỗi; router vẫn retry/failover trước khi dùng Rules/Playbook."
    : agent.ready ? `${agent.provider || "AI"} · ${agent.model || "Rules"} đang phục vụ` : "Provider chưa sẵn sàng; HelpDesk fallback vẫn hoạt động.";
  const topAgentDot = $("#topAgentState");
  topAgentDot.classList.remove("pending", "ready", "error");
  topAgentDot.classList.add(degraded ? "pending" : agent.ready ? "ready" : "error");
  $("#topAgentText").textContent = degraded ? "Cloud AI suy giảm · failover đang bật" : agent.ready ? `${agent.provider || "AI"} sẵn sàng` : "Đang dùng handoff an toàn";
}

const providerReasonLabels = {
  eligible: "Đủ điều kiện route",
  recent_failures: "Có lỗi gần đây; vẫn được retry/failover",
  not_configured: "Thiếu cấu hình cloud/API key/model",
  feature_disabled: "Provider đang tắt",
  daily_budget_exhausted: "Hết ngân sách ngày của Helpdesk",
  circuit_open: "Circuit tạm khóa sau lỗi",
};
const quotaPeriodLabels = { day: "ngày", minute: "phút", "provider-defined": "chu kỳ provider" };
function quotaCounterText(counter, noun) {
  if (!counter || counter.remaining == null) return "";
  const period = quotaPeriodLabels[counter.period] || counter.period || "chu kỳ";
  return `${formatCount(counter.remaining)} ${noun} còn lại/${period}`;
}
function providerTokenBalance(item) {
  const quota = item?.quota || {};
  const reported = quota.providerReported?.tokens;
  if (reported?.remaining != null) return { value: quotaCounterText(reported, "token"), source: "Provider báo qua response header" };
  const app = quota.appBudget?.tokens;
  if (app?.limit != null) return { value: `${formatCount(app.remaining)} / ${formatCount(app.limit)} token`, source: "Ngân sách ngày cấu hình trong Helpdesk" };
  return { value: "Không xác định", source: "Provider không công bố token còn lại qua API" };
}
function providerRequestBalance(item) {
  const quota = item?.quota || {};
  const reported = quota.providerReported?.requests;
  if (reported?.remaining != null) return quotaCounterText(reported, "request");
  const app = quota.appBudget?.requests;
  if (app?.limit != null) return `${formatCount(app.remaining)} / ${formatCount(app.limit)} request/ngày`;
  return "Không đặt giới hạn trong app";
}
function providerOptionQuotaLabel(item) {
  const balance = providerTokenBalance(item);
  if (balance.value !== "Không xác định") return balance.value;
  const used = Number(item?.quota?.tokensUsed || 0);
  return used > 0 ? `${formatCount(used)} token đã dùng` : "quota token chưa có số liệu";
}
function renderProviderObservability(providers) {
  const host = $("#agentProviderStatus");
  if (!host) return;
  host.innerHTML = providers.length ? providers.map((item) => {
    const token = providerTokenBalance(item);
    const reason = providerReasonLabels[item.reasonCode] || (item.ready ? "Đủ điều kiện route" : "Không sẵn sàng");
    const lastFailure = item.lastError
      ? `<div class="provider-last-error"><b>Lỗi gần nhất${item.lastHttpStatus ? ` · HTTP ${esc(item.lastHttpStatus)}` : ""}</b><span>${esc(item.lastError)}</span></div>`
      : "";
    const cooldown = item.circuit?.openUntil ? `<small>Thử lại sau: ${formatDate(item.circuit.openUntil)}</small>` : "";
    const providerState = item.operationalState === "degraded" ? "degraded" : item.ready ? "ready" : "not-ready";
    const providerStateLabel = providerState === "degraded" ? "SUY GIẢM" : item.ready ? "SẴN SÀNG" : "TẠM KHÓA";
    return `<article class="provider-observability-card ${providerState}"><header><div><span class="provider-readiness-dot"></span><strong>${esc(copilotProviderLabels[item.providerKey] || item.providerKey)}</strong><small>${esc(item.model || "Chưa cấu hình")}</small></div><b>${providerStateLabel}</b></header><div class="provider-quota-metrics"><p><span>Token đã dùng</span><strong>${formatCount(item.quota?.tokensUsed || 0)}</strong><small>Helpdesk quan sát trong phiên</small></p><p><span>Token còn lại</span><strong>${esc(token.value)}</strong><small>${esc(token.source)}</small></p><p><span>Request còn lại</span><strong>${esc(providerRequestBalance(item))}</strong><small>${formatCount(item.quota?.requestsUsed || 0)} request đã gọi trong phiên</small></p></div><footer><span>${esc(reason)}</span>${cooldown}</footer>${lastFailure}</article>`;
  }).join("") : '<div class="empty-state compact-empty"><h3>Chưa có provider</h3><p>Kiểm tra thứ tự provider và các cờ kích hoạt.</p></div>';
}

function renderAiQuality() {
  const report = state.aiQuality || {}; const summary = report.summary || {};
  const metrics = [
    ["Quyết định", summary.total || 0, `${report.days || 30} ngày`],
    ["Đã đánh giá", summary.reviewCoverageRate == null ? "—" : `${summary.reviewCoverageRate}%`, `${summary.reviewed || 0} quyết định`],
    ["Độ chính xác", summary.accuracyRate == null ? "—" : `${summary.accuracyRate}%`, "Trên quyết định đã review"],
    ["Escalate", summary.escalationRate == null ? "—" : `${summary.escalationRate}%`, `${(summary.escalated || 0) + (summary.unavailable || 0)} quyết định`],
    ["Provider lỗi", summary.unavailableRate == null ? "—" : `${summary.unavailableRate}%`, `${summary.unavailable || 0} lần`],
    ["Độ trễ TB", summary.averageLatencyMs == null ? "—" : `${Math.round(summary.averageLatencyMs)} ms`, "Tất cả provider"],
  ];
  $("#aiQualityMetrics").innerHTML = metrics.map(([label, value, note]) => `<article class="operation-metric"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`).join("");
  const providerEntries = Object.entries(report.byProvider || {});
  $("#aiProviderQuality").innerHTML = providerEntries.length ? providerEntries.map(([provider, item]) => `<div class="ai-provider-row"><div><strong>${esc(provider)}</strong><small>${item.total} quyết định · ${item.incorrect} cần sửa · ${item.unavailable} lỗi</small></div><span>${item.averageLatencyMs == null ? "—" : `${Math.round(item.averageLatencyMs)} ms`}</span></div>`).join("") : '<div class="empty-state compact-empty"><h3>Chưa có dữ liệu đánh giá</h3><p>Dữ liệu sẽ xuất hiện sau khi AI Agent xử lý ticket.</p></div>';
  renderBreakdown("#aiCategoryIssues", report.categoryIssues || {});
  $("#aiReviewCoverage").textContent = `${summary.reviewCoverageRate || 0}% đã đánh giá`;
  const recent = report.recent || [];
  $("#aiReviewRows").innerHTML = recent.length ? recent.map((item) => {
    const proposal = item.proposal || {}; const review = item.review;
    const result = review?.result === "correct" ? '<span class="badge guide">ĐÚNG</span>' : review?.result === "incorrect" ? '<span class="badge escalate">CẦN SỬA</span>' : '<span class="badge">CHƯA REVIEW</span>';
    return `<tr><td><button type="button" class="ai-ticket-link" data-ai-ticket="${esc(item.ticketId)}"><strong>${esc(item.ticketCode || item.ticketId)}</strong><small>${esc(item.ticketTitle || "")}</small></button></td><td><strong>${esc(item.provider || "—")}</strong></td><td>${esc(labels[proposal.category] || proposal.category || "—")} · ${esc(labels[proposal.priority] || proposal.priority || "—")}</td><td>${result}</td><td>${formatDate(item.generatedAt)}</td></tr>`;
  }).join("") : '<tr><td colspan="5" class="muted">Chưa có quyết định AI trong khoảng đã chọn.</td></tr>';
  $$('[data-ai-ticket]').forEach((button) => { button.onclick = () => openTicket(button.dataset.aiTicket).catch((error) => toast(error.message)); });
}

async function openTicket(ticketId) {
  const [ticketBundle, copilotBundle] = await Promise.all([
    api(`/api/tickets/${ticketId}`),
    api(`/api/staff/tickets/${ticketId}/copilot`).catch((error) => ({ runs: [], error: error.message })),
  ]);
  const { ticket, messages = [], requester, attachments = [], history = [] } = ticketBundle;
  const copilotRuns = Array.isArray(copilotBundle.runs) ? copilotBundle.runs : [];
  const copilotModelOptions = Array.isArray(copilotBundle.modelOptions?.options) ? copilotBundle.modelOptions.options : [];
  const savedProvider = savedCopilotProvider();
  const selectedProvider = savedProvider === "auto" || copilotModelOptions.some((item) => item.providerKey === savedProvider && item.ready) ? savedProvider : "auto";
  const latestCopilot = copilotRuns[0] || null;
  $("#dialogTicketCode").textContent = `${ticket.code} — ${ticket.title}`;
  const analysis = ticket.aiAnalysis || {}; const guided = Boolean(analysis.canAutoHandle); const escalatedByAi = Boolean(ticket.aiAnalysis && !guided);
  const humanOnly = Boolean(ticket.humanHandoff?.locked);
  const sourceList = Array.isArray(analysis.playbookSources) ? analysis.playbookSources : [];
  const writable = ["admin", "technician"].includes(state.user?.role);
  const assigneeOptions = [...state.directory];
  if (ticket.assignedTo && !assigneeOptions.some((item) => item.id === ticket.assignedToId)) assigneeOptions.push({ id: ticket.assignedToId || `legacy:${ticket.assignedTo}`, displayName: ticket.assignedTo, active: true });
  const attachmentHtml = attachments.length ? attachments.map((attachment) => `<div class="attachment-row"><button class="attachment-preview-admin" data-preview-attachment="${attachment.id}" ${isPreviewableAttachment(attachment) ? "" : "disabled"}><span>▧</span><span><strong>${esc(attachment.fileName)}</strong><small>${formatSize(attachment.size)} · ${esc(attachment.uploaderName)} · ${isPreviewableAttachment(attachment) ? "Xem trước" : "Chỉ tải xuống"}</small></span></button><button class="attachment-download-admin" data-download-attachment="${attachment.id}" title="Tải xuống">↓</button></div>`).join("") : '<div class="muted">Chưa có file đính kèm.</div>';
  const historyHtml = history.length ? history.map((item) => `<div class="history-row"><span></span><div><strong>${esc(historyLabels[item.type] || item.type)}</strong>${item.from !== null && item.from !== undefined && item.to !== null && item.to !== undefined ? `<p>${esc(item.from || "—")} → ${esc(item.to || "—")}</p>` : ""}${item.note ? `<p>${esc(item.note)}</p>` : ""}<small>${esc(item.actorName)} · ${formatDate(item.createdAt)}</small></div></div>`).join("") : '<div class="muted">Chưa có lịch sử.</div>';
  const satisfactionHtml = ticket.satisfaction ? `<div class="rating-admin"><strong>${"★".repeat(ticket.satisfaction.score)}${"☆".repeat(5 - ticket.satisfaction.score)}</strong><p>${esc(ticket.satisfaction.comment || "Không có nhận xét")}</p><small>${formatDate(ticket.satisfaction.ratedAt)}</small></div>` : '<div class="rating-empty"><span>☆</span><div><strong>Chưa có đánh giá</strong><small>Đánh giá sẽ xuất hiện sau khi ticket hoàn tất.</small></div></div>';
  const sourceHtml = sourceList.length ? `<div class="playbook-source"><strong>Nguồn Playbook đã đối chiếu</strong><ul>${sourceList.map((item) => `<li><b>${esc(item.id)}</b> — ${esc(item.title || "")}${item.version ? ` · v${esc(item.version)}` : ""}${item.score != null ? ` · ${Math.round(item.score * 100)}%` : ""}</li>`).join("")}</ul></div>` : "";
  const quality = analysis.quality || {}; const proposal = quality.proposal || {}; const review = quality.review || null;
  const reviewSummary = review ? `<div class="ai-review-summary ${review.result}"><div><strong>${review.result === "correct" ? "✓ Admin xác nhận đúng" : "! Admin đánh dấu cần sửa"}</strong><small>${esc(review.reviewedByName || "Admin")} · ${formatDate(review.reviewedAt)}</small></div>${review.note ? `<p>${esc(review.note)}</p>` : ""}${Object.keys(review.corrections || {}).length ? `<p>Hiệu chỉnh: ${Object.entries(review.corrections).map(([key, value]) => `${esc(key)}=${esc(labels[value] || value)}`).join(" · ")}</p>` : ""}</div>` : '<div class="ai-review-pending">Chưa được Admin đánh giá.</div>';
  const reviewControls = state.user?.role === "admin" && quality.decisionId ? `<div class="ai-review-actions"><button id="aiReviewCorrectBtn" type="button" class="button ai-correct-button">✓ Đúng</button><button id="aiReviewIncorrectBtn" type="button" class="button subtle-button">Cần sửa</button></div><form id="aiReviewForm" class="ai-review-form hidden"><div class="two"><label>Danh mục<select id="aiReviewCategory">${["network", "printer", "windows", "office", "account", "software", "hardware", "other"].map((value) => `<option value="${value}" ${ticket.category === value ? "selected" : ""}>${labels[value]}</option>`).join("")}</select></label><label>Ưu tiên<select id="aiReviewPriority">${["low", "normal", "high", "urgent"].map((value) => `<option value="${value}" ${ticket.priority === value ? "selected" : ""}>${labels[value]}</option>`).join("")}</select></label><label>Rủi ro<select id="aiReviewRisk">${["low", "medium", "high"].map((value) => `<option value="${value}" ${ticket.risk === value ? "selected" : ""}>${value}</option>`).join("")}</select></label><label>Quyết định<select id="aiReviewOutcome">${[["guide_user", "Hướng dẫn"], ["escalate", "Chuyển kỹ thuật viên"], ["need_info", "Cần thêm thông tin"], ["likely_resolved", "Có thể đã xử lý"]].map(([value, label]) => `<option value="${value}" ${(proposal.outcome || analysis.outcome) === value ? "selected" : ""}>${label}</option>`).join("")}</select></label></div><label>Ghi chú<textarea id="aiReviewNote" rows="2" placeholder="AI sai ở đâu hoặc thiếu tín hiệu nào?"></textarea></label><small>Danh mục, ưu tiên và rủi ro hiệu chỉnh sẽ được áp dụng vào ticket; trạng thái/handoff không tự thay đổi.</small><button type="submit" class="button primary-button">Lưu đánh giá</button></form>` : quality.decisionId ? "" : '<div class="ai-review-legacy">Ticket cũ chưa có decision record v5.8+.</div>';
  const reviewHtml = `<div class="ai-quality-ticket"><div class="ai-quality-head"><strong>Quality review</strong><span>${esc(quality.provider || analysis.source || "—")}</span></div>${reviewSummary}${reviewControls}</div>`;
  const copilotSuggestion = latestCopilot?.suggestion || null;
  const copilotList = (items, emptyText) => Array.isArray(items) && items.length ? `<ul>${items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>` : `<p class="muted">${esc(emptyText)}</p>`;
  const rulesFallback = latestCopilot?.suggestion?.analysisMode === "rules_fallback";
  const copilotStatusLabel = latestCopilot?.status === "completed" ? (rulesFallback ? "Dự phòng Playbook" : "Cloud AI sẵn sàng") : latestCopilot?.status === "failed" ? "Thất bại" : latestCopilot?.status === "running" ? "Đang phân tích" : latestCopilot ? "Đang chờ" : "Chưa chạy";
  const copilotModelOptionHtml = [
    `<option value="auto" ${selectedProvider === "auto" ? "selected" : ""}>Tự động · route theo cấu hình</option>`,
    ...copilotModelOptions.map((item) => {
      const label = copilotProviderLabels[item.providerKey] || item.providerKey;
      const readiness = item.ready ? "" : ` · ${providerReasonLabels[item.reasonCode] || "không sẵn sàng"}`;
      return `<option value="${esc(item.providerKey)}" ${selectedProvider === item.providerKey ? "selected" : ""} ${item.ready ? "" : "disabled"}>${esc(label)} · ${esc(item.model || "chưa cấu hình")}${esc(readiness)} · ${esc(providerOptionQuotaLabel(item))}</option>`;
    }),
  ].join("");
  const copilotModelPicker = writable ? `<div class="copilot-model-picker"><label for="copilotModelSelect"><span>Model ưu tiên cho lần phân tích tiếp theo</span><select id="copilotModelSelect">${copilotModelOptionHtml}</select></label><small>Model đã chọn được gọi trước. Nếu lỗi, router tự thử các Cloud provider còn lại rồi mới dùng Rules/Playbook an toàn.</small></div>` : "";
  const causesHtml = copilotSuggestion?.likelyCauses?.length ? `<div class="copilot-causes">${copilotSuggestion.likelyCauses.map((item) => `<div><span class="copilot-basis ${item.basis}">${item.basis === "playbook" ? `PLAYBOOK ${esc(item.playbookId || "")}` : "GIẢ THUYẾT AI"}</span><strong>${esc(item.description)}</strong><small>Độ tin cậy ${Math.round((item.confidence || 0) * 100)}%</small></div>`).join("")}</div>` : '<p class="muted">Chưa có giả thuyết nguyên nhân.</p>';
  const playbookActionsHtml = copilotSuggestion?.playbookActions?.length ? `<ol class="copilot-actions">${copilotSuggestion.playbookActions.map((item) => `<li><b>${item.stepNumber || "•"}</b><span><strong>${esc(item.text)}</strong><small>${esc(item.playbookId)} · ${esc(item.playbookTitle || "Playbook")}</small></span></li>`).join("")}</ol>` : '<p class="muted">Không có bước Playbook nào được chọn.</p>';
  const playbookAssessment = copilotSuggestion?.playbookAssessment || null;
  const fitLabels = { matched: "KHỚP TỐT", partial: "KHỚP MỘT PHẦN", none: "KHÔNG KHỚP" };
  const playbookAssessmentHtml = playbookAssessment
    ? `<div class="copilot-fit"><span class="copilot-fit-badge ${esc(playbookAssessment.fit || "none")}">${esc(fitLabels[playbookAssessment.fit] || "CHƯA ĐÁNH GIÁ")}</span><strong>${esc(playbookAssessment.explanation || "")}</strong>${playbookAssessment.bestScore != null ? `<small>Điểm retrieval cao nhất: ${Math.round((playbookAssessment.bestScore || 0) * 100)}%</small>` : ""}</div>`
    : '<p class="muted">Run cũ chưa có đánh giá độ khớp Playbook.</p>';
  const independentAnalysis = copilotSuggestion?.independentAnalysis || null;
  const hypothesesHtml = independentAnalysis?.hypotheses?.length
    ? `<div class="copilot-hypotheses">${independentAnalysis.hypotheses.map((item, index) => `<article><div class="copilot-card-head"><span>GIẢ THUYẾT ${index + 1}</span><b>${Math.round((item.confidence || 0) * 100)}%</b></div><strong>${esc(item.description)}</strong><p>${esc(item.rationale)}</p><small>Cách kiểm chứng</small>${copilotList(item.verificationSteps, "Chưa có bước kiểm chứng.")}</article>`).join("")}</div>`
    : '<p class="muted">Cloud AI chưa tạo được giả thuyết độc lập cho run này.</p>';
  const solutionRiskLabels = { low: "RỦI RO THẤP", medium: "RỦI RO VỪA", high: "CẦN PHÊ DUYỆT" };
  const solutionPathsHtml = independentAnalysis?.solutionPaths?.length
    ? `<div class="copilot-solutions">${independentAnalysis.solutionPaths.map((item, index) => `<article><div class="copilot-card-head"><span>HƯỚNG ${index + 1}</span><b class="risk-${esc(item.risk || "medium")}">${esc(solutionRiskLabels[item.risk] || solutionRiskLabels.medium)}</b></div><strong>${esc(item.title)}</strong><p>${esc(item.rationale)}</p><ol>${(item.steps || []).map((step) => `<li>${esc(step)}</li>`).join("")}</ol><div class="copilot-signals"><p><b>Tín hiệu thành công</b>${esc(item.successSignal)}</p><p><b>Điều kiện dừng / chuyển cấp</b>${esc(item.stopCondition)}</p></div></article>`).join("")}</div>`
    : '<p class="muted">Chưa có hướng giải quyết độc lập.</p>';
  const analysisModeLabels = { hybrid: "HYBRID · PLAYBOOK + AI", ai_led: "AI-LED · NGOÀI PLAYBOOK", rules_fallback: "DỰ PHÒNG · RULES + PLAYBOOK" };
  const copilotHtml = latestCopilot ? `<div class="copilot-run ${latestCopilot.status}${rulesFallback ? " fallback" : ""}">
    <div class="copilot-run-head"><div><span class="copilot-status-dot"></span><strong>${copilotStatusLabel}</strong><small>Yêu cầu: ${latestCopilot.requestedProviderKey && latestCopilot.requestedProviderKey !== "auto" ? `${esc(copilotProviderLabels[latestCopilot.requestedProviderKey] || latestCopilot.requestedProviderKey)}${latestCopilot.requestedModel ? ` · ${esc(latestCopilot.requestedModel)}` : ""}` : "Tự động"}</small><small>Thực tế: ${esc(latestCopilot.provider || "Đang chọn provider")}${latestCopilot.model ? ` · ${esc(latestCopilot.model)}` : ""} · ${formatDate(latestCopilot.createdAt)}</small></div><div class="copilot-run-badges"><span class="badge">${Math.round((latestCopilot.confidence || 0) * 100)}%</span>${copilotSuggestion?.analysisMode ? `<span class="copilot-mode ${esc(copilotSuggestion.analysisMode)}">${esc(analysisModeLabels[copilotSuggestion.analysisMode] || copilotSuggestion.analysisMode)}</span>` : ""}</div></div>
    ${latestCopilot.error ? `<div class="agent-error">${esc(latestCopilot.error)}</div>` : ""}
    ${copilotSuggestion ? `<div class="copilot-section"><h4>Tóm tắt nội bộ</h4><p>${esc(copilotSuggestion.summary || "")}</p></div>
      <div class="copilot-section"><h4>Nguyên nhân có thể</h4>${causesHtml}</div>
      <div class="copilot-section playbook-fit"><h4>Độ khớp với Playbook</h4>${playbookAssessmentHtml}</div>
      <div class="copilot-section"><h4>Bước theo Playbook</h4>${playbookActionsHtml}</div>
      <div class="copilot-section inference"><h4>Phân tích độc lập của AI</h4><p>${esc(independentAnalysis?.reasoningSummary || "Run này chưa có phân tích độc lập.")}</p>${hypothesesHtml}</div>
      <div class="copilot-section inference solutions"><h4>Nhiều hướng giải quyết do AI đề xuất</h4>${solutionPathsHtml}</div>
      <div class="copilot-section inference"><h4>Kiểm tra nhanh bổ sung</h4>${copilotList(copilotSuggestion.diagnosticSuggestions, "Không có gợi ý bổ sung.")}</div>
      <div class="copilot-section"><h4>Thông tin còn thiếu</h4>${copilotList(copilotSuggestion.missingInformation, "Không ghi nhận.")}</div>
      <div class="copilot-section risk"><h4>Rủi ro / điều không nên làm</h4>${copilotList(copilotSuggestion.risks, "Không ghi nhận cảnh báo riêng.")}</div>
      <div class="copilot-draft"><h4>Bản nháp phản hồi</h4><p>${esc(copilotSuggestion.draftReply || "")}</p>${writable && copilotSuggestion.draftReply ? '<button id="useCopilotDraftBtn" type="button" class="button subtle-button">Dùng làm bản nháp</button>' : ""}</div>` : '<div class="copilot-loading">Copilot đang đối chiếu hội thoại, Playbook và route cloud. Nhấn Làm mới sau ít phút.</div>'}
  </div>` : `<div class="copilot-empty"><strong>Chưa có phân tích Copilot</strong><p>${esc(copilotBundle.error || "Copilot sẽ tự chạy sau khi ticket bàn giao, hoặc kỹ thuật viên có thể yêu cầu phân tích ngay.")}</p></div>`;
  const messageHtml = messages.length ? messages.map((message) => { const linked = attachments.filter((attachment) => attachment.messageId === message.id); const linkedHtml = linked.length ? `<div class="message-attachments">${linked.map((attachment) => `<button data-preview-attachment="${attachment.id}" ${isPreviewableAttachment(attachment) ? "" : "disabled"}>▧ <span>${esc(attachment.fileName)}</span></button><button class="message-download" data-download-attachment="${attachment.id}">↓</button>`).join("")}</div>` : ""; const body = escalatedByAi && message.role === "assistant" ? "Đã chuyển yêu cầu cho kỹ thuật viên." : message.body; return `<article class="message ${message.role}"><div class="message-meta"><strong>${esc(message.authorName)}</strong><time>${formatDate(message.createdAt)}</time></div><div class="message-body">${esc(body)}</div>${linkedHtml}</article>`; }).join("") : '<div class="conversation-admin-empty">Chưa có trao đổi trong ticket này.</div>';
  const workbenchQueue = state.tickets.slice(0, 14).map((item) => `<button type="button" class="workbench-queue-item ${item.id === ticket.id ? "active" : ""} ${item.sla?.overdue ? "overdue" : ""}" data-workbench-ticket="${esc(item.id)}"><span><b>${esc(item.code)}</b><em>${formatDate(item.updatedAt)}</em></span><strong>${esc(item.title)}</strong><small><span class="badge ${item.status}">${esc(labels[item.status] || item.status)}</span><span>${esc(item.assignedTo || "Chưa phân công")}</span></small></button>`).join("");
  const nextAction = ticketNextAction(ticket);
  const actionOwner = ticketActionOwner(ticket);
  $("#ticketDetail").innerHTML = `<div class="ticket-workbench">
    <aside class="workbench-queue" aria-label="Hàng đợi ticket trong workspace">
      <div class="workbench-queue-head"><span class="card-kicker">HÀNG ĐỢI</span><strong>${state.tickets.length} yêu cầu</strong><small>Chọn ticket để chuyển ngữ cảnh</small></div>
      <div class="workbench-queue-list">${workbenchQueue || '<div class="muted">Hàng đợi đang trống.</div>'}</div>
    </aside>
    <div class="workbench-main">
      <section class="workbench-signal-strip" aria-label="Tín hiệu xử lý ticket">
        <div><span>TRẠNG THÁI</span><strong>${esc(labels[ticket.status] || ticket.status)}</strong></div>
        <div><span>PHỤ TRÁCH</span><strong>${esc(ticket.assignedTo || "Chưa phân công")}</strong></div>
        <div><span>BƯỚC TIẾP THEO</span><strong>${esc(nextAction)}</strong></div>
        <div class="action-owner ${actionOwner === "NGƯỜI DÙNG" ? "waiting" : actionOwner === "HOÀN TẤT" ? "complete" : "active"}"><span>HÀNH ĐỘNG</span><strong>${actionOwner}</strong></div>
      </section>
      <article class="detail-card admin-conversation-card">
        <div class="card-head conversation-admin-head"><div><span class="overline">TRAO ĐỔI TRỰC TIẾP</span><h3>Hội thoại với ${esc(requester?.name || "người dùng")}</h3><p>Phản hồi mới nhất luôn nằm ở cuối hội thoại.</p></div><span class="badge">${messages.length} tin nhắn</span></div>
        <div id="adminMessages" class="messages">${messageHtml}</div>
        ${writable ? `<div class="admin-reply-dock"><div id="adminReplyFileList" class="admin-reply-file-list"></div><div class="admin-reply-composer"><label class="admin-reply-attach" title="Thêm ảnh hoặc file" aria-label="Đính kèm ảnh hoặc file">${paperclipIcon}<input id="adminReplyFilesInput" type="file" multiple accept="image/*,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip"/></label><textarea id="adminReply" rows="2" placeholder="Nhập phản hồi cho người dùng…"></textarea><button id="sendReply" class="button primary-button" type="button">Gửi phản hồi</button></div><small class="reply-security-note">Tối đa 4 file/lần · tổng 10 MB/yêu cầu</small></div>` : '<div class="viewer-notice">Chế độ chỉ xem · Bạn không thể phản hồi hoặc thay đổi ticket.</div>'}
      </article>
    </div>
    <aside class="workbench-side">
      <article class="detail-card requester-card admin-ticket-summary"><div class="requester-avatar">${esc(initials(requester?.name))}</div><div><strong>${esc(requester?.name || "Không xác định")}</strong><small>${esc(requester?.department || "Chưa có phòng ban")} · ${esc(requester?.phone || "Chưa có số liên hệ")}</small></div><div class="admin-summary-badges"><span class="badge ${ticket.status}">${esc(labels[ticket.status] || ticket.status)}</span><span class="badge ${ticket.priority}">${esc(labels[ticket.priority] || ticket.priority)}</span></div></article>
      <section class="detail-card ticket-context-card" aria-label="Thông tin hỗ trợ xử lý ticket">
        <div class="ticket-context-tabs" role="tablist" aria-label="Nhóm thông tin ticket">
          <button type="button" class="active" role="tab" aria-selected="true" aria-controls="ticketContextOverview" data-ticket-context-tab="overview"><span>Tổng quan</span></button>
          <button type="button" role="tab" aria-selected="false" aria-controls="ticketContextAi" data-ticket-context-tab="ai"><span>AI</span><em class="context-dot ${guided ? "guide" : "escalate"}"></em></button>
          <button type="button" role="tab" aria-selected="false" aria-controls="ticketContextCopilot" data-ticket-context-tab="copilot"><span>Copilot</span><em>${copilotRuns.length}</em></button>
          <button type="button" role="tab" aria-selected="false" aria-controls="ticketContextFiles" data-ticket-context-tab="files"><span>File</span><em>${attachments.length}</em></button>
          <button type="button" role="tab" aria-selected="false" aria-controls="ticketContextHistory" data-ticket-context-tab="history"><span>Lịch sử</span><em>${history.length}</em></button>
        </div>
        <div class="ticket-context-body">
          <section id="ticketContextOverview" class="ticket-context-panel" role="tabpanel" data-ticket-context-panel="overview">
            <div class="side-description"><strong>Mô tả ban đầu</strong><div class="description">${esc(ticket.description)}</div></div>
            <div class="meta-grid"><div class="meta-box"><span>Danh mục</span><strong>${esc(labels[ticket.category] || ticket.category)}</strong></div><div class="meta-box"><span>Thiết bị</span><strong>${esc(ticket.device || "—")}</strong></div><div class="meta-box"><span>Vị trí</span><strong>${esc(ticket.location || "—")}</strong></div><div class="meta-box"><span>Tạo lúc</span><strong>${formatDate(ticket.createdAt)}</strong></div></div>
            <div class="sla-panel"><div class="sla-box ${ticket.sla?.firstResponseOverdue ? "overdue" : ticket.sla?.paused ? "paused" : ""}"><span>Phản hồi đầu tiên</span><strong>${ticket.sla?.firstRespondedAt ? "Đã phản hồi" : ticket.sla?.paused ? "Tạm dừng" : timeLeft(ticket.sla?.firstResponseDueAt)}</strong></div><div class="sla-box ${ticket.sla?.resolutionOverdue || ticket.sla?.overdue ? "overdue" : ticket.sla?.paused ? "paused" : ""}"><span>Hạn hoàn tất</span><strong>${["resolved", "closed"].includes(ticket.status) ? "Đã hoàn tất" : ticket.sla?.paused ? "Chờ Client" : timeLeft(ticket.sla?.resolutionDueAt)}</strong></div></div>
            <div class="context-section"><div class="context-section-title">Đánh giá hài lòng</div>${satisfactionHtml}</div>
          </section>
          <section id="ticketContextAi" class="ticket-context-panel" role="tabpanel" data-ticket-context-panel="ai" hidden>
            <div class="decision-panel ${guided && !humanOnly ? "" : "escalated"}"><div class="decision-head"><span class="decision-symbol">${guided && !humanOnly ? "✓" : "↗"}</span><div><strong>${humanOnly ? "AI không phản hồi trực tiếp người dùng" : guided ? "Hướng dẫn theo Playbook" : "Đã chuyển kỹ thuật viên"}</strong><small>${humanOnly ? "Copilot vẫn hỗ trợ nội bộ cho HelpDesk" : guided ? "Đủ điều kiện an toàn" : esc(escalationLabels[analysis.escalationCode] || "Không đủ điều kiện tự động xử lý")}</small></div><span class="badge ${guided && !humanOnly ? "guide" : "escalate"}">${humanOnly ? "STAFF ONLY" : guided ? "GUIDE" : "ESCALATE"}</span></div><div class="decision-copy"><strong>${esc(analysis.summary || "Chưa có đánh giá.")}</strong>\n\n${esc(analysis.reason || "")}</div><div class="decision-meta"><span class="badge">${esc(analysis.source || "—")}</span><span class="badge">${esc(analysis.model || "Rules")}</span><span class="badge">${Math.round((analysis.confidence || 0) * 100)}%</span></div>${sourceHtml}</div>${reviewHtml}
          </section>
          <section id="ticketContextCopilot" class="ticket-context-panel copilot-panel" role="tabpanel" data-ticket-context-panel="copilot" hidden><div class="copilot-privacy-note"><strong>Chỉ dành cho HelpDesk</strong><span>Copilot kết hợp Playbook với phân tích độc lập, kể cả khi không có procedure phù hợp. Đây là giả thuyết cần kiểm chứng; Copilot không có quyền tự gửi, thực thi hoặc đóng ticket.</span></div>${copilotModelPicker}${copilotHtml}<div class="copilot-toolbar"><button id="refreshCopilotBtn" type="button" class="button subtle-button">Làm mới</button>${writable ? '<button id="reanalyzeCopilotBtn" type="button" class="button primary-button">Phân tích bằng model đã chọn</button>' : ""}</div></section>
          <section id="ticketContextFiles" class="ticket-context-panel" role="tabpanel" data-ticket-context-panel="files" hidden><div class="attachment-admin-list">${attachmentHtml}</div>${writable ? '<label class="admin-upload">＋ Tải thêm file<input id="adminFiles" type="file" multiple accept="image/*,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip" /></label>' : ""}</section>
          <section id="ticketContextHistory" class="ticket-context-panel" role="tabpanel" data-ticket-context-panel="history" hidden><div class="history-admin">${historyHtml}</div></section>
        </div>
      </section>

      ${writable ? `<article class="detail-card dispatch-card"><div class="card-head"><div><span class="card-kicker">XỬ LÝ TICKET</span><h3>Điều phối</h3></div><span class="badge">${state.user?.role === "admin" ? "ADMIN" : "TECHNICIAN"}</span></div><div class="control-grid"><div class="two"><label>Trạng thái<select id="editStatus">${["open", "waiting_user", "in_progress", "resolved", "closed"].map((value) => `<option value="${value}" ${ticket.status === value ? "selected" : ""}>${labels[value]}</option>`).join("")}</select></label><label>Ưu tiên<select id="editPriority">${["low", "normal", "high", "urgent"].map((value) => `<option value="${value}" ${ticket.priority === value ? "selected" : ""}>${labels[value]}</option>`).join("")}</select></label></div><div class="dispatch-secondary"><label>Người phụ trách<select id="editAssignee"><option value="">Chưa phân công</option>${assigneeOptions.map((account) => `<option value="${esc(account.id)}" ${ticket.assignedToId === account.id || (!ticket.assignedToId && account.displayName === ticket.assignedTo) ? "selected" : ""}>${esc(account.displayName)}</option>`).join("")}</select></label><label>Ghi chú / giải pháp<textarea id="editResolution" rows="2" placeholder="Ghi nguyên nhân và cách xử lý…">${esc(ticket.resolution || "")}</textarea></label></div><div class="dispatch-actions"><button id="saveTicket" class="button primary-button save-button" type="button">Lưu cập nhật</button><button id="draftFromTicketBtn" class="button source-ticket-button" type="button">Tạo Playbook</button></div></div></article>` : ""}
    </aside>
  </div>`;

  const adminMessages = $("#adminMessages");

  $$('[data-workbench-ticket]').forEach((element) => { element.onclick = () => openTicket(element.dataset.workbenchTicket).catch((error) => toast(error.message)); });

  const contextTabs = $$('[data-ticket-context-tab]');
  const contextPanels = $$('[data-ticket-context-panel]');
  const activateContextTab = (name) => {
    contextTabs.forEach((tab) => { const active = tab.dataset.ticketContextTab === name; tab.classList.toggle("active", active); tab.setAttribute("aria-selected", String(active)); tab.tabIndex = active ? 0 : -1; });
    contextPanels.forEach((panel) => { panel.hidden = panel.dataset.ticketContextPanel !== name; });
  };
  contextTabs.forEach((tab, index) => {
    tab.onclick = () => activateContextTab(tab.dataset.ticketContextTab);
    tab.onkeydown = (event) => { if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return; event.preventDefault(); const direction = event.key === "ArrowRight" ? 1 : -1; const next = contextTabs[(index + direction + contextTabs.length) % contextTabs.length]; activateContextTab(next.dataset.ticketContextTab); next.focus(); };
  });
  activateContextTab("overview");

  if ($("#refreshCopilotBtn")) $("#refreshCopilotBtn").onclick = async () => {
    try { await openTicket(ticket.id); } catch (error) { toast(error.message); }
  };
  if ($("#copilotModelSelect")) $("#copilotModelSelect").onchange = (event) => {
    saveCopilotProvider(event.target.value);
  };
  if ($("#reanalyzeCopilotBtn")) $("#reanalyzeCopilotBtn").onclick = async () => {
    const button = $("#reanalyzeCopilotBtn"); button.disabled = true; button.textContent = "Đang xếp hàng…";
    try {
      const providerKey = $("#copilotModelSelect")?.value || "auto";
      saveCopilotProvider(providerKey);
      await api(`/api/staff/tickets/${ticket.id}/copilot/runs`, { method: "POST", body: JSON.stringify({ providerKey }) });
      const providerLabel = providerKey === "auto" ? "route tự động" : (copilotProviderLabels[providerKey] || providerKey);
      toast(`Copilot đang phân tích bằng ${providerLabel}.`);
      await openTicket(ticket.id);
    } catch (error) { toast(error.message); button.disabled = false; button.textContent = "Phân tích bằng model đã chọn"; }
  };
  if ($("#useCopilotDraftBtn")) $("#useCopilotDraftBtn").onclick = () => {
    const editor = $("#adminReply");
    editor.value = copilotSuggestion?.draftReply || "";
    editor.focus();
    toast("Đã đưa gợi ý vào ô nháp; hãy kiểm tra trước khi gửi");
  };

  const saveAiReview = async (payload) => {
    await api(`/api/admin/tickets/${ticket.id}/ai-review`, { method: "POST", body: JSON.stringify({ decisionId: quality.decisionId, ...payload }) });
    toast(payload.result === "correct" ? "Đã xác nhận quyết định AI đúng" : "Đã lưu hiệu chỉnh AI");
    await load(); await openTicket(ticket.id);
  };
  if ($("#aiReviewCorrectBtn")) $("#aiReviewCorrectBtn").onclick = async () => {
    try { await saveAiReview({ result: "correct", applyToTicket: false }); } catch (error) { toast(error.message); }
  };
  if ($("#aiReviewIncorrectBtn")) $("#aiReviewIncorrectBtn").onclick = () => {
    $("#aiReviewForm").classList.toggle("hidden");
    if (!$("#aiReviewForm").classList.contains("hidden")) $("#aiReviewNote").focus();
  };
  if ($("#aiReviewForm")) $("#aiReviewForm").onsubmit = async (event) => {
    event.preventDefault();
    const button = $("#aiReviewForm button[type='submit']"); button.disabled = true;
    try {
      await saveAiReview({
        result: "incorrect",
        applyToTicket: true,
        note: $("#aiReviewNote").value,
        corrections: {
          category: $("#aiReviewCategory").value,
          priority: $("#aiReviewPriority").value,
          risk: $("#aiReviewRisk").value,
          outcome: $("#aiReviewOutcome").value,
        },
      });
    } catch (error) { toast(error.message); button.disabled = false; }
  };

  $$('[data-preview-attachment]').forEach((element) => { element.onclick = async () => { const attachment = attachments.find((item) => item.id === element.dataset.previewAttachment); if (attachment) try { await previewAttachment(attachment); } catch (error) { toast(error.message); } }; });
  $$('[data-download-attachment]').forEach((element) => { element.onclick = async () => { const attachment = attachments.find((item) => item.id === element.dataset.downloadAttachment); if (attachment) try { await downloadAttachment(attachment); } catch (error) { toast(error.message); } }; });
  if ($("#adminFiles")) $("#adminFiles").onchange = async (event) => {
    const files = [...event.target.files]; event.target.value = ""; if (!files.length) return;
    const tooLarge = files.find((file) => file.size > MAX_TICKET_ATTACHMENT_BYTES);
    if (tooLarge) return toast(`${tooLarge.name} vượt quá giới hạn 10 MB`);
    const storedBytes = attachments.reduce((sum, attachment) => sum + (attachment.size || 0), 0);
    const selectedBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (storedBytes + selectedBytes > MAX_TICKET_ATTACHMENT_BYTES) return toast("Tổng ảnh/file của yêu cầu vượt quá 10 MB");
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
  const renderReplyFiles = () => { if (!$("#adminReplyFileList")) return; $("#adminReplyFileList").innerHTML = replyFiles.map((file, index) => `<div><span class="admin-reply-file-icon">${paperclipIcon}</span><span><strong>${esc(file.name)}</strong><small>${formatSize(file.size)}</small></span><button type="button" data-remove-reply-file="${index}" aria-label="Bỏ ${esc(file.name)}">×</button></div>`).join(""); $$('[data-remove-reply-file]').forEach((element) => { element.onclick = () => { replyFiles.splice(Number(element.dataset.removeReplyFile), 1); renderReplyFiles(); }; }); };
  if ($("#adminReplyFilesInput")) $("#adminReplyFilesInput").onchange = (event) => {
    const files = [...event.target.files]; event.target.value = "";
    const tooLarge = files.find((file) => file.size > MAX_TICKET_ATTACHMENT_BYTES);
    if (tooLarge) return toast(`${tooLarge.name} vượt quá giới hạn 10 MB`);
    const proposed = [...replyFiles, ...files];
    if (proposed.length > MAX_REPLY_FILES) toast(`Mỗi phản hồi tối đa ${MAX_REPLY_FILES} file`);
    const limited = proposed.slice(0, MAX_REPLY_FILES);
    const storedBytes = attachments.reduce((sum, attachment) => sum + (attachment.size || 0), 0);
    const selectedBytes = limited.reduce((sum, file) => sum + file.size, 0);
    if (storedBytes + selectedBytes > MAX_TICKET_ATTACHMENT_BYTES) return toast("Tổng ảnh/file của yêu cầu vượt quá 10 MB");
    replyFiles = limited; renderReplyFiles();
  };
  if ($("#saveTicket")) $("#saveTicket").onclick = async () => { try { const selected = $("#editAssignee").value; await api(`/api/admin/tickets/${ticket.id}`, { method: "PATCH", body: JSON.stringify({ status: $("#editStatus").value, priority: $("#editPriority").value, assignedToId: selected.startsWith("legacy:") ? undefined : selected, assignedTo: selected.startsWith("legacy:") ? ticket.assignedTo : undefined, resolution: $("#editResolution").value }) }); toast("Đã cập nhật ticket"); await load(); await openTicket(ticket.id); } catch (error) { toast(error.message); } };
  if ($("#sendReply")) $("#sendReply").onclick = async () => {
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
  if ($("#draftFromTicketBtn")) $("#draftFromTicketBtn").onclick = async () => { try { const result = await api(`/api/staff/playbook/drafts/from-ticket/${ticket.id}`, { method: "POST", body: JSON.stringify({}) }); $("#ticketDialog").close(); await refreshGovernance(); switchTab("governance"); toast("Đã tạo draft từ ticket. Hãy chuẩn hóa trước khi gửi duyệt."); await openPlaybookEditor(result.procedure.id); } catch (error) { toast(error.message); } };
  if (!$("#ticketDialog").open) $("#ticketDialog").showModal();
  window.requestAnimationFrame(() => {
    if (adminMessages) adminMessages.scrollTop = adminMessages.scrollHeight;
  });
}

function editKb(id = "") {
  const entry = state.kb.find((item) => item.id === id);
  $("#kbDialogTitle").textContent = entry ? "Sửa hướng dẫn" : "Thêm hướng dẫn"; $("#kbId").value = entry?.id || ""; $("#kbTitle").value = entry?.title || ""; $("#kbCategory").value = entry?.category || "other"; $("#kbRisk").value = entry?.risk || "low"; $("#kbKeywords").value = (entry?.keywords || []).join(", "); $("#kbSummary").value = entry?.summary || ""; $("#kbSteps").value = (entry?.steps || []).join("\n"); $("#kbAuto").checked = Boolean(entry?.autoEligible); $("#kbActive").checked = entry?.active !== false; $("#kbDialog").showModal();
}

$("#loginForm").onsubmit = async (event) => {
  event.preventDefault();
  const username = $("#staffUsername"); const password = $("#password"); const errorBox = $("#loginError");
  errorBox.textContent = ""; username.removeAttribute("aria-invalid"); password.removeAttribute("aria-invalid"); setLoginBusy(true);
  try {
    const result = await api("/api/auth/staff", { method: "POST", body: JSON.stringify({ username: username.value.trim(), password: password.value }) });
    state.token = result.token; sessionStorage.setItem("hd_admin", result.token); show(); await load();
  } catch (error) {
    errorBox.textContent = error.message;
    if (error.status === 401) { username.setAttribute("aria-invalid", "true"); password.setAttribute("aria-invalid", "true"); password.focus(); password.select(); }
  } finally { setLoginBusy(false); }
};
$("#passwordVisibilityToggle").onclick = () => setPasswordVisibility($("#password").type === "password");
["#staffUsername", "#password"].forEach((selector) => { $(selector).oninput = () => { $(selector).removeAttribute("aria-invalid"); $("#loginError").textContent = ""; }; });
$("#headerIdentity").onclick = () => openSettings("account");
$("#accountMenuToggle").onclick = (event) => { event.stopPropagation(); setAccountMenuOpen($("#accountMenuToggle").getAttribute("aria-expanded") !== "true"); };
$$('[data-settings-view]').forEach((button) => { button.onclick = () => openSettings(button.dataset.settingsView); });
$$('[data-settings-tab]').forEach((button) => { button.onclick = () => selectSettingsView(button.dataset.settingsTab); });
$$('[data-close-settings]').forEach((button) => { button.onclick = () => $("#settingsDialog").close(); });
$("#settingsDialog").onclick = (event) => { if (event.target === $("#settingsDialog")) $("#settingsDialog").close(); };
$("#autoRefreshSetting").onchange = (event) => { setAutoRefreshPreference(event.target.checked); toast(event.target.checked ? "Đã bật tự động làm mới" : "Đã tắt tự động làm mới"); };
$("#refreshBtn").onclick = refreshDashboard;
$("#settingsRefreshBtn").onclick = refreshDashboard;
$("#switchAccountBtn").onclick = () => endStaffSession({ switchAccount: true });
$("#settingsSwitchAccountBtn").onclick = () => endStaffSession({ switchAccount: true });
$("#logoutBtn").onclick = () => endStaffSession();
$("#settingsLogoutBtn").onclick = () => endStaffSession();
$("#manageStaffAccountsBtn").onclick = () => { $("#settingsDialog").close(); switchTab("staff"); };
document.addEventListener("click", (event) => { if (!(event.target instanceof Element) || !event.target.closest(".header-account-menu-wrap")) setAccountMenuOpen(false); });
document.addEventListener("keydown", (event) => { if (event.key === "Escape") setAccountMenuOpen(false); });
$("#search").oninput = renderTickets; $("#statusFilter").onchange = renderTickets; $("#priorityFilter").onchange = renderTickets; $("#categoryFilter").onchange = renderTickets;
$("#resetFiltersBtn").onclick = () => { $("#search").value = ""; $("#statusFilter").value = ""; $("#priorityFilter").value = ""; $("#categoryFilter").value = ""; renderTickets(); };
$$(".tab").forEach((tab) => { tab.onclick = () => switchTab(tab.dataset.tab); });
$("#sidebarToggle").onclick = () => setSidebarCompact(!$("#appView").classList.contains("sidebar-compact"));
window.addEventListener("resize", () => keepActiveMobileTabVisible());
$("#reportDays").onchange = async () => { try { const result = await api(`/api/admin/operations?days=${encodeURIComponent($("#reportDays").value)}`); state.report = result.report; renderOperations(); } catch (error) { toast(error.message); } };
$("#exportReportBtn").onclick = async () => {
  try {
    const response = await fetch(`/api/admin/reports/tickets.csv?days=${encodeURIComponent($("#reportDays").value)}`, { headers: { Authorization: `Bearer ${state.token}`, "ngrok-skip-browser-warning": "1" } });
    if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || "Không thể xuất báo cáo"); }
    const href = URL.createObjectURL(await response.blob()); const anchor = document.createElement("a"); anchor.href = href; anchor.download = `helpdesk-report-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); setTimeout(() => URL.revokeObjectURL(href), 30000);
  } catch (error) { toast(error.message); }
};
$("#newStaffBtn").onclick = () => openStaffEditor();
$("#newInviteBtn").onclick = openInviteDialog;
$$('[data-close-invite]').forEach((button) => { button.onclick = () => $("#inviteDialog").close(); });
$("#inviteForm").onsubmit = async (event) => {
  event.preventDefault();
  const button = $("#inviteSaveBtn"); const errorBox = $("#inviteFormError");
  errorBox.classList.add("hidden"); errorBox.textContent = "";
  ["#inviteEmployeeCode", "#inviteDisplayName", "#inviteDepartment"].forEach((selector) => $(selector).removeAttribute("aria-invalid"));
  button.disabled = true; button.textContent = "Đang tạo…";
  try {
    const result = await api("/api/admin/user-invites", { method: "POST", body: JSON.stringify({ employeeCode: $("#inviteEmployeeCode").value, displayName: $("#inviteDisplayName").value, department: $("#inviteDepartment").value, validHours: Number($("#inviteValidHours").value) }) });
    $("#inviteResultCode").textContent = result.code;
    $("#inviteResultMeta").textContent = `${result.invite.displayName} · ${result.invite.employeeCode} · hết hạn ${formatDate(result.invite.expiresAt)}`;
    $("#inviteFormFields").classList.add("hidden"); $("#inviteResult").classList.remove("hidden"); button.classList.add("hidden");
    await refreshUserAccess();
  } catch (error) {
    errorBox.textContent = error.message; errorBox.classList.remove("hidden");
    const fieldIds = { employeeCode: "inviteEmployeeCode", displayName: "inviteDisplayName", department: "inviteDepartment" };
    const field = document.getElementById(fieldIds[error.field]);
    if (field) { field.setAttribute("aria-invalid", "true"); field.focus(); }
  } finally { button.disabled = false; button.textContent = "Tạo mã một lần"; }
};
$("#copyInviteBtn").onclick = async () => {
  const code = $("#inviteResultCode").textContent;
  try { await navigator.clipboard.writeText(code); toast("Đã sao chép mã mời"); }
  catch { window.prompt("Sao chép mã mời:", code); }
};
$$('[data-close-staff]').forEach((button) => { button.onclick = () => $("#staffDialog").close(); });
$("#staffDialog").oncancel = (event) => { if ($("#staffSaveBtn").disabled) event.preventDefault(); };
$("#staffActive").onchange = () => { clearStaffFormError(); updateStaffActivePresentation(); };
["#staffAccountUsername", "#staffDisplayName", "#staffPassword"].forEach((selector) => { $(selector).oninput = clearStaffFormError; });
$("#staffRole").onchange = clearStaffFormError;
$("#staffForm").onsubmit = async (event) => {
  event.preventDefault(); clearStaffFormError();
  const staffId = $("#staffId").value; const button = $("#staffSaveBtn"); const originalLabel = button.textContent;
  const payload = buildStaffAccountPayload({ username: $("#staffAccountUsername").value, displayName: $("#staffDisplayName").value, role: $("#staffRole").value, active: $("#staffActive").checked, password: $("#staffPassword").value });
  $$('[data-close-staff]').forEach((control) => { control.disabled = true; }); button.disabled = true; button.textContent = "Đang lưu…";
  try {
    await api(staffId ? `/api/admin/staff/${staffId}` : "/api/admin/staff", { method: staffId ? "PATCH" : "POST", body: JSON.stringify(payload) });
    $("#staffDialog").close(); toast(staffId ? "Đã cập nhật tài khoản" : "Đã tạo tài khoản nhân sự");
    try { await load(); } catch (refreshError) { toast(`Đã lưu nhưng chưa thể làm mới danh sách: ${refreshError.message}`); }
  } catch (error) { showStaffFormError(error); }
  finally { $$('[data-close-staff]').forEach((control) => { control.disabled = false; }); button.disabled = false; button.textContent = originalLabel; }
};
$("#newKbBtn").onclick = () => editKb(); $$("[data-close-kb]").forEach((button) => { button.onclick = () => $("#kbDialog").close(); });
$("#kbForm").onsubmit = async (event) => { event.preventDefault(); const entryId = $("#kbId").value; const payload = { title: $("#kbTitle").value, category: $("#kbCategory").value, risk: $("#kbRisk").value, keywords: $("#kbKeywords").value.split(",").map((item) => item.trim()).filter(Boolean), summary: $("#kbSummary").value, steps: $("#kbSteps").value.split("\n").map((item) => item.trim()).filter(Boolean), autoEligible: $("#kbAuto").checked, active: $("#kbActive").checked }; try { await api(entryId ? `/api/admin/knowledge-base/${entryId}` : "/api/admin/knowledge-base", { method: entryId ? "PATCH" : "POST", body: JSON.stringify(payload) }); $("#kbDialog").close(); toast("Đã lưu Knowledge Base"); await load(); } catch (error) { toast(error.message); } };

$("#refreshPlaybookBtn").onclick = async () => { try { const result = await api("/api/admin/playbook/status?force=1"); state.playbook = result.playbook; renderPlaybook(); toast(state.playbook.ready ? "Playbook đã sẵn sàng" : "Playbook chưa sẵn sàng"); } catch (error) { toast(error.message); } };
$("#reindexPlaybookBtn").onclick = async () => { const button = $("#reindexPlaybookBtn"); button.disabled = true; button.textContent = "Đang cập nhật…"; try { const result = await api("/api/admin/playbook/reindex", { method: "POST", body: JSON.stringify({}) }); state.playbook = result.playbook; renderPlaybook(); toast(`Đã index ${result.index.entries} procedure`); } catch (error) { toast(error.message); } finally { button.disabled = false; button.textContent = "Cập nhật semantic index"; } };
$("#playbookSearchForm").onsubmit = async (event) => { event.preventDefault(); const q = $("#playbookSearchPrompt").value.trim(); if (!q) return; $("#playbookSearchResult").innerHTML = '<div class="empty-state compact-empty"><span>↻</span><h3>Đang tra cứu…</h3><p>Semantic search đang đối chiếu procedure.</p></div>'; try { const result = await api(`/api/admin/playbook/search?q=${encodeURIComponent(q)}&audience=${encodeURIComponent($("#playbookAudience").value)}`); renderPlaybookMatches(result.entries || []); } catch (error) { $("#playbookSearchResult").innerHTML = `<div class="agent-error">${esc(error.message)}</div>`; } };


$("#governanceSearch").oninput = renderGovernance; $("#governanceStatus").onchange = renderGovernance; $("#governanceLifecycle").onchange = renderGovernance;
$("#refreshGovernanceBtn").onclick = async () => { try { await refreshGovernance(); toast("Đã làm mới vòng đời Playbook"); } catch (error) { toast(error.message); } };
$("#newPlaybookDraftBtn").onclick = () => openPlaybookEditor();
$("#seedPlaybookBtn").onclick = async () => { if (!confirm("Nhập 173 procedure baseline vào kho Playbook Governance? Procedure đã tồn tại sẽ được bỏ qua.")) return; try { const result = await api("/api/admin/playbook/governance/seed", { method: "POST", body: JSON.stringify({}) }); toast(`Đã nhập ${result.result.inserted}; bỏ qua ${result.result.skipped}`); await refreshGovernance(); } catch (error) { toast(error.message); } };
$$('[data-close-playbook-editor]').forEach((button) => { button.onclick = () => $("#playbookEditorDialog").close(); });
$("#playbookEditorForm").onsubmit = async (event) => { event.preventDefault(); const procedureId = $("#pbProcedureId").value; const versionId = $("#pbVersionId").value; const payload = playbookPayloadFromForm(); try { let result; if (!procedureId) result = await api("/api/staff/playbook/drafts", { method: "POST", body: JSON.stringify(payload) }); else if (versionId) result = await api(`/api/staff/playbook/versions/${versionId}`, { method: "PATCH", body: JSON.stringify(payload) }); else throw new Error("Không xác định được phiên bản cần lưu"); toast("Đã lưu bản nháp"); await refreshGovernance(); await openPlaybookEditor(result.procedure.id); } catch (error) { toast(error.message); } };
$("#pbSubmitBtn").onclick = async () => { const versionId = $("#pbVersionId").value; if (!versionId) return; if (!confirm("Gửi phiên bản này cho quản trị viên duyệt?")) return; try { const result = await api(`/api/staff/playbook/versions/${versionId}/submit`, { method: "POST", body: JSON.stringify({}) }); toast("Đã gửi duyệt. AI chưa sử dụng phiên bản này."); await refreshGovernance(); await openPlaybookEditor(result.procedure.id, versionId); } catch (error) { toast(error.message); } };
$("#pbPublishBtn").onclick = async () => { const versionId = $("#pbVersionId").value; if (!versionId) return; const reviewNote = prompt("Ghi chú phê duyệt (khuyến nghị ghi phạm vi đã kiểm tra):", "Đã kiểm tra nội dung, phân quyền và điều kiện an toàn") ?? null; if (reviewNote === null) return; try { const result = await api(`/api/admin/playbook/versions/${versionId}/publish`, { method: "POST", body: JSON.stringify({ reviewNote }) }); toast(result.indexQueued ? "Đã publish; AI đang tự động cập nhật semantic index" : "Đã publish"); await refreshGovernance(); await load(); await openPlaybookEditor(result.procedure.id, versionId); } catch (error) { toast(error.message); } };
$("#pbRejectBtn").onclick = async () => { const versionId = $("#pbVersionId").value; if (!versionId) return; const reviewNote = prompt("Lý do từ chối (bắt buộc):", ""); if (!reviewNote?.trim()) return; try { const result = await api(`/api/admin/playbook/versions/${versionId}/reject`, { method: "POST", body: JSON.stringify({ reviewNote }) }); toast("Đã trả lại bản nháp cho kỹ thuật viên"); await refreshGovernance(); await openPlaybookEditor(result.procedure.id, versionId); } catch (error) { toast(error.message); } };
function enforcePlaybookSafetyUi() { const blocked = $("#pbRisk").value === "high" || $("#pbAudience").value === "technician"; if (blocked) $("#pbAutoEligible").checked = false; $("#pbAutoEligible").disabled = blocked || $("#pbSummary").disabled; }
$("#pbRisk").onchange = enforcePlaybookSafetyUi; $("#pbAudience").onchange = enforcePlaybookSafetyUi;

async function refreshAiControlPlane({ force = false } = {}) {
  const days = encodeURIComponent($("#aiQualityDays").value || 30);
  const [status, quality] = await Promise.all([
    api(`/api/admin/agent/status${force ? "?force=1" : ""}`),
    api(`/api/admin/ai-quality?days=${days}`),
  ]);
  state.agent = status.agent || {}; state.aiQuality = quality.report || {};
  renderAgent(); renderAiQuality();
}
$("#refreshAgentBtn").onclick = async () => { try { await refreshAiControlPlane({ force: true }); toast(state.agent.ready ? "AI Control Plane đã sẵn sàng" : "AI provider chưa sẵn sàng; handoff an toàn vẫn hoạt động"); } catch (error) { toast(error.message); } };
$("#aiQualityDays").onchange = async () => { try { await refreshAiControlPlane(); } catch (error) { toast(error.message); } };
$("#agentTestForm").onsubmit = async (event) => { event.preventDefault(); const prompt = $("#agentTestPrompt").value.trim(); if (!prompt) return; const button = $("#agentTestForm button"); button.disabled = true; button.textContent = "AI đang phân tích…"; $("#agentTestResult").textContent = "Đang đối chiếu Enterprise Playbook và chính sách an toàn…"; try { const result = await api("/api/admin/agent/test", { method: "POST", body: JSON.stringify({ prompt }) }); const a = result.analysis || {}; $("#agentTestResult").textContent = `${a.canAutoHandle ? "✓ HƯỚNG DẪN THEO PLAYBOOK" : "↗ ESCALATE NGAY"}\n\n${result.reply}\n\n────────────────────────────────\nsource: ${a.source || "—"}\nmodel: ${a.model || "rules"}\nconfidence: ${Math.round((a.confidence || 0) * 100)}%\nlatency: ${a.latencyMs || 0} ms\nescalation: ${a.escalationCode || "none"}\nplaybook: ${(a.playbookIds || []).join(", ") || "none"}`; } catch (error) { $("#agentTestResult").textContent = `Lỗi: ${error.message}`; } finally { button.disabled = false; button.textContent = "✦ Phân tích bằng AI Agent"; } };

setSidebarCompact(savedSidebarPreference(), { persist: false });
show(); switchTab("tickets");
if (state.token) load().catch(() => { state.token = ""; sessionStorage.removeItem("hd_admin"); show(); });
setInterval(() => { if (state.token && state.autoRefreshEnabled && !$("#ticketDialog").open && !$("#settingsDialog").open) load().catch(() => undefined); }, 30000);
