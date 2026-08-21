import { nativeStorage, showToast } from "zmp-sdk";

const SESSION_KEY = "helpdesk.user-session.v2";
const LEGACY_TOKEN_KEY = "helpdesk.session";
const DEVICE_KEY = "helpdesk.device-id";

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
}

export function readSession(): StoredSession | null {
  try {
    const raw = nativeStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    return parsed.accessToken && parsed.refreshToken
      ? { accessToken: parsed.accessToken, refreshToken: parsed.refreshToken }
      : null;
  } catch {
    return null;
  }
}

export function saveSession(accessToken: string, refreshToken: string) {
  try {
    nativeStorage.setItem(SESSION_KEY, JSON.stringify({ accessToken, refreshToken }));
    nativeStorage.removeItem(LEGACY_TOKEN_KEY);
  } catch { /* browser preview */ }
}

export function clearSession() {
  try {
    nativeStorage.removeItem(SESSION_KEY);
    nativeStorage.removeItem(LEGACY_TOKEN_KEY);
  } catch { /* browser preview */ }
}

function randomDeviceId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const random = `${Date.now()}-${Math.random()}-${Math.random()}`;
  return `device-${random.replace(/[^a-z0-9]/gi, "")}`;
}

export function getDeviceId(): string {
  try {
    const existing = nativeStorage.getItem(DEVICE_KEY);
    if (existing && existing.length >= 16) return existing;
    const created = randomDeviceId();
    nativeStorage.setItem(DEVICE_KEY, created);
    return created;
  } catch {
    return randomDeviceId();
  }
}

export function toast(message: string) {
  try { showToast({ message }); } catch { console.info(message); }
}
