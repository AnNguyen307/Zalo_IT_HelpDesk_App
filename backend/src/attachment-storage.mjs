import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { config } from "./config.mjs";

function storageError(operation, error) {
  const detail = String(error?.message || error || "unknown error").slice(0, 300);
  return Object.assign(new Error(`Attachment storage ${operation} failed: ${detail}`), { status: 503 });
}

function safeSegment(value, label) {
  const segment = String(value || "").trim();
  if (!segment || !/^[A-Za-z0-9._-]+$/.test(segment)) throw Object.assign(new Error(`${label} is invalid`), { status: 400 });
  return segment;
}

function safeObjectKey(value) {
  const key = String(value || "").replaceAll("\\", "/").replace(/^\/+/, "");
  if (!key || key.split("/").some((part) => !part || part === "." || part === "..")) {
    throw Object.assign(new Error("Attachment storage path is invalid"), { status: 400 });
  }
  return key;
}

export function createFilesystemAttachmentStorage({ backendRoot, uploadsDir }) {
  const root = path.resolve(uploadsDir);

  function absolutePath(storagePath) {
    const absolute = path.resolve(backendRoot, storagePath || "");
    const relative = path.relative(root, absolute);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
      throw Object.assign(new Error("Attachment storage path is invalid"), { status: 400 });
    }
    return absolute;
  }

  function buildStoragePath(ticketId, storedName) {
    const target = path.join(root, safeSegment(ticketId, "Ticket ID"), safeSegment(storedName, "Stored file name"));
    return path.relative(backendRoot, target).replaceAll("\\", "/");
  }

  async function putBuffer(storagePath, data) {
    const target = absolutePath(storagePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, data, { flag: "wx" });
  }

  async function putFile(storagePath, sourcePath) {
    const target = absolutePath(storagePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(sourcePath, target, constants.COPYFILE_EXCL);
  }

  const read = (storagePath) => fs.readFile(absolutePath(storagePath));
  const remove = async (storagePath) => fs.rm(absolutePath(storagePath), { force: true }).catch(() => undefined);
  const status = () => ({ provider: "filesystem", configured: true, persistent: true });

  return { buildStoragePath, putBuffer, putFile, read, remove, status };
}

export function createSupabaseAttachmentStorage({ client, bucket }) {
  const bucketName = safeSegment(bucket, "Supabase bucket");
  const objects = client.storage.from(bucketName);

  function buildStoragePath(ticketId, storedName) {
    return `tickets/${safeSegment(ticketId, "Ticket ID")}/${safeSegment(storedName, "Stored file name")}`;
  }

  async function upload(storagePath, body, contentType) {
    const key = safeObjectKey(storagePath);
    const { error } = await objects.upload(key, body, { contentType, upsert: false, cacheControl: "0" });
    if (error) throw storageError("upload", error);
  }

  const putBuffer = (storagePath, data, contentType) => upload(storagePath, data, contentType);
  const putFile = async (storagePath, sourcePath, contentType) => upload(storagePath, await fs.readFile(sourcePath), contentType);

  async function read(storagePath) {
    const { data, error } = await objects.download(safeObjectKey(storagePath));
    if (error) throw storageError("download", error);
    return Buffer.from(await data.arrayBuffer());
  }

  async function remove(storagePath) {
    const { error } = await objects.remove([safeObjectKey(storagePath)]);
    if (error) throw storageError("delete", error);
  }

  const status = () => ({ provider: "supabase", configured: true, persistent: true, bucket: bucketName });
  return { buildStoragePath, putBuffer, putFile, read, remove, status };
}

function createDefaultStorage() {
  if (config.attachmentStorageProvider === "supabase") {
    if (!config.supabaseUrl || !config.supabaseSecretKey) {
      throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required for Supabase attachment storage.");
    }
    const client = createClient(config.supabaseUrl, config.supabaseSecretKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    return createSupabaseAttachmentStorage({ client, bucket: config.supabaseStorageBucket });
  }
  return createFilesystemAttachmentStorage({ backendRoot: config.backendRoot, uploadsDir: config.uploadsDir });
}

let defaultStorage = null;
function storage() {
  if (!defaultStorage) defaultStorage = createDefaultStorage();
  return defaultStorage;
}

export const buildAttachmentStoragePath = (...args) => storage().buildStoragePath(...args);
export const putAttachmentBuffer = (...args) => storage().putBuffer(...args);
export const putAttachmentFile = (...args) => storage().putFile(...args);
export const readAttachmentStorage = (...args) => storage().read(...args);
export const removeAttachmentStorage = (...args) => storage().remove(...args);
export const getAttachmentStorageStatus = () => storage().status();
