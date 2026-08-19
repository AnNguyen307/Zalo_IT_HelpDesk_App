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

export function issueSession(payload) {
  const now = Math.floor(Date.now() / 1000);
  const body = {
    ...payload,
    iat: now,
    exp: now + config.sessionTtlHours * 3600,
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

async function verifyZaloDirectly(accessToken, claimedIdentity = {}) {
  if (!accessToken) throw Object.assign(new Error("Missing Zalo access token"), { status: 400 });
  if (!config.zaloAppSecret) throw Object.assign(new Error("ZALO_APP_SECRET is required in direct Zalo mode"), { status: 503 });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.zaloVerifyTimeoutMs);
  try {
    const response = await fetch(config.zaloProfileUrl, {
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
