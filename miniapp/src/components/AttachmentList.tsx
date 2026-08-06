import { useEffect, useState } from "react";
import type { Attachment } from "../types";
import { api, isPreviewableMime } from "../lib/api";
import { toast } from "../lib/zalo";
import { AttachmentPreview } from "./AttachmentPreview";
import { Icon } from "./Icon";

function size(n:number){return n<1048576?`${Math.max(1,Math.round(n/1024))} KB`:`${(n/1048576).toFixed(1)} MB`}

function Thumbnail({ attachment }: { attachment: Attachment }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    if (!attachment.mimeType.startsWith("image/")) return;
    let active = true; let href = "";
    api.attachmentBlob(attachment, true).then((blob) => { if (!active) return; href = URL.createObjectURL(blob); setSrc(href); }).catch(() => undefined);
    return () => { active = false; if (href) URL.revokeObjectURL(href); };
  }, [attachment]);
  if (src) return <img src={src} alt="" />;
  return <Icon name={attachment.mimeType === "application/pdf" ? "book" : "file"} />;
}

export function AttachmentGallery({ attachments, compact = false }: { attachments: Attachment[]; compact?: boolean }) {
  const [preview, setPreview] = useState<Attachment | null>(null);
  if (!attachments.length) return null;
  return <>
    <div className={`attachment-gallery ${compact ? "compact" : ""}`}>{attachments.map((attachment) => <article className="attachment-tile" key={attachment.id}>
      <button className="attachment-preview-trigger" disabled={!isPreviewableMime(attachment.mimeType)} onClick={() => setPreview(attachment)} aria-label={isPreviewableMime(attachment.mimeType) ? `Xem trước ${attachment.fileName}` : `${attachment.fileName} không hỗ trợ xem trước`}>
        <span className="attachment-thumb"><Thumbnail attachment={attachment} /></span>
        <span className="attachment-copy"><strong>{attachment.fileName}</strong><small>{size(attachment.size)} · {isPreviewableMime(attachment.mimeType) ? "Chạm để xem" : "Chỉ tải xuống"}</small></span>
      </button>
      <button className="attachment-download" onClick={() => api.downloadAttachment(attachment).catch((error) => toast(error.message))} aria-label={`Tải ${attachment.fileName}`}><Icon name="arrow-right" /></button>
    </article>)}</div>
    {preview && <AttachmentPreview attachment={preview} onClose={() => setPreview(null)} />}
  </>;
}

export function AttachmentList({attachments}:{attachments:Attachment[]}){if(!attachments.length)return null;return <section className="detail-card attachment-card"><div className="card-title-row"><span className="card-title-icon"><Icon name="attachment"/></span><div><h3>Ảnh và file đính kèm</h3><small>{attachments.length} file · xem trước an toàn ngay trong ứng dụng</small></div></div><AttachmentGallery attachments={attachments}/></section>}
