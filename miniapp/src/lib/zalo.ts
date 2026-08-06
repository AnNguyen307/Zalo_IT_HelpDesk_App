import { getAccessToken, getUserID, getUserInfo, nativeStorage, showToast } from "zmp-sdk";

const TOKEN_KEY = "helpdesk.session";

export function readSession(): string {
  try { return nativeStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; }
}

export function saveSession(token: string) {
  try { nativeStorage.setItem(TOKEN_KEY, token); } catch { /* browser preview */ }
}

export function clearSession() {
  try { nativeStorage.removeItem(TOKEN_KEY); } catch { /* browser preview */ }
}

export function toast(message: string) {
  try { showToast({ message }); } catch { console.info(message); }
}

export async function getZaloIdentity() {
  try {
    const userId = await getUserID({});
    console.info("[ZALO] getUserID success:", Boolean(userId));
    let accessToken = "";
    try {
      accessToken = await getAccessToken();
      console.info("[ZALO] getAccessToken success:", Boolean(accessToken));
    } catch (error) {
      console.warn("[ZALO] getAccessToken failed:", error);
    }
    let name = "Người dùng Zalo";
    let avatar = "";
    try {
      const result = await getUserInfo({ autoRequestPermission: true });
      name = result.userInfo?.name || name;
      avatar = result.userInfo?.avatar || "";
    } catch (error) {
      console.warn("[ZALO] optional profile permission failed:", error);
    }
    return { accessToken, userId, name, avatar };
  } catch (error) {
    console.error("Không lấy được danh tính Zalo:", error);
    if (import.meta.env.DEV) return { accessToken: "browser-preview", userId: "demo-zalo-user", name: "Demo User", avatar: "" };
    throw error;
  }
}
