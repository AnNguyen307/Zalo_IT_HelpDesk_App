import { PassThrough } from "node:stream";
import { once } from "node:events";
import { config } from "./config.mjs";
import { removeAttachmentFile, saveAttachmentStream } from "./attachments.mjs";

function statusError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function multipartBoundary(contentType) {
  const match = String(contentType || "").match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const value = String(match?.[1] || match?.[2] || "").trim();
  if (!value || value.length > 200) throw statusError("Thiếu multipart boundary hợp lệ");
  return value;
}

function parsePartHeaders(raw) {
  const headers = {};
  for (const line of raw.toString("utf8").split("\r\n")) {
    const index = line.indexOf(":");
    if (index <= 0) continue;
    headers[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
  }

  const disposition = headers["content-disposition"] || "";
  const name = disposition.match(/(?:^|;)\s*name="([^"]*)"/i)?.[1] || "";
  const filename = disposition.match(/(?:^|;)\s*filename="([^"]*)"/i)?.[1] || "";
  return {
    name,
    filename,
    mimeType: String(headers["content-type"] || "application/octet-stream").split(";")[0].trim().toLowerCase(),
  };
}

class MultipartReader {
  constructor(stream, maxRequestBytes) {
    this.iterator = stream[Symbol.asyncIterator]();
    this.buffer = Buffer.alloc(0);
    this.ended = false;
    this.bytesRead = 0;
    this.maxRequestBytes = maxRequestBytes;
  }

  async fill() {
    if (this.ended) return false;
    const { value, done } = await this.iterator.next();
    if (done) {
      this.ended = true;
      return false;
    }

    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    this.bytesRead += chunk.length;
    if (this.bytesRead > this.maxRequestBytes) {
      throw statusError(`Tổng dữ liệu upload vượt quá ${Math.round(this.maxRequestBytes / 1024 / 1024)} MB`, 413);
    }
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    return true;
  }

  async readExact(length) {
    while (this.buffer.length < length) {
      if (!await this.fill()) throw statusError("Dữ liệu multipart kết thúc không hợp lệ");
    }
    const value = this.buffer.subarray(0, length);
    this.buffer = this.buffer.subarray(length);
    return value;
  }

  async readUntil(separator, maxBytes) {
    const chunks = [];
    let size = 0;

    await this.pumpUntil(separator, async (chunk) => {
      size += chunk.length;
      if (size > maxBytes) throw statusError("Trường multipart vượt quá giới hạn cho phép", 413);
      chunks.push(Buffer.from(chunk));
    });

    return Buffer.concat(chunks);
  }

  async pumpUntil(separator, onData) {
    const keep = Math.max(0, separator.length - 1);

    while (true) {
      const index = this.buffer.indexOf(separator);
      if (index >= 0) {
        if (index) await onData(this.buffer.subarray(0, index));
        this.buffer = this.buffer.subarray(index + separator.length);
        return;
      }

      if (this.ended) throw statusError("Không tìm thấy multipart boundary kết thúc");

      if (this.buffer.length > keep) {
        const emitLength = this.buffer.length - keep;
        await onData(this.buffer.subarray(0, emitLength));
        this.buffer = this.buffer.subarray(emitLength);
      }

      await this.fill();
    }
  }
}

async function writeWithBackpressure(stream, chunk) {
  if (!chunk.length) return;
  if (!stream.write(chunk)) await once(stream, "drain");
}

export function isMultipartRequest(req) {
  return String(req.headers["content-type"] || "").toLowerCase().startsWith("multipart/form-data");
}

export async function readMultipartAttachments(req, {
  ticketId,
  messageId = null,
  uploaderId,
  uploaderName,
  maxFiles = config.maxAttachmentsPerReply,
  maxFileBytes = config.maxAttachmentBytes,
  maxTotalBytes = config.maxReplyUploadBytes,
  acceptedFields = ["message"],
  acceptedFileFields = ["attachments", "file"],
} = {}) {
  const boundary = multipartBoundary(req.headers["content-type"]);
  const openingBoundary = Buffer.from(`--${boundary}\r\n`);
  const partBoundary = Buffer.from(`\r\n--${boundary}`);
  // Multipart headers and boundaries need a small allowance above the file total.
  const reader = new MultipartReader(req, maxTotalBytes + 2 * 1024 * 1024);
  const saved = [];
  const fields = {};
  let fileCount = 0;
  let totalFileBytes = 0;

  try {
    const opening = await reader.readExact(openingBoundary.length);
    if (!opening.equals(openingBoundary)) throw statusError("Multipart boundary mở đầu không hợp lệ");

    while (true) {
      const rawHeaders = await reader.readUntil(Buffer.from("\r\n\r\n"), 32 * 1024);
      const part = parsePartHeaders(rawHeaders);
      if (!part.name) throw statusError("Multipart part thiếu trường name");

      if (part.filename && acceptedFileFields.includes(part.name)) {
        fileCount += 1;
        if (fileCount > maxFiles) {
          throw statusError(`Mỗi lần gửi chỉ được tối đa ${maxFiles} file`, 409);
        }

        const pass = new PassThrough();
        const saving = saveAttachmentStream({
          stream: pass,
          ticketId,
          messageId,
          uploaderId,
          uploaderName,
          fileName: part.filename,
          mimeType: part.mimeType,
          maxBytes: maxFileBytes,
          onChunk(bytes) {
            totalFileBytes += bytes;
            if (totalFileBytes > maxTotalBytes) {
              throw statusError(`Tổng file mỗi lần gửi được phép tối đa ${Math.round(maxTotalBytes / 1024 / 1024)} MB`, 413);
            }
          },
        });

        try {
          await reader.pumpUntil(partBoundary, (chunk) => writeWithBackpressure(pass, chunk));
          pass.end();
          saved.push(await saving);
        } catch (error) {
          pass.destroy(error);
          await saving.catch(() => undefined);
          throw error;
        }
      } else {
        const value = await reader.readUntil(partBoundary, 10_000);
        if (acceptedFields.includes(part.name)) fields[part.name] = value.toString("utf8");
      }

      const suffix = await reader.readExact(2);
      if (suffix.equals(Buffer.from("--"))) {
        // Optional final CRLF and epilogue are intentionally ignored.
        break;
      }
      if (!suffix.equals(Buffer.from("\r\n"))) {
        throw statusError("Multipart boundary phân cách không hợp lệ");
      }
    }

    return { fields, attachments: saved, totalBytes: totalFileBytes };
  } catch (error) {
    await Promise.all(saved.map((item) => removeAttachmentFile(item)));
    throw error;
  }
}
