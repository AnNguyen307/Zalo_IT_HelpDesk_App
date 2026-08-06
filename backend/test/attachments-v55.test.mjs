import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

process.env.UPLOADS_DIR = "./data/test-uploads-v55";
const { canPreviewAttachment, publicAttachment, readAttachmentFile, removeAttachmentFile, saveAttachment } = await import("../src/attachments.mjs");

const testRoot = path.resolve(new URL("..", import.meta.url).pathname, "data/test-uploads-v55");

test("reply attachment keeps message relation and supports safe preview", async () => {
  const attachment = await saveAttachment({
    ticketId: "ticket-test",
    messageId: "message-test",
    uploaderId: "user-test",
    uploaderName: "Tester",
    fileName: "evidence.txt",
    mimeType: "text/plain",
    dataBase64: Buffer.from("safe preview").toString("base64"),
  });
  assert.equal(attachment.messageId, "message-test");
  assert.equal(canPreviewAttachment(attachment), true);
  assert.equal((await readAttachmentFile(attachment)).toString(), "safe preview");
  assert.equal(Object.hasOwn(publicAttachment(attachment), "storagePath"), false);
  await removeAttachmentFile(attachment);
});

test.after(async () => {
  await fs.rm(testRoot, { recursive: true, force: true });
});
