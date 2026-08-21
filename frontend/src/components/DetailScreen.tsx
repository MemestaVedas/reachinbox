import { ArrowLeft, Star, Trash2 } from "lucide-react";
import type { EmailRecord } from "../types";
import { formatDate, initials } from "../utils";

interface DetailScreenProps {
  email: EmailRecord;
  onBack: () => void;
}

export function DetailScreen({ email, onBack }: DetailScreenProps) {
  const senderAddress = email.sender?.etherealEmail ?? email.recipient;

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

        <div className="message-body">
          {email.batch.body.split("\n").map((line, index) => (
            <p key={`${email.id}-${index}`}>{line || "\u00a0"}</p>
          ))}
        </div>
      </article>
    </div>
  );
}
