import crypto from "node:crypto";
import { promisify } from "node:util";
import { id, nowIso, safeEqual } from "./utils.mjs";

const scryptAsync = promisify(crypto.scrypt);
export const STAFF_ROLES = Object.freeze(["admin", "technician", "viewer"]);

export function normalizeUsername(value = "") {
  return String(value).trim().toLowerCase().replace(/\s+/g, ".").replace(/[^a-z0-9._-]/g, "").slice(0, 80);
}

export function validateStaffPassword(password) {
  const value = String(password || "");
  if (value.length < 10 || value.length > 200) {
    throw Object.assign(new Error("Mật khẩu phải có 10–200 ký tự"), { status: 400 });
  }
  if (!/[a-zA-Z]/.test(value) || !/\d/.test(value)) {
    throw Object.assign(new Error("Mật khẩu phải có cả chữ và số"), { status: 400 });
  }
  return value;
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
  const role = STAFF_ROLES.includes(input.role) ? input.role : "technician";
  if (username.length < 3) throw Object.assign(new Error("Tên đăng nhập phải có ít nhất 3 ký tự"), { status: 400 });
  if (displayName.length < 2) throw Object.assign(new Error("Tên hiển thị phải có ít nhất 2 ký tự"), { status: 400 });
  const at = nowIso();
  return {
    id: id("stf"),
    username,
    displayName,
    role,
    passwordHash: await hashStaffPassword(input.password),
    active: input.active !== false,
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
