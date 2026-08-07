import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildStaffAccountPayload, staffActivePresentation, staffErrorFieldId } from "../public/admin-staff.js";
import { appError, publicHttpError } from "../src/errors.mjs";

test("staff form payload always sends the selected active state", () => {
  const enabled = buildStaffAccountPayload({ username: "han.admin", displayName: "Hân", role: "admin", active: true, password: "HelpDesk2026" });
  const disabled = buildStaffAccountPayload({ username: "viewer.one", displayName: "Viewer", role: "viewer", active: false });
  assert.equal(enabled.active, true);
  assert.equal(disabled.active, false);
  assert.equal(disabled.password, undefined);
  assert.equal(staffActivePresentation(true).label, "Đang hoạt động");
  assert.equal(staffActivePresentation(false).label, "Đã khóa");
});

test("structured validation errors identify the corresponding staff form field", () => {
  const { status, payload } = publicHttpError(appError("Tên đăng nhập đã tồn tại", { status: 409, code: "STAFF_USERNAME_EXISTS", field: "username" }), { pathname: "/api/admin/staff" });
  assert.equal(status, 409);
  assert.deepEqual(payload, { error: "Tên đăng nhập đã tồn tại", code: "STAFF_USERNAME_EXISTS", field: "username" });
  assert.equal(staffErrorFieldId(payload.field), "staffAccountUsername");
});

test("SQL unique-key races become visible staff conflicts instead of generic 500 errors", () => {
  const duplicate = Object.assign(new Error("Violation of UNIQUE KEY constraint"), { number: 2627, code: "EREQUEST" });
  assert.deepEqual(publicHttpError(duplicate, { pathname: "/api/admin/staff" }), {
    status: 409,
    payload: { error: "Tên đăng nhập đã tồn tại", code: "STAFF_USERNAME_EXISTS", field: "username" },
  });
});

test("unexpected backend failures remain sanitized", () => {
  assert.deepEqual(publicHttpError(new Error("SQL password leaked here"), { pathname: "/api/admin/staff" }), {
    status: 500,
    payload: { error: "Internal server error" },
  });
});

test("staff dialog contains an in-dialog live error and an explicit active switch", async () => {
  const [html, script] = await Promise.all([
    readFile(new URL("../public/admin.html", import.meta.url), "utf8"),
    readFile(new URL("../public/admin.js", import.meta.url), "utf8"),
  ]);
  assert.match(html, /id="staffFormError"[^>]*role="alert"[^>]*aria-live="assertive"/);
  assert.match(html, /id="staffActive"[^>]*role="switch"/);
  assert.match(html, /id="staffSaveBtn"/);
  assert.match(script, /showStaffFormError\(error\)/);
  assert.match(script, /button\.disabled = true/);
  assert.match(script, /dialog\[open\]/);
});
