export function buildStaffAccountPayload({ username = "", displayName = "", role = "technician", active = true, password = "" } = {}) {
  const payload = {
    username: String(username),
    displayName: String(displayName),
    role: String(role),
    active: active === true,
  };
  if (String(password)) payload.password = String(password);
  return payload;
}

export function staffActivePresentation(active) {
  return active
    ? { label: "Đang hoạt động", help: "Tài khoản có thể đăng nhập ngay sau khi lưu." }
    : { label: "Đã khóa", help: "Tài khoản được tạo nhưng chưa thể đăng nhập." };
}

export function staffErrorFieldId(field = "") {
  return ({
    username: "staffAccountUsername",
    displayName: "staffDisplayName",
    role: "staffRole",
    password: "staffPassword",
    active: "staffActive",
  })[field] || "";
}
