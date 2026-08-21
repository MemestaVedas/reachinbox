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
      <span className="row-message"><strong>{email.batch.subject || "(No subject)"}</strong><span className="preview">{email.batch.body || "No message preview"}</span></span>
      <span className="row-meta"><span className={`row-status row-status-${email.status}`}>{email.status}</span><b>{formatDate(folder === "scheduled" ? email.scheduledFor : (email.sentAt ?? email.scheduledFor))}</b></span>
      <Star size={15} className="star" />
    </button>
  );
}
