import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { File } from "node:buffer";

process.env.UPLOADS_DIR = "./data/test-v552-uploads";

const { readMultipartAttachments } = await import("../src/multipart.mjs");
const { removeAttachmentFile } = await import("../src/attachments.mjs");

async function withUploadServer(handler) {
  const saved = [];
  const server = http.createServer(async (req, res) => {
    try {
      const parsed = await readMultipartAttachments(req, {
        ticketId: "ticket-test",
        messageId: "message-test",
        uploaderId: "user-test",
        uploaderName: "Tester",
        maxFiles: 4,
        maxFileBytes: 1024 * 1024,
        maxTotalBytes: 2 * 1024 * 1024,
      });
      saved.push(...parsed.attachments);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        message: parsed.fields.message,
        count: parsed.attachments.length,
        sizes: parsed.attachments.map((item) => item.size),
      }));
    } catch (error) {
      res.writeHead(error.status || 500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: error.message }));
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await handler(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await Promise.all(saved.map((item) => removeAttachmentFile(item)));
    await fs.rm(path.resolve("./data/test-v552-uploads"), { recursive: true, force: true });
  }
}

test("multipart upload streams multiple files and preserves message field", async () => {
  await withUploadServer(async (url) => {
    const form = new FormData();
    form.append("message", "hello");
    form.append("attachments", new File([Buffer.alloc(600_000, 1)], "a.jpg", { type: "image/jpeg" }));
    form.append("attachments", new File([Buffer.alloc(500_000, 2)], "b.png", { type: "image/png" }));

    const response = await fetch(url, { method: "POST", body: form });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.message, "hello");
    assert.equal(body.count, 2);
    assert.deepEqual(body.sizes, [600_000, 500_000]);
  });
});

test("multipart upload accepts a file exactly at the configured limit", async () => {
  await withUploadServer(async (url) => {
    const form = new FormData();
    form.append("attachments", new File([Buffer.alloc(1024 * 1024, 3)], "exact-limit.jpg", { type: "image/jpeg" }));

    const response = await fetch(url, { method: "POST", body: form });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.count, 1);
    assert.deepEqual(body.sizes, [1024 * 1024]);
  });
});

test("multipart upload rejects a file one byte above the configured limit", async () => {
  await withUploadServer(async (url) => {
    const form = new FormData();
    form.append("attachments", new File([Buffer.alloc(1024 * 1024 + 1, 4)], "too-big.jpg", { type: "image/jpeg" }));

    const response = await fetch(url, { method: "POST", body: form });
    const body = await response.json();

    assert.equal(response.status, 413);
    assert.match(body.error, /tối đa 1 MB/);
  });
});
