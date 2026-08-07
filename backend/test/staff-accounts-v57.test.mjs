import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { activeAdminCount, createStaffAccountRecord, hashStaffPassword, normalizeUsername, publicStaffAccount, verifyStaffPassword } from "../src/staff-accounts.mjs";

test("staff passwords use salted scrypt hashes", async () => {
  const first = await hashStaffPassword("StrongPass123");
  const second = await hashStaffPassword("StrongPass123");
  assert.match(first, /^scrypt\$/);
  assert.notEqual(first, second);
  assert.equal(await verifyStaffPassword("StrongPass123", first), true);
  assert.equal(await verifyStaffPassword("wrong-password", first), false);
});

test("staff account records normalize identity and never expose password hashes", async () => {
  const account = await createStaffAccountRecord({ username: "  Tech One  ", displayName: "Nguyễn Văn An", role: "technician", password: "HelpDesk2026" }, "admin");
  assert.equal(account.username, "tech.one");
  assert.equal(normalizeUsername("A B@C"), "a.bc");
  assert.equal(publicStaffAccount(account).passwordHash, undefined);
  assert.equal(activeAdminCount([{ role: "admin", active: true }, { role: "admin", active: false }]), 1);
});

test("weak staff passwords are rejected", async () => {
  await assert.rejects(() => hashStaffPassword("short"), /10–200/);
  await assert.rejects(() => hashStaffPassword("onlyletterslong"), /cả chữ và số/);
});

test("SQL migration persists staff identity and stable ticket assignment", async () => {
  const migration = await readFile(new URL("../sql/007_staff_operations_sla.sql", import.meta.url), "utf8");
  for (const value of ["helpdesk.staff_accounts", "password_hash", "session_version", "assigned_to_id", "version_number = 7"]) {
    assert.match(migration, new RegExp(value.replaceAll(".", "\\.")));
  }
});
