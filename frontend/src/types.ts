export type Status = "pending" | "processing" | "sent" | "failed";
export type Folder = "scheduled" | "sent";
export type Screen = "login" | "home" | "compose" | "detail";

export interface EmailRecord {
  id: string;
  recipient: string;
  scheduledFor: string;
  sentAt?: string | null;
  status: Status;
  batch: {
    subject: string;
    body: string;
    bodyHtml?: string | null;
    attachments?: UploadedAttachment[];
  };
  sender?: { etherealEmail: string };
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
}

export interface SenderOption {
  id: string;
  email: string;
}

export interface UploadedAttachment {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  previewUrl?: string;
}

export interface ComposeForm {
  subject: string;
  body: string;
  startTime: string;
  delaySeconds: number;
  hourlyLimit: number;
}

export interface GoogleIdentity {
  accounts: {
    id: {
      initialize: (options: {
        client_id: string;
        callback: (response: { credential: string }) => void;
      }) => void;
      renderButton: (element: HTMLElement, options: Record<string, string>) => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}
