import { useState, type FormEvent } from "react";
import { Icon } from "../components/Icon";
import { useApp } from "../context";

function formatInviteCode(value: string) {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  return compact.match(/.{1,4}/g)?.join("-") || "";
}

export function InviteLoginPage() {
  const { authError, loginWithInvite } = useApp();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (code.replace(/-/g, "").length !== 12) return;
    setSubmitting(true);
    try { await loginWithInvite(code); }
    catch { /* error is shown by context */ }
    finally { setSubmitting(false); }
  }

  return (
    <main className="invite-screen">
      <section className="invite-brand-panel" aria-hidden="true">
        <span className="invite-brand-mark">IT</span>
        <div>
          <span className="state-kicker">IT SERVICE WORKSHOP</span>
          <h1>Hỗ trợ đúng người.<br />Theo dõi đúng việc.</h1>
          <p>Gửi yêu cầu, nhận phản hồi và theo dõi tiến độ trong một luồng an toàn.</p>
        </div>
        <div className="invite-trust-row"><span><Icon name="shield" size={17} /> Thiết bị được ghi nhớ</span><span>Phiên tự gia hạn</span></div>
      </section>
      <section className="invite-form-panel">
        <form className="invite-card" onSubmit={submit}>
          <span className="invite-icon"><Icon name="shield" size={28} /></span>
          <span className="state-kicker">XÁC NHẬN LẦN ĐẦU</span>
          <h2>Nhập mã mời nhân viên</h2>
          <p>Mã do quản trị viên HelpDesk cấp. Sau lần xác nhận này, bạn dùng ứng dụng bình thường mà không cần nhập lại.</p>
          <label htmlFor="inviteCode">Mã mời</label>
          <input
            id="inviteCode"
            value={code}
            onChange={(event) => setCode(formatInviteCode(event.target.value))}
            placeholder="XXXX-XXXX-XXXX"
            autoCapitalize="characters"
            autoComplete="one-time-code"
            spellCheck={false}
            inputMode="text"
            maxLength={14}
            aria-invalid={Boolean(authError)}
            aria-describedby={authError ? "inviteError" : "inviteHint"}
          />
          <small id="inviteHint">Mỗi mã chỉ dùng được một lần và có thời hạn.</small>
          {authError && <div id="inviteError" className="invite-error" role="alert"><Icon name="alert" size={17} /> {authError}</div>}
          <button className="primary invite-submit" disabled={submitting || code.replace(/-/g, "").length !== 12}>
            {submitting ? <><span className="button-loader" /> Đang xác nhận…</> : <>Xác nhận thiết bị <Icon name="arrow-right" /></>}
          </button>
          <div className="invite-foot"><Icon name="shield" size={15} /> Mã mời không được lưu ở dạng đọc được trên hệ thống.</div>
        </form>
      </section>
    </main>
  );
}
