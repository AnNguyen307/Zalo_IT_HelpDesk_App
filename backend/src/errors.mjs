export function appError(message, { status = 400, code = "BAD_REQUEST", field = null } = {}) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  if (field) error.field = field;
  return error;
}

function isSqlDuplicate(error) {
  return [2601, 2627].includes(Number(error?.number || error?.originalError?.info?.number));
}

export function publicHttpError(error, { pathname = "" } = {}) {
  if (isSqlDuplicate(error)) {
    const staffAccountRequest = pathname.startsWith("/api/admin/staff");
    return {
      status: 409,
      payload: {
        error: staffAccountRequest ? "Tên đăng nhập đã tồn tại" : "Dữ liệu đã tồn tại",
        code: staffAccountRequest ? "STAFF_USERNAME_EXISTS" : "DUPLICATE_RECORD",
        ...(staffAccountRequest ? { field: "username" } : {}),
      },
    };
  }

  const status = Number(error?.status) || 500;
  const payload = {
    error: status >= 500 ? "Internal server error" : String(error?.message || "Request failed"),
  };
  if (status < 500 && error?.code) payload.code = error.code;
  if (status < 500 && error?.field) payload.field = error.field;
  return { status, payload };
}
