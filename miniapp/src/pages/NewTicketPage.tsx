import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { Icon } from "../components/Icon";
import { useApp } from "../context";
import { api } from "../lib/api";
import { toast } from "../lib/zalo";
const quick = [
    {
      label: "Mất mạng",
      title: "Máy tính không truy cập được Internet",
      icon: "network" as const,
      hint: "LAN, Wi-Fi, DNS",
    },
    {
      label: "Máy in Ricoh",
      title: "Máy in Ricoh Offline hoặc không in",
      icon: "printer" as const,
      hint: "Offline, kẹt lệnh, mã SC",
    },
    {
      label: "Windows",
      title: "Máy tính Windows chạy chậm",
      icon: "windows" as const,
      hint: "Chậm, treo, cập nhật",
    },
    {
      label: "Office",
      title: "Microsoft Office hoặc Outlook gặp lỗi",
      icon: "office" as const,
      hint: "Excel, Word, Outlook",
    },
  ],
  MAX_TICKET_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export function NewTicketPage() {
  const { navigate, refreshTickets } = useApp();
  const [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [device, setDevice] = useState(""),
    [location, setLocation] = useState(""),
    [files, setFiles] = useState<File[]>([]),
    [sending, setSending] = useState(false);
  const ready = useMemo(
    () => title.trim().length >= 4 && description.trim().length >= 10,
    [title, description],
  );
  function template(i: (typeof quick)[number]) {
    setTitle(i.title);
    setDescription(
      `Tôi đang gặp sự cố: ${i.title}.\n\nThời điểm bắt đầu: ...\nThông báo/mã lỗi: ...\nNhững bước đã thử: ...\nPhạm vi ảnh hưởng: chỉ máy của tôi / nhiều người.`,
    );
  }
  useEffect(() => {
    const saved = sessionStorage.getItem("hd_new_ticket_template");
    if (!saved) return;
    sessionStorage.removeItem("hd_new_ticket_template");
    const selected = quick.find((item) => item.title === saved);
    if (selected) template(selected);
    else setTitle(saved);
  }, []);
  function choose(e: ChangeEvent<HTMLInputElement>) {
    const a = [...(e.target.files || [])];
    const big = a.find((f) => f.size > MAX_TICKET_ATTACHMENT_BYTES);
    if (big) {
      toast(`${big.name} vượt quá giới hạn 10 MB`);
      e.target.value = "";
      return;
    }
    setFiles((current) => {
      const next = [...current, ...a];
      if (next.length > 8) toast("Mỗi yêu cầu tối đa 8 file");
      const limited = next.slice(0, 8);
      if (
        limited.reduce((sum, file) => sum + file.size, 0) >
        MAX_TICKET_ATTACHMENT_BYTES
      ) {
        toast("Tổng ảnh/file của yêu cầu vượt quá 10 MB");
        return current;
      }
      return limited;
    });
    e.target.value = "";
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setSending(true);
    try {
      const r = await api.createTicket({
        title,
        description,
        device,
        location,
      });
      let up = 0;
      for (const f of files)
        try {
          await api.uploadAttachment(r.ticket.id, f);
          up++;
        } catch (err) {
          toast(err instanceof Error ? err.message : `Không thể tải ${f.name}`);
        }
      await refreshTickets();
      toast(
        up
          ? `Đã tạo ticket và tải ${up}/${files.length} file`
          : "Đã gửi yêu cầu đến HelpDesk",
      );
      navigate("detail", r.ticket.id);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Không thể tạo ticket");
    } finally {
      setSending(false);
    }
  }
  return (
    <>
      <button className="back-button" onClick={() => navigate("home")}>
        <Icon name="arrow-left" /> Trang chủ
      </button>
      <section className="page-title">
        <span className="eyebrow">YÊU CẦU MỚI</span>
        <h1>Tạo yêu cầu hỗ trợ</h1>
        <p>Mô tả sự cố hoặc chọn mẫu có sẵn.</p>
      </section>
      <section className="new-ticket-visual">
        <img
          src="/assets/ticket-evidence-720.webp"
          alt="Chụp ảnh lỗi và đính kèm vào yêu cầu"
          width="720"
          height="540"
          decoding="async"
        />
        <div>
          <strong>Ảnh chụp lỗi</strong>
          <span>Chụp toàn màn hình và mã lỗi.</span>
        </div>
      </section>
      <section className="form-section">
        <div className="form-section-head">
          <b>1</b>
          <span>
            <h2>Chọn nhóm sự cố</h2>
            <p>Bắt đầu nhanh với mẫu có sẵn</p>
          </span>
        </div>
        <div className="quick-grid">
          {quick.map((i) => (
            <button
              key={i.label}
              className={title === i.title ? "selected" : ""}
              onClick={() => template(i)}
            >
              <span className={`quick-icon category-${i.icon}`}>
                <Icon name={i.icon} />
              </span>
              <span>
                <strong>{i.label}</strong>
                <small>{i.hint}</small>
              </span>
              <Icon name="arrow-right" />
            </button>
          ))}
        </div>
      </section>
      <form className="ticket-form" onSubmit={submit}>
        <section className="form-section">
          <div className="form-section-head">
            <b>2</b>
            <span>
            <h2>Mô tả tình huống</h2>
              <p>Cho IT biết lỗi xảy ra khi nào</p>
            </span>
          </div>
          <label>
            Tiêu đề sự cố *
            <input
              value={title}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setTitle(e.target.value)
              }
              minLength={4}
              maxLength={160}
              placeholder="Ví dụ: Ricoh tầng 2 báo Offline"
              required
            />
          </label>
          <label>
            Mô tả chi tiết *
            <textarea
              value={description}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                setDescription(e.target.value)
              }
              rows={8}
              minLength={10}
              maxLength={5000}
              placeholder="Lỗi xuất hiện khi nào? Mã lỗi? Đã thử gì?"
              required
            />
            <small className="counter">{description.length}/5000</small>
          </label>
          <div className="two-columns">
            <label>
              <Icon name="device" size={15} /> Thiết bị
              <input
                value={device}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setDevice(e.target.value)
                }
                placeholder="PC-ACCT-012 / Ricoh MP…"
              />
            </label>
            <label>
              <Icon name="location" size={15} /> Vị trí
              <input
                value={location}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setLocation(e.target.value)
                }
                placeholder="Tầng 2 - Kế toán"
              />
            </label>
          </div>
        </section>
        <section className="form-section">
          <div className="form-section-head">
            <b>3</b>
            <span>
            <h2>Thêm bằng chứng</h2>
              <p>Ảnh lỗi, tài liệu hoặc log</p>
            </span>
          </div>
          <label className="file-dropzone">
            <input
              type="file"
              multiple
              accept="image/*,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip"
              onChange={choose}
            />
            <Icon name="attachment" size={25} />
            <strong>Chọn ảnh hoặc file</strong>
            <small>Tối đa 8 file · tổng 10 MB/yêu cầu</small>
          </label>
          {files.length > 0 && (
            <div className="selected-files">
              {files.map((f, i) => (
                <div key={`${f.name}-${i}`}>
                  <Icon name="file" />
                  <span>
                    <strong>{f.name}</strong>
                    <small>{(f.size / 1048576).toFixed(1)} MB</small>
                  </span>
                  <button
                    type="button"
                    onClick={() => setFiles((c) => c.filter((_, x) => x !== i))}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
        <div className="privacy-warning">
          <Icon name="shield" />
          <span>
            <strong>Không gửi dữ liệu nhạy cảm</strong>
            <small>Mật khẩu, OTP, key và dữ liệu khách hàng.</small>
          </span>
        </div>
        <button className="primary submit" disabled={sending || !ready}>
          {sending ? (
            "Đang gửi…"
          ) : (
            <>
              <Icon name="send" /> Gửi cho HelpDesk
            </>
          )}
        </button>
      </form>
    </>
  );
}
