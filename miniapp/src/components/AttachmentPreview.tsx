import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { toast } from "../lib/zalo";
import type { Attachment } from "../types";
import { Icon } from "./Icon";

export function AttachmentPreview({ attachment, onClose }: { attachment: Attachment; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setLoading(true); setError(""); setText(""); setUrl("");
    api.attachmentBlob(attachment, true).then(async (blob) => {
      if (!active) return;
      if (["text/plain", "text/csv"].includes(attachment.mimeType)) setText(await blob.text());
      else { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); }
    }).catch((reason) => active && setError(reason instanceof Error ? reason.message : "Không thể xem trước file"))
      .finally(() => active && setLoading(false));
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [attachment]);

  return <div className="attachment-preview-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="attachment-preview-modal" role="dialog" aria-modal="true" aria-label={`Xem trước ${attachment.fileName}`}>
      <header><div><strong>{attachment.fileName}</strong><small>{attachment.mimeType}</small></div><button onClick={onClose} aria-label="Đóng">×</button></header>
      <div className="attachment-preview-body">
        {loading && <div className="preview-state"><span className="splash-loader" /> Đang tải bản xem trước…</div>}
        {error && <div className="preview-state preview-error"><Icon name="alert" /> {error}</div>}
        {!loading && !error && attachment.mimeType.startsWith("image/") && <img src={url} alt={attachment.fileName} />}
        {!loading && !error && attachment.mimeType === "application/pdf" && <iframe src={url} title={attachment.fileName} />}
        {!loading && !error && ["text/plain", "text/csv"].includes(attachment.mimeType) && <pre>{text}</pre>}
      </div>
      <footer><button className="secondary-file-button" onClick={() => api.downloadAttachment(attachment).catch((reason) => toast(reason.message))}><Icon name="file" /> Tải xuống</button><button className="primary" onClick={onClose}>Đóng</button></footer>
    </section>
  </div>;
}
