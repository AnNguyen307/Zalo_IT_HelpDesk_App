import crypto from "node:crypto";
import { promisify } from "node:util";
import { appError } from "./errors.mjs";
import { id, nowIso, safeEqual } from "./utils.mjs";

const scryptAsync = promisify(crypto.scrypt);
export const STAFF_ROLES = Object.freeze(["admin", "technician", "viewer"]);

export function normalizeUsername(value = "") {
  return String(value).trim().toLowerCase().replace(/\s+/g, ".").replace(/[^a-z0-9._-]/g, "").slice(0, 80);
}

export function validateStaffPassword(password) {
  const value = String(password || "");
  if (value.length < 10 || value.length > 200) {
    throw appError("Mật khẩu phải có 10–200 ký tự", { code: "STAFF_PASSWORD_LENGTH", field: "password" });
  }
  if (!/[a-zA-Z]/.test(value) || !/\d/.test(value)) {
    throw appError("Mật khẩu phải có cả chữ và số", { code: "STAFF_PASSWORD_COMPLEXITY", field: "password" });
  }
  return value;
}

export function normalizeStaffActive(value, defaultValue = true) {
  if (value === undefined) return defaultValue;
  if (typeof value !== "boolean") {
    throw appError("Trạng thái tài khoản không hợp lệ", { code: "STAFF_ACTIVE_INVALID", field: "active" });
  }
  return value;
}

export function ensureUniqueStaffUsername(accounts = [], value = "", excludeId = "") {
  const username = normalizeUsername(value);
  if (accounts.some((item) => item.id !== excludeId && normalizeUsername(item.username) === username)) {
    throw appError("Tên đăng nhập đã tồn tại", { status: 409, code: "STAFF_USERNAME_EXISTS", field: "username" });
  }
  return username;
}

export async function hashStaffPassword(password, salt = crypto.randomBytes(16)) {
  const value = validateStaffPassword(password);
  const derived = await scryptAsync(value, salt, 64);
  return `scrypt$${Buffer.from(salt).toString("base64url")}$${Buffer.from(derived).toString("base64url")}`;
}

export async function verifyStaffPassword(password, encoded = "") {
  const [algorithm, saltValue, hashValue] = String(encoded).split("$");
  if (algorithm !== "scrypt" || !saltValue || !hashValue) return false;
  try {
    const salt = Buffer.from(saltValue, "base64url");
    const expected = Buffer.from(hashValue, "base64url");
    const actual = Buffer.from(await scryptAsync(String(password || ""), salt, expected.length));
    return safeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function publicStaffAccount(account) {
  if (!account) return null;
  return {
    id: account.id,
    username: account.username,
    displayName: account.displayName,
    role: account.role,
    active: account.active !== false,
    lastLoginAt: account.lastLoginAt || null,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

export async function createStaffAccountRecord(input, actorId = "admin") {
  const username = normalizeUsername(input.username);
  const displayName = String(input.displayName || "").trim().slice(0, 120);
  const role = input.role === undefined ? "technician" : input.role;
  if (username.length < 3) throw appError("Tên đăng nhập phải có ít nhất 3 ký tự", { code: "STAFF_USERNAME_LENGTH", field: "username" });
  if (displayName.length < 2) throw appError("Tên hiển thị phải có ít nhất 2 ký tự", { code: "STAFF_DISPLAY_NAME_LENGTH", field: "displayName" });
  if (!STAFF_ROLES.includes(role)) throw appError("Vai trò nhân sự không hợp lệ", { code: "STAFF_ROLE_INVALID", field: "role" });
  const at = nowIso();
  return {
    id: id("stf"),
    username,
    displayName,
    role,
    passwordHash: await hashStaffPassword(input.password),
    active: normalizeStaffActive(input.active),
    sessionVersion: 1,
    lastLoginAt: null,
    createdBy: actorId,
    createdAt: at,
    updatedAt: at,
  };
}

export function activeAdminCount(accounts = []) {
  return accounts.filter((item) => item.active !== false && item.role === "admin").length;
}

export function validateStaffAccountTransition(accounts, account, { actorId, nextRole, nextActive }) {
  if (account.id === actorId && (!nextActive || nextRole !== "admin")) {
    throw appError("Không thể tự khóa hoặc hạ quyền tài khoản đang đăng nhập", { status: 409, code: "STAFF_SELF_LOCK_FORBIDDEN", field: !nextActive ? "active" : "role" });
  }
  if (account.role === "admin" && account.active !== false && (!nextActive || nextRole !== "admin") && activeAdminCount(accounts) <= 1) {
    throw appError("Hệ thống phải còn ít nhất một tài khoản Admin hoạt động", { status: 409, code: "STAFF_LAST_ACTIVE_ADMIN", field: !nextActive ? "active" : "role" });
  }
}
