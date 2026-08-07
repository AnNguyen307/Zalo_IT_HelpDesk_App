import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { activeAdminCount, createStaffAccountRecord, ensureUniqueStaffUsername, hashStaffPassword, normalizeStaffActive, normalizeUsername, publicStaffAccount, validateStaffAccountTransition, verifyStaffPassword } from "../src/staff-accounts.mjs";

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

test("staff creation preserves active, inactive and default states", async () => {
  const base = { username: "state.test", displayName: "State Test", role: "viewer", password: "HelpDesk2026" };
  assert.equal((await createStaffAccountRecord({ ...base, username: "state.active", active: true })).active, true);
  assert.equal((await createStaffAccountRecord({ ...base, username: "state.inactive", active: false })).active, false);
  assert.equal((await createStaffAccountRecord({ ...base, username: "state.default" })).active, true);
  assert.equal(normalizeStaffActive(false), false);
});

test("invalid staff states and roles are rejected with actionable fields", async () => {
  assert.throws(() => normalizeStaffActive("false"), (error) => error.status === 400 && error.code === "STAFF_ACTIVE_INVALID" && error.field === "active");
  await assert.rejects(
    () => createStaffAccountRecord({ username: "bad.role", displayName: "Bad Role", role: "owner", password: "HelpDesk2026" }),
    (error) => error.status === 400 && error.code === "STAFF_ROLE_INVALID" && error.field === "role",
  );
});

test("duplicate usernames are detected after normalization and support edit exclusion", () => {
  const accounts = [{ id: "stf_1", username: "tech.one" }];
  assert.throws(
    () => ensureUniqueStaffUsername(accounts, " Tech One "),
    (error) => error.status === 409 && error.code === "STAFF_USERNAME_EXISTS" && error.field === "username",
  );
  assert.equal(ensureUniqueStaffUsername(accounts, " Tech One ", "stf_1"), "tech.one");
});

test("an admin cannot self-lock, self-demote or remove the last active admin", () => {
  const onlyAdmin = { id: "stf_admin", username: "han.admin", role: "admin", active: true };
  assert.throws(
    () => validateStaffAccountTransition([onlyAdmin], onlyAdmin, { actorId: onlyAdmin.id, nextRole: "admin", nextActive: false }),
    (error) => error.code === "STAFF_SELF_LOCK_FORBIDDEN" && error.field === "active",
  );
  assert.throws(
    () => validateStaffAccountTransition([onlyAdmin], onlyAdmin, { actorId: "another_admin", nextRole: "viewer", nextActive: true }),
    (error) => error.code === "STAFF_LAST_ACTIVE_ADMIN" && error.field === "role",
  );
  assert.doesNotThrow(() => validateStaffAccountTransition([onlyAdmin, { id: "stf_admin_2", role: "admin", active: true }], onlyAdmin, { actorId: "stf_admin_2", nextRole: "viewer", nextActive: true }));
});

test("SQL migration persists staff identity and stable ticket assignment", async () => {
  const migration = await readFile(new URL("../sql/007_staff_operations_sla.sql", import.meta.url), "utf8");
  for (const value of ["helpdesk.staff_accounts", "password_hash", "session_version", "assigned_to_id", "version_number = 7"]) {
    assert.match(migration, new RegExp(value.replaceAll(".", "\\.")));
  }
});
