import crypto from "node:crypto";
import { config } from "./config.mjs";
import { readDb, updateDb } from "./store.mjs";
import { normalizeUsername, publicStaffAccount, STAFF_ROLES, verifyStaffPassword } from "./staff-accounts.mjs";
import { id, nowIso, safeEqual } from "./utils.mjs";

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function sign(value) {
  return crypto.createHmac("sha256", config.appSecret).update(value).digest("base64url");
}

export function issueSession(payload, { ttlSeconds = config.sessionTtlHours * 3600 } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const body = {
    ...payload,
    iat: now,
    exp: now + ttlSeconds,
  };
  const encoded = base64url(JSON.stringify(body));
  return `${encoded}.${sign(encoded)}`;
}

export function verifySession(token) {
  if (!token || !token.includes(".")) return null;
  const [encoded, signature] = token.split(".");
  if (!safeEqual(signature, sign(encoded))) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function bearerToken(req) {
  const value = req.headers.authorization || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

export async function requireAuth(req, { admin = false, staff = false, roles = [] } = {}) {
  const session = verifySession(bearerToken(req));
  const allowedRoles = new Set(roles);
  if (admin) allowedRoles.add("admin");
  if (staff) { allowedRoles.add("admin"); allowedRoles.add("technician"); allowedRoles.add("viewer"); }
  const roleDenied = allowedRoles.size > 0 && (!session || !allowedRoles.has(session.role));
  if (!session || roleDenied) {
    const label = admin ? "Admin authentication required" : staff ? "Staff authentication required" : "Authentication required";
    const error = new Error(label);
    error.status = session ? 403 : 401;
    throw error;
  }
  if (session.sub?.startsWith("stf_")) {
    const db = await readDb();
    const account = db.staffAccounts.find((item) => item.id === session.sub);
    if (!account || account.active === false || account.role !== session.role || Number(account.sessionVersion || 1) !== Number(session.sv || 1)) {
      throw Object.assign(new Error("Phiên đăng nhập nhân sự không còn hiệu lực"), { status: 401 });
    }
  }
  if (session.am === "invite") {
    const db = await readDb();
    const refreshSession = db.userRefreshSessions.find((item) => item.id === session.sid && item.userId === session.sub);
    if (!refreshSession || refreshSession.revokedAt || Date.parse(refreshSession.expiresAt) <= Date.now()) {
      throw Object.assign(new Error("Phiên đăng nhập đã hết hiệu lực"), { status: 401, code: "USER_SESSION_INVALID" });
    }
  }
  return session;
}

async function verifyZaloRemotely(accessToken, claimedIdentity) {
  if (!config.zaloTokenVerifyUrl) {
    throw Object.assign(new Error("ZALO_TOKEN_VERIFY_URL is required in remote mode"), { status: 503 });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.zaloVerifyTimeoutMs);
  try {
    const response = await fetch(config.zaloTokenVerifyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken, claimedIdentity }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.valid || !payload.userId) {
      throw Object.assign(new Error(payload.message || "Zalo token verification failed"), { status: 401 });
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

export function buildZaloAppSecretProof(accessToken, appSecret = config.zaloAppSecret) {
  if (!accessToken || !appSecret) throw Object.assign(new Error("Zalo access token and app secret are required"), { status: 503 });
  return crypto.createHmac("sha256", appSecret).update(accessToken).digest("hex");
}

export function buildZaloProfileUrl(profileUrl = config.zaloProfileUrl) {
  const url = new URL(profileUrl);
  if (!url.searchParams.has("fields")) url.searchParams.set("fields", "id,name,picture");
  return url;
}

async function verifyZaloDirectly(accessToken, claimedIdentity = {}) {
  if (!accessToken) throw Object.assign(new Error("Missing Zalo access token"), { status: 400 });
  if (!config.zaloAppSecret) throw Object.assign(new Error("ZALO_APP_SECRET is required in direct Zalo mode"), { status: 503 });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.zaloVerifyTimeoutMs);
  try {
    const response = await fetch(buildZaloProfileUrl(), {
      method: "GET",
      headers: {
        access_token: accessToken,
        appsecret_proof: buildZaloAppSecretProof(accessToken),
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    const providerError = Number(payload.error || 0);
    if (!response.ok || providerError !== 0 || !payload.id) {
      console.warn(`[ZALO_AUTH] Profile verification rejected: http=${response.status}; provider_error=${Number.isFinite(providerError) ? providerError : "unknown"}; has_id=${Boolean(payload.id)}`);
      throw Object.assign(new Error("Zalo token verification failed"), { status: 401 });
    }
    const userId = String(payload.id);
    if (claimedIdentity.userId && String(claimedIdentity.userId) !== userId) {
      throw Object.assign(new Error("Zalo identity does not match the access token"), { status: 401 });
    }
    return {
      userId,
      name: String(payload.name || claimedIdentity.name || "Người dùng Zalo"),
      avatar: String(payload.picture?.data?.url || claimedIdentity.avatar || ""),
    };
  } catch (error) {
    if (error?.name === "AbortError") throw Object.assign(new Error("Zalo token verification timed out"), { status: 503 });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function loginWithZalo({ accessToken, userId, name, avatar, phone, department }) {
  let identity = { userId, name, avatar };
  if (config.zaloAuthMode === "zalo") {
    identity = await verifyZaloDirectly(accessToken, identity);
  } else if (config.zaloAuthMode === "remote") {
    identity = await verifyZaloRemotely(accessToken, identity);
  } else if (!userId) {
    throw Object.assign(new Error("Missing Zalo user ID"), { status: 400 });
  }

  const user = await updateDb((db) => {
    let existing = db.users.find((item) => item.zaloUserId === identity.userId);
    if (!existing) {
      existing = {
        id: id("usr"),
        zaloUserId: identity.userId,
        name: identity.name || name || "Người dùng Zalo",
        avatar: identity.avatar || avatar || "",
        phone: phone || "",
        department: department || "",
        role: "user",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      db.users.push(existing);
    } else {
      existing.name = identity.name || name || existing.name;
      existing.avatar = identity.avatar || avatar || existing.avatar;
      existing.phone = phone ?? existing.phone;
      existing.department = department ?? existing.department;
      existing.updatedAt = nowIso();
    }
    return existing;
  });

  return { user, token: issueSession({ sub: user.id, role: user.role, name: user.name }) };
}

const INVITE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function accessError(message, { status = 400, code = "BAD_REQUEST", field = null } = {}) {
  const error = Object.assign(new Error(message), { status, code });
  if (field) error.field = field;
  return error;
}

function normalizeEmployeeCode(value) {
  return String(value || "").trim().toUpperCase();
}

export function normalizeInviteCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function opaqueHash(kind, value) {
  return crypto.createHmac("sha256", config.appSecret).update(`${kind}:${value}`).digest("hex");
}

function newInviteCode() {
  const bytes = crypto.randomBytes(12);
  const compact = [...bytes].map((value) => INVITE_ALPHABET[value % INVITE_ALPHABET.length]).join("");
  return compact.match(/.{1,4}/g).join("-");
}

function validateDeviceId(value) {
  const deviceId = String(value || "").trim();
  if (deviceId.length < 16 || deviceId.length > 200) {
    throw accessError("Thiết bị chưa sẵn sàng; hãy đóng và mở lại Mini App", { code: "DEVICE_ID_INVALID", field: "deviceId" });
  }
  return deviceId;
}

function refreshTokenParts(value) {
  const token = String(value || "").trim();
  const separator = token.indexOf(".");
  if (separator <= 0) return null;
  const sessionId = token.slice(0, separator);
  const secret = token.slice(separator + 1);
  return sessionId.startsWith("urs_") && secret.length >= 32 ? { sessionId, secret } : null;
}

function newRefreshCredential(sessionId) {
  const secret = crypto.randomBytes(32).toString("base64url");
  return { token: `${sessionId}.${secret}`, tokenHash: opaqueHash("refresh", secret) };
}

function issueInviteAccessToken(user, refreshSession) {
  return issueSession({
    sub: user.id,
    role: user.role,
    name: user.name,
    am: "invite",
    sid: refreshSession.id,
  }, { ttlSeconds: config.userAccessTtlMinutes * 60 });
}

function pruneUserAccessRecords(db) {
  const now = Date.now();
  const cutoff = now - 90 * 86400_000;
  db.userInvites = db.userInvites.filter((item) => {
    const inactiveAt = item.usedAt || item.revokedAt || (Date.parse(item.expiresAt) <= now ? item.expiresAt : null);
    return !inactiveAt || Date.parse(inactiveAt) > cutoff;
  });
  db.userRefreshSessions = db.userRefreshSessions.filter((item) => {
    const inactiveAt = item.revokedAt || (Date.parse(item.expiresAt) <= now ? item.expiresAt : null);
    return !inactiveAt || Date.parse(inactiveAt) > cutoff;
  });
  for (const key of ["userInvites", "userRefreshSessions"]) {
    if (db[key].length <= 500) continue;
    const inactive = db[key].filter((item) => item.revokedAt || item.usedAt || Date.parse(item.expiresAt) <= now).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    const removeIds = new Set(inactive.slice(0, db[key].length - 500).map((item) => item.id));
    db[key] = db[key].filter((item) => !removeIds.has(item.id));
  }
}

function publicInvite(invite) {
  const now = Date.now();
  const status = invite.revokedAt ? "revoked"
    : invite.usedAt ? "used"
      : Date.parse(invite.expiresAt) <= now ? "expired" : "active";
  return {
    id: invite.id,
    employeeCode: invite.employeeCode,
    displayName: invite.displayName,
    department: invite.department || "",
    status,
    createdAt: invite.createdAt,
    expiresAt: invite.expiresAt,
    usedAt: invite.usedAt || null,
    usedByUserId: invite.usedByUserId || null,
    revokedAt: invite.revokedAt || null,
  };
}

export async function createUserInvite({ employeeCode, displayName, department = "", validHours } = {}, actorId = "admin") {
  const normalizedEmployeeCode = normalizeEmployeeCode(employeeCode);
  const normalizedName = String(displayName || "").trim().slice(0, 120);
  const normalizedDepartment = String(department || "").trim().slice(0, 120);
  if (!/^[A-Z0-9._-]{2,40}$/.test(normalizedEmployeeCode)) {
    throw accessError("Mã nhân viên gồm 2–40 ký tự chữ, số, dấu chấm, gạch ngang hoặc gạch dưới", { code: "EMPLOYEE_CODE_INVALID", field: "employeeCode" });
  }
  if (normalizedName.length < 2) {
    throw accessError("Tên nhân viên phải có ít nhất 2 ký tự", { code: "DISPLAY_NAME_INVALID", field: "displayName" });
  }
  const ttlHours = Math.min(168, Math.max(1, Number(validHours) || config.userInviteTtlHours));
  const code = newInviteCode();
  const at = nowIso();
  const invite = {
    id: id("uin"),
    employeeCode: normalizedEmployeeCode,
    displayName: normalizedName,
    department: normalizedDepartment,
    codeHash: opaqueHash("invite", normalizeInviteCode(code)),
    createdBy: actorId,
    createdAt: at,
    expiresAt: new Date(Date.now() + ttlHours * 3600_000).toISOString(),
    usedAt: null,
    usedByUserId: null,
    revokedAt: null,
    revokedBy: null,
    revokeReason: "",
  };
  await updateDb((db) => {
    pruneUserAccessRecords(db);
    for (const existing of db.userInvites) {
      if (existing.employeeCode === normalizedEmployeeCode && !existing.usedAt && !existing.revokedAt && Date.parse(existing.expiresAt) > Date.now()) {
        existing.revokedAt = at;
        existing.revokedBy = actorId;
        existing.revokeReason = "replaced";
      }
    }
    db.userInvites.push(invite);
  });
  return { invite: publicInvite(invite), code };
}

export async function listUserAccess() {
  const db = await readDb();
  const now = Date.now();
  const invites = db.userInvites.map(publicInvite).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const users = db.users
    .filter((user) => String(user.zaloUserId || "").startsWith("invite:"))
    .map((user) => ({
      id: user.id,
      employeeCode: String(user.zaloUserId).slice("invite:".length).toUpperCase(),
      name: user.name,
      department: user.department || "",
      activeSessions: db.userRefreshSessions.filter((item) => item.userId === user.id && !item.revokedAt && Date.parse(item.expiresAt) > now).length,
      lastSeenAt: db.userRefreshSessions.filter((item) => item.userId === user.id).map((item) => item.lastRefreshedAt || item.createdAt).sort().at(-1) || null,
      createdAt: user.createdAt,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "vi"));
  return { invites, users };
}

export async function redeemUserInvite({ code, deviceId } = {}) {
  const normalizedCode = normalizeInviteCode(code);
  const normalizedDeviceId = validateDeviceId(deviceId);
  if (normalizedCode.length !== 12) {
    throw accessError("Mã mời không hợp lệ hoặc đã hết hạn", { status: 401, code: "INVITE_INVALID", field: "code" });
  }
  const inviteHash = opaqueHash("invite", normalizedCode);
  const sessionId = id("urs");
  const credential = newRefreshCredential(sessionId);
  const at = nowIso();
  const result = await updateDb((db) => {
    pruneUserAccessRecords(db);
    const invite = db.userInvites.find((item) => safeEqual(item.codeHash || "", inviteHash));
    if (!invite || invite.usedAt || invite.revokedAt || Date.parse(invite.expiresAt) <= Date.now()) {
      throw accessError("Mã mời không hợp lệ hoặc đã hết hạn", { status: 401, code: "INVITE_INVALID", field: "code" });
    }
    const inviteIdentity = `invite:${invite.employeeCode.toLowerCase()}`;
    let user = db.users.find((item) => item.zaloUserId === inviteIdentity);
    if (!user) {
      user = {
        id: id("usr"),
        zaloUserId: inviteIdentity,
        name: invite.displayName,
        avatar: "",
        phone: "",
        department: invite.department || "",
        role: "user",
        createdAt: at,
        updatedAt: at,
      };
      db.users.push(user);
    } else {
      user.name = invite.displayName;
      user.department = invite.department || user.department || "";
      user.updatedAt = at;
    }
    const refreshSession = {
      id: sessionId,
      userId: user.id,
      deviceHash: opaqueHash("device", normalizedDeviceId),
      tokenHash: credential.tokenHash,
      expiresAt: new Date(Date.now() + config.userRefreshTtlDays * 86400_000).toISOString(),
      createdAt: at,
      lastRefreshedAt: at,
      revokedAt: null,
      revokedBy: null,
      revokeReason: "",
    };
    db.userRefreshSessions.push(refreshSession);
    invite.usedAt = at;
    invite.usedByUserId = user.id;
    return { user, refreshSession };
  });
  return {
    user: result.user,
    token: issueInviteAccessToken(result.user, result.refreshSession),
    refreshToken: credential.token,
    refreshExpiresAt: result.refreshSession.expiresAt,
  };
}

export async function refreshUserAccess({ refreshToken, deviceId } = {}) {
  const parts = refreshTokenParts(refreshToken);
  const normalizedDeviceId = validateDeviceId(deviceId);
  if (!parts) throw accessError("Phiên đăng nhập đã hết hiệu lực", { status: 401, code: "USER_SESSION_INVALID" });
  const nextCredential = newRefreshCredential(parts.sessionId);
  const at = nowIso();
  const outcome = await updateDb((db) => {
    pruneUserAccessRecords(db);
    const refreshSession = db.userRefreshSessions.find((item) => item.id === parts.sessionId);
    if (!refreshSession || refreshSession.revokedAt || Date.parse(refreshSession.expiresAt) <= Date.now()) return { invalid: true };
    const deviceMatches = safeEqual(refreshSession.deviceHash || "", opaqueHash("device", normalizedDeviceId));
    const tokenMatches = safeEqual(refreshSession.tokenHash || "", opaqueHash("refresh", parts.secret));
    if (!deviceMatches || !tokenMatches) {
      refreshSession.revokedAt = at;
      refreshSession.revokedBy = "security";
      refreshSession.revokeReason = deviceMatches ? "refresh_token_reuse" : "device_mismatch";
      return { invalid: true };
    }
    const user = db.users.find((item) => item.id === refreshSession.userId);
    if (!user) {
      refreshSession.revokedAt = at;
      refreshSession.revokedBy = "security";
      refreshSession.revokeReason = "user_missing";
      return { invalid: true };
    }
    refreshSession.tokenHash = nextCredential.tokenHash;
    refreshSession.lastRefreshedAt = at;
    refreshSession.expiresAt = new Date(Date.now() + config.userRefreshTtlDays * 86400_000).toISOString();
    return { user, refreshSession };
  });
  if (outcome.invalid) throw accessError("Phiên đăng nhập đã hết hiệu lực", { status: 401, code: "USER_SESSION_INVALID" });
  return {
    user: outcome.user,
    token: issueInviteAccessToken(outcome.user, outcome.refreshSession),
    refreshToken: nextCredential.token,
    refreshExpiresAt: outcome.refreshSession.expiresAt,
  };
}

export async function logoutUserAccess({ refreshToken, deviceId } = {}) {
  const parts = refreshTokenParts(refreshToken);
  if (!parts) return { ok: true };
  const normalizedDeviceId = validateDeviceId(deviceId);
  await updateDb((db) => {
    const refreshSession = db.userRefreshSessions.find((item) => item.id === parts.sessionId);
    if (!refreshSession || refreshSession.revokedAt) return;
    if (!safeEqual(refreshSession.deviceHash || "", opaqueHash("device", normalizedDeviceId))) return;
    if (!safeEqual(refreshSession.tokenHash || "", opaqueHash("refresh", parts.secret))) return;
    refreshSession.revokedAt = nowIso();
    refreshSession.revokedBy = refreshSession.userId;
    refreshSession.revokeReason = "logout";
  });
  return { ok: true };
}

export async function revokeUserInvite(inviteId, actorId) {
  return updateDb((db) => {
    const invite = db.userInvites.find((item) => item.id === inviteId);
    if (!invite) throw accessError("Không tìm thấy mã mời", { status: 404, code: "INVITE_NOT_FOUND" });
    if (!invite.usedAt && !invite.revokedAt) {
      invite.revokedAt = nowIso();
      invite.revokedBy = actorId;
      invite.revokeReason = "admin_revoked";
    }
    return publicInvite(invite);
  });
}

export async function revokeUserSessions(userId, actorId) {
  return updateDb((db) => {
    const user = db.users.find((item) => item.id === userId && String(item.zaloUserId || "").startsWith("invite:"));
    if (!user) throw accessError("Không tìm thấy người dùng Mini App", { status: 404, code: "USER_NOT_FOUND" });
    const at = nowIso();
    let revoked = 0;
    for (const refreshSession of db.userRefreshSessions) {
      if (refreshSession.userId === userId && !refreshSession.revokedAt) {
        refreshSession.revokedAt = at;
        refreshSession.revokedBy = actorId;
        refreshSession.revokeReason = "admin_revoked";
        revoked += 1;
      }
    }
    return { userId, revoked };
  });
}

export async function loginAdmin(password) {
  return loginStaff({ username: "admin", password });
}

export async function loginStaff({ username = "", password = "", name = "" } = {}) {
  const normalized = normalizeUsername(username || name);
  if (config.legacyStaffLoginEnabled && normalized === "admin" && safeEqual(password || "", config.adminPassword)) {
    return {
      token: issueSession({ sub: "admin", role: "admin", name: "HelpDesk Admin" }),
      user: { id: "admin", username: "admin", role: "admin", name: "HelpDesk Admin", legacy: true },
    };
  }
  const db = await readDb();
  const account = db.staffAccounts.find((item) => item.username === normalized);
  if (account) {
    if (account.active === false || !await verifyStaffPassword(password, account.passwordHash)) {
      throw Object.assign(new Error("Tên đăng nhập hoặc mật khẩu không đúng"), { status: 401 });
    }
    const loginAt = nowIso();
    await updateDb((target) => {
      const current = target.staffAccounts.find((item) => item.id === account.id);
      if (current) { current.lastLoginAt = loginAt; current.updatedAt = loginAt; }
    });
    const user = { ...publicStaffAccount(account), name: account.displayName };
    return {
      token: issueSession({ sub: account.id, role: account.role, name: account.displayName, sv: Number(account.sessionVersion || 1) }),
      user,
    };
  }

  if (config.legacyStaffLoginEnabled && config.technicianPassword && safeEqual(password || "", config.technicianPassword)) {
    const displayName = String(name || username || "HelpDesk Technician").trim().slice(0, 120) || "HelpDesk Technician";
    const staffId = `technician:${crypto.createHash("sha256").update(displayName.toLowerCase()).digest("hex").slice(0, 12)}`;
    return {
      token: issueSession({ sub: staffId, role: "technician", name: displayName }),
      user: { id: staffId, role: "technician", name: displayName, legacy: true },
    };
  }
  throw Object.assign(new Error("Tên đăng nhập hoặc mật khẩu không đúng"), { status: 401 });
}

export async function sessionUser(session) {
  if (STAFF_ROLES.includes(session.role)) {
    if (!session.sub?.startsWith("stf_")) return { id: session.sub, role: session.role, name: session.name, legacy: true };
    const db = await readDb();
    const account = db.staffAccounts.find((item) => item.id === session.sub && item.active !== false);
    return account ? { ...publicStaffAccount(account), name: account.displayName } : null;
  }
  const db = await readDb();
  return db.users.find((user) => user.id === session.sub) || null;
}
