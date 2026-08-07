import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.mjs";
import { json, text } from "./utils.mjs";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
};

export function corsHeaders(req) {
  const origin = req.headers.origin || "";
  const allowed = config.allowedOrigins.includes("*") || config.allowedOrigins.includes(origin);
  return {
    ...(allowed && origin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "Content-Type, Authorization, ngrok-skip-browser-warning",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function routeMatch(pathname, pattern) {
  const keys = [];
  const parts = pattern.split("/").filter(Boolean);
  const expression = parts.map((part) => {
    if (part.startsWith(":")) {
      keys.push(part.slice(1));
      return "([^/]+)";
    }
    return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }).join("/");
  const regex = new RegExp(`^/${expression}/?$`);
  const match = pathname.match(regex);
  if (!match) return null;
  return Object.fromEntries(keys.map((key, index) => [key, decodeURIComponent(match[index + 1])]));
}

export async function serveStatic(res, pathname, headers = {}) {
  const publicRoot = path.join(config.backendRoot, "public");
  const target = pathname === "/admin" || pathname === "/admin/"
    ? path.join(publicRoot, "admin.html")
    : path.join(publicRoot, pathname.replace(/^\/+/, ""));
  const safe = path.resolve(target);
  if (!safe.startsWith(path.resolve(publicRoot))) return false;
  try {
    const body = await fs.readFile(safe);
    text(res, 200, body, MIME[path.extname(safe)] || "application/octet-stream", headers);
    return true;
  } catch {
    return false;
  }
}

export function notFound(res, headers = {}) {
  json(res, 404, { error: "Not found" }, headers);
}
