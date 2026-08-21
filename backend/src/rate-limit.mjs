import { config } from "./config.mjs";

const buckets = new Map();

function clientAddress(req) {
  const forwarded = String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.socket?.remoteAddress || "unknown";
}

function policyFor(method, pathname) {
  if (method === "POST" && pathname === "/api/auth/invite") return { name: "invite-auth", max: config.rateLimitInviteMax };
  if (method === "POST" && pathname.startsWith("/api/auth/")) return { name: "auth", max: config.rateLimitAuthMax };
  if (method === "POST" && (/\/attachments\/?$/.test(pathname) || /\/replies\/?$/.test(pathname))) {
    return { name: "upload", max: config.rateLimitUploadMax };
  }
  if (["POST", "PATCH", "DELETE"].includes(method) && pathname.startsWith("/api/")) {
    return { name: "write", max: config.rateLimitWriteMax };
  }
  return null;
}

function prune(now) {
  if (buckets.size < config.rateLimitMaxKeys) return;
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
  while (buckets.size >= config.rateLimitMaxKeys) buckets.delete(buckets.keys().next().value);
}

export function enforceRequestRateLimit(req, pathname, now = Date.now()) {
  if (!config.rateLimitEnabled) return null;
  const policy = policyFor(String(req.method || "GET").toUpperCase(), pathname);
  if (!policy) return null;
  prune(now);

  const windowMs = Math.max(1, config.rateLimitWindowSeconds) * 1000;
  const key = `${policy.name}:${clientAddress(req)}`;
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > Math.max(1, policy.max)) {
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    throw Object.assign(new Error("Quá nhiều yêu cầu; vui lòng thử lại sau"), { status: 429, retryAfterSeconds });
  }
  return { policy: policy.name, remaining: Math.max(0, policy.max - bucket.count), resetAt: bucket.resetAt };
}

export function resetRateLimitsForTests() {
  buckets.clear();
}
