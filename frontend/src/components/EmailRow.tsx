import { Star } from "lucide-react";
import type { EmailRecord, Folder } from "../types";
import { formatDate } from "../utils";

interface EmailRowProps {
  email: EmailRecord;
  folder: Folder;
  onOpen: () => void;
}

export function EmailRow({ email, folder, onOpen }: EmailRowProps) {
  return (
    <button className="email-row" onClick={onOpen}>
      <span className="row-to">To: {email.recipient}</span>

      {folder === "scheduled" && (
        <span className="date-pill">◷ {formatDate(email.scheduledFor)}</span>
      )}

      <strong>{email.batch.subject}</strong>
      <span className="preview">- {email.batch.body || "No message preview"}</span>

      <span className={`row-status row-status-${email.status}`}>{email.status}</span>
      <Star size={15} className="star" />
    </button>
  );
}
