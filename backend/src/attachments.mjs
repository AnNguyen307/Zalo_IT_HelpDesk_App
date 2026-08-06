import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { config } from "./config.mjs";
import { id, nowIso } from "./utils.mjs";

export const PREVIEWABLE_MIME = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "application/pdf", "text/plain", "text/csv",
]);

const SAFE_MIME = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "application/pdf", "text/plain", "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip", "application/x-zip-compressed",
]);

const EXTENSION_MIME = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif",
  ".pdf": "application/pdf", ".txt": "text/plain", ".csv": "text/csv",
  ".doc": "application/msword", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint", ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".zip": "application/zip",
};

const MIME_EXTENSION = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "application/pdf": ".pdf",
  "text/plain": ".txt",
  "text/csv": ".csv",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "application/zip": ".zip",
  "application/x-zip-compressed": ".zip",
};

function statusError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function cleanName(value) {
  const name = path.basename(String(value || "file"))
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return (name || "file").slice(0, 180);
}

function attachmentIdentity(fileName, mimeType) {
  const originalName = cleanName(fileName);
  const inferredMime = EXTENSION_MIME[path.extname(originalName).toLowerCase()];
  const suppliedMime = String(mimeType || "application/octet-stream").toLowerCase();
  const safeMime = suppliedMime === "application/octet-stream"
    ? inferredMime || suppliedMime
    : suppliedMime;

  if (!SAFE_MIME.has(safeMime)) {
    throw statusError("Định dạng file chưa được hỗ trợ");
  }

  const extension = path.extname(originalName).slice(0, 12)
    || MIME_EXTENSION[safeMime]
    || ".bin";

  return { originalName, safeMime, extension: extension.toLowerCase() };
}

function newAttachmentPaths(ticketId, extension) {
  const attachmentId = id("att");
  const directory = path.join(config.uploadsDir, ticketId);
  const storedName = `${attachmentId}${extension}`;
  const diskPath = path.join(directory, storedName);
  const tempPath = `${diskPath}.uploading`;
  return { attachmentId, directory, diskPath, tempPath };
}

function attachmentRecord({
  attachmentId, ticketId, messageId, uploaderId, uploaderName,
  originalName, safeMime, size, diskPath,
}) {
  return {
    id: attachmentId,
    ticketId,
    messageId: messageId || null,
    uploaderId,
    uploaderName: uploaderName || "Người dùng",
    fileName: originalName,
    mimeType: safeMime,
    size,
    storagePath: path.relative(config.backendRoot, diskPath).replaceAll("\\", "/"),
    createdAt: nowIso(),
  };
}

function parseBase64(value) {
  const raw = String(value || "");
  const comma = raw.indexOf(",");
  return Buffer.from(comma >= 0 ? raw.slice(comma + 1) : raw, "base64");
}

export async function saveAttachment({
  ticketId, messageId = null, uploaderId, uploaderName,
  fileName, mimeType, dataBase64,
}) {
  const { originalName, safeMime, extension } = attachmentIdentity(fileName, mimeType);
  const data = parseBase64(dataBase64);
  if (!data.length) throw statusError("File rỗng hoặc dữ liệu không hợp lệ");
  if (data.length > config.maxAttachmentBytes) {
    throw statusError(`File được phép tối đa ${Math.round(config.maxAttachmentBytes / 1024 / 1024)} MB`, 413);
  }

  const { attachmentId, directory, diskPath } = newAttachmentPaths(ticketId, extension);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(diskPath, data, { flag: "wx" });

  return attachmentRecord({
    attachmentId, ticketId, messageId, uploaderId, uploaderName,
    originalName, safeMime, size: data.length, diskPath,
  });
}

export async function saveAttachmentStream({
  stream, ticketId, messageId = null, uploaderId, uploaderName,
  fileName, mimeType, maxBytes = config.maxAttachmentBytes, onChunk,
}) {
  const { originalName, safeMime, extension } = attachmentIdentity(fileName, mimeType);
  const { attachmentId, directory, diskPath, tempPath } = newAttachmentPaths(ticketId, extension);
  await fs.mkdir(directory, { recursive: true });

  let size = 0;
  const limiter = new Transform({
    transform(chunk, encoding, callback) {
      try {
        size += chunk.length;
        if (size > maxBytes) {
          callback(statusError(`File được phép tối đa ${Math.round(maxBytes / 1024 / 1024)} MB`, 413));
          return;
        }
        if (onChunk) onChunk(chunk.length);
        callback(null, chunk);
      } catch (error) {
        callback(error);
      }
    },
  });

  try {
    await pipeline(stream, limiter, createWriteStream(tempPath, { flags: "wx" }));
    if (stream.truncated) {
      throw statusError(`File được phép tối đa ${Math.round(maxBytes / 1024 / 1024)} MB`, 413);
    }
    if (!size) throw statusError("File rỗng hoặc dữ liệu không hợp lệ");
    await fs.rename(tempPath, diskPath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    await fs.rm(diskPath, { force: true }).catch(() => undefined);
    throw error;
  }

  return attachmentRecord({
    attachmentId, ticketId, messageId, uploaderId, uploaderName,
    originalName, safeMime, size, diskPath,
  });
}

function safeAttachmentPath(storagePath) {
  const root = path.resolve(config.uploadsDir);
  const absolute = path.resolve(config.backendRoot, storagePath || "");
  const relative = path.relative(root, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw statusError("Đường dẫn file không hợp lệ");
  }
  return absolute;
}

export async function readAttachmentFile(attachment) {
  return fs.readFile(safeAttachmentPath(attachment?.storagePath));
}

export async function removeAttachmentFile(attachment) {
  if (!attachment?.storagePath) return;
  let absolute;
  try { absolute = safeAttachmentPath(attachment.storagePath); }
  catch { return; }
  await fs.rm(absolute, { force: true }).catch(() => undefined);
}

export function canPreviewAttachment(attachment) {
  return PREVIEWABLE_MIME.has(String(attachment?.mimeType || "").toLowerCase());
}

export function publicAttachment(attachment) {
  const { storagePath, ...safe } = attachment;
  return safe;
}
