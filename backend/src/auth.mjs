import crypto from "node:crypto";
import { config } from "./config.mjs";
import { readDb, updateDb } from "./store.mjs";
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
  if (staff) { allowedRoles.add("admin"); allowedRoles.add("technician"); }
  const roleDenied = allowedRoles.size > 0 && (!session || !allowedRoles.has(session.role));
  if (!session || roleDenied) {
    const label = admin ? "Admin authentication required" : staff ? "Staff authentication required" : "Authentication required";
    const error = new Error(label);
    error.status = session ? 403 : 401;
    throw error;
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

export async function loginWithZalo({ accessToken, userId, name, avatar, phone, department }) {
  if (!userId) throw Object.assign(new Error("Missing Zalo user ID"), { status: 400 });

  let identity = { userId, name, avatar };
  if (config.zaloAuthMode === "remote") {
    identity = await verifyZaloRemotely(accessToken, identity);
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
  if (!safeEqual(password || "", config.adminPassword)) {
    throw Object.assign(new Error("Invalid admin password"), { status: 401 });
  }
  return {
    token: issueSession({ sub: "admin", role: "admin", name: "HelpDesk Admin" }),
    user: { id: "admin", role: "admin", name: "HelpDesk Admin" },
  };
}

export async function loginStaff(password, displayName = "") {
  if (safeEqual(password || "", config.adminPassword)) {
    return {
      token: issueSession({ sub: "admin", role: "admin", name: "HelpDesk Admin" }),
      user: { id: "admin", role: "admin", name: "HelpDesk Admin" },
    };
  }
  if (config.technicianPassword && safeEqual(password || "", config.technicianPassword)) {
    const name = String(displayName || "HelpDesk Technician").trim().slice(0, 120) || "HelpDesk Technician";
    const staffId = `technician:${crypto.createHash("sha256").update(name.toLowerCase()).digest("hex").slice(0, 12)}`;
    return {
      token: issueSession({ sub: staffId, role: "technician", name }),
      user: { id: staffId, role: "technician", name },
    };
  }
  throw Object.assign(new Error("Invalid staff password"), { status: 401 });
}

export async function sessionUser(session) {
  if (["admin", "technician"].includes(session.role)) return { id: session.sub, role: session.role, name: session.name };
  const db = await readDb();
  return db.users.find((user) => user.id === session.sub) || null;
}
