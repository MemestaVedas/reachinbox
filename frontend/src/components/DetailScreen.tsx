import { ArrowLeft, FileText, Image, Star, Trash2, Video, Volume2 } from "lucide-react";
import type { EmailRecord } from "../types";
import { formatDate, formatFileSize, initials } from "../utils";

interface DetailScreenProps {
  email: EmailRecord;
  onBack: () => void;
}

export function DetailScreen({ email, onBack }: DetailScreenProps) {
  const senderAddress = email.sender?.etherealEmail ?? email.recipient;
  const attachments = email.batch.attachments ?? [];

  function attachmentIcon(contentType: string) {
    if (contentType.startsWith("image/")) return <Image size={15} />;
    if (contentType.startsWith("video/")) return <Video size={15} />;
    if (contentType.startsWith("audio/")) return <Volume2 size={15} />;
    return <FileText size={15} />;
  }

  return (
    <div className="detail-page">
      <header className="detail-header">
        <button onClick={onBack} className="back-button">
          <ArrowLeft size={18} />
          {email.batch.subject}
        </button>
        <div>
          <Star size={17} />
          <Trash2 size={17} />
        </div>
      </header>

      <article className="message">
        <div className="message-meta">
          <span className="sender-avatar">{initials(senderAddress)}</span>
          <div>
            <strong>{senderAddress}</strong>
            <span>to {email.recipient}</span>
            <small>{email.status}</small>
          </div>
          <time>{formatDate(email.sentAt ?? email.scheduledFor)}</time>
        </div>

        {email.batch.bodyHtml ? (
          <div className="message-body rich-message-body" dangerouslySetInnerHTML={{ __html: email.batch.bodyHtml }} />
        ) : (
          <div className="message-body">
            {email.batch.body.split("\n").map((line, index) => <p key={`${email.id}-${index}`}>{line || "\u00a0"}</p>)}
          </div>
        )}

        {attachments.length > 0 ? (
          <div className="message-attachments" aria-label="Email attachments">
            {attachments.map((attachment) => <div className="message-attachment" key={attachment.id}>
              {attachmentIcon(attachment.contentType)}
              <span><strong>{attachment.fileName}</strong><small>{formatFileSize(attachment.sizeBytes)}</small></span>
            </div>)}
          </div>
        ) : null}
      </article>
    </div>
  );
}
