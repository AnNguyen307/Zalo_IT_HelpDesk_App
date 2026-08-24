import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const miniFile = (name) => new URL(`../../miniapp/src/${name}`, import.meta.url);

test("Mini App pages use short functional copy instead of slogans", async () => {
  const files = await Promise.all([
    readFile(miniFile("App.tsx"), "utf8"),
    readFile(miniFile("components/Layout.tsx"), "utf8"),
    readFile(miniFile("pages/HomePage.tsx"), "utf8"),
    readFile(miniFile("pages/TicketsPage.tsx"), "utf8"),
    readFile(miniFile("pages/NewTicketPage.tsx"), "utf8"),
    readFile(miniFile("pages/InviteLoginPage.tsx"), "utf8"),
  ]);
  const source = files.join("\n");

  for (const functionalCopy of [
    "Đang tải HelpDesk",
    "Hỗ trợ IT trong Zalo",
    "Theo dõi trạng thái và người phụ trách",
    "Tạo yêu cầu hỗ trợ",
    "Ảnh chụp lỗi",
    "IT HelpDesk<br />trong Zalo",
  ]) {
    assert.ok(source.includes(functionalCopy), `missing Mini App copy: ${functionalCopy}`);
  }

  for (const slogan of [
    "Có sự cố, luôn biết ai đang xử lý",
    "Hỗ trợ đúng người",
    "Gọn trong 3 bước",
    "Ảnh rõ, xử lý nhanh",
    "Đang chuẩn bị bàn hỗ trợ",
  ]) {
    assert.doesNotMatch(source, new RegExp(slogan));
  }
});
