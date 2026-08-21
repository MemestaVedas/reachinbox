import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { LogOut, Search, X } from "lucide-react";

import type { ComposeForm, EmailRecord, Folder, Screen, SenderOption, UploadedAttachment, UserProfile } from "./types";
import {
  API_BASE,
  AUTH_TOKEN_STORAGE_KEY,
  USER_STORAGE_KEY,
  blankForm,
  clearGoogleSession,
  formatFileSize,
  plainTextFromHtml,
  saveGoogleSession,
} from "./utils";

import { Sidebar } from "./components/Sidebar";
import { LoginScreen } from "./components/LoginScreen";
import { ComposeScreen } from "./components/ComposeScreen";
import { EmailRow } from "./components/EmailRow";
import { DetailScreen } from "./components/DetailScreen";
import { Toast } from "./components/Toast";

// ---------------------------------------------------------------------------
// Fallback demo data shown while the API is offline
// ---------------------------------------------------------------------------
const demoUser: UserProfile = {
  id: "preview",
  name: "Oliver Brown",
  email: "oliver.brown@domain.io",
};

// ---------------------------------------------------------------------------
// App — state lives here; components are pure presentational
// ---------------------------------------------------------------------------
export function App() {
  // Restore session on first render
  const [screen, setScreen] = useState<Screen>(() =>
    sessionStorage.getItem(USER_STORAGE_KEY) &&
      sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
      ? "home"
      : "login",
  );
  const [folder, setFolder] = useState<Folder>("scheduled");
  const [user, setUser] = useState<UserProfile>(() => {
    const saved = sessionStorage.getItem(USER_STORAGE_KEY);
    return saved ? (JSON.parse(saved) as UserProfile) : demoUser;
  });
  const [authToken, setAuthToken] = useState(
    () => sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ?? "",
  );

  // Email lists
  const [scheduled, setScheduled] = useState<EmailRecord[]>([]);
  const [sent, setSent] = useState<EmailRecord[]>([]);
  const [selected, setSelected] = useState<EmailRecord | null>(null);

  // Compose form
  const [compose, setCompose] = useState<ComposeForm>(blankForm);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [manualRecipient, setManualRecipient] = useState("");
  const [fileName, setFileName] = useState("");
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showSendLater, setShowSendLater] = useState(false);
  const [senders, setSenders] = useState<SenderOption[]>([]);
  const [senderId, setSenderId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  // UI state
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);

  function showToast(nextMessage: string) {
    setToast({ id: Date.now(), message: nextMessage });
  }

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------
  async function loadEmails() {
    setLoading(true);
    try {
      const headers: HeadersInit = authToken ? { Authorization: `Bearer ${authToken}` } : {};
      const [scheduledRes, sentRes, sendersRes] = await Promise.all([
        fetch(`${API_BASE}/api/emails?status=pending,processing`, { headers }),
        fetch(`${API_BASE}/api/emails?status=sent,failed`, { headers }),
        fetch(`${API_BASE}/api/senders`, { headers }),
      ]);
      if (!scheduledRes.ok || !sentRes.ok || !sendersRes.ok) throw new Error("API unavailable");
      setScheduled((await scheduledRes.json() as { emails: EmailRecord[] }).emails);
      setSent((await sentRes.json() as { emails: EmailRecord[] }).emails);
      const loadedSenders = (await sendersRes.json() as { senders: SenderOption[] }).senders;
      setSenders(loadedSenders);
      setSenderId((current) => current || loadedSenders[0]?.id || "");
      setError("");
    } catch {
      setError("Preview data is shown while the API is offline.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (screen !== "login") void loadEmails();
  }, [screen]);

  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------
  function login(event: FormEvent) {
    event.preventDefault();
    setError("Use Google sign-in to authenticate. Email/password login is not enabled.");
  }

  function logout() {
    clearGoogleSession();
    setAuthToken("");
    setScreen("login");
  }

  function handleGoogleUser(nextUser: UserProfile, token: string) {
    setUser(nextUser);
    setAuthToken(token);
    saveGoogleSession(nextUser, token);
    setScreen("home");
  }

  // -------------------------------------------------------------------------
  // Compose actions
  // -------------------------------------------------------------------------
  async function readLeadFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const emails = text.match(/[^\s,;]+@[^\s,;]+\.[^\s,;]+/gi) ?? [];
    setRecipients((current) => [...new Set([...current, ...emails.map((email) => email.toLowerCase())])]);
    setFileName(file.name);
    showToast(`Detected ${new Set(emails.map((email) => email.toLowerCase())).size} email IDs from ${file.name}`);
    event.target.value = "";
  }

  function addManualRecipient() {
    const candidate = manualRecipient.trim().toLowerCase();
    if (!candidate) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)) {
      setError("Enter a valid recipient email address.");
      return;
    }
    setRecipients((current) => current.includes(candidate) ? current : [...current, candidate]);
    setManualRecipient("");
    setError("");
  }

  async function uploadMedia(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;

    const maxFileSize = 8 * 1024 * 1024;
    const maxBatchSize = 25 * 1024 * 1024;
    const oversized = files.find((file) => file.size > maxFileSize);
    const nextTotal = attachments.reduce((total, attachment) => total + attachment.sizeBytes, 0)
      + files.reduce((total, file) => total + file.size, 0);
    if (oversized) {
      setError(`${oversized.name} is ${formatFileSize(oversized.size)}. Each attachment must be 8 MB or smaller.`);
      return;
    }
    if (nextTotal > maxBatchSize) {
      setError("Attachments must total 25 MB or less for one email.");
      return;
    }

    setUploading(true);
    setError("");
    try {
      const uploaded = await Promise.all(files.map(async (file) => {
        const response = await fetch(`${API_BASE}/api/uploads`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${authToken}`,
            "Content-Type": "application/octet-stream",
            "X-File-Name": encodeURIComponent(file.name),
            "X-File-Type": file.type || "application/octet-stream",
          },
          body: file,
        });
        const payload = await response.json().catch(() => null) as { attachment?: UploadedAttachment; error?: string } | null;
        if (!response.ok || !payload?.attachment) throw new Error(payload?.error ?? `Unable to upload ${file.name}`);
        return payload.attachment;
      }));
      setAttachments((current) => [...current, ...uploaded]);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Unable to upload attachment.");
    } finally {
      setUploading(false);
    }
  }

  async function removeAttachment(attachment: UploadedAttachment) {
    setAttachments((current) => current.filter((currentAttachment) => currentAttachment.id !== attachment.id));
    try {
      const response = await fetch(`${API_BASE}/api/uploads/${attachment.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!response.ok && response.status !== 404) throw new Error();
    } catch {
      setError(`Could not remove ${attachment.fileName} from storage. It will not be scheduled.`);
    }
  }

  async function scheduleEmail(event: FormEvent) {
    event.preventDefault();
    const plainBody = plainTextFromHtml(compose.body);
    if (!compose.subject.trim() || !plainBody || recipients.length === 0 || !senderId) {
      setError("Add a sender, subject, message, and at least one recipient first.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/batches`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          subject: compose.subject,
          body: plainBody,
          bodyHtml: compose.body,
          recipients,
          attachmentIds: attachments.map((attachment) => attachment.id),
          senderId,
          startTime: new Date(compose.startTime).toISOString(),
          delayMs: compose.delaySeconds * 1000,
          hourlyLimit: compose.hourlyLimit,
        }),
      });
      if (!response.ok) throw new Error("Could not schedule");
      setMessage(`${recipients.length} emails scheduled successfully.`);
      showToast(`Scheduled ${recipients.length} email${recipients.length === 1 ? "" : "s"} successfully`);
      setCompose(blankForm());
      setRecipients([]);
      setManualRecipient("");
      setFileName("");
      setAttachments([]);
      setScreen("home");
      await loadEmails();
    } catch {
      setError("Could not schedule this batch. Check the API and database.");
    } finally {
      setSaving(false);
    }
  }

  // -------------------------------------------------------------------------
  // Screen routing
  // -------------------------------------------------------------------------
  if (screen === "login") {
    return (
      <LoginScreen
        onLogin={login}
        onGoogleUser={handleGoogleUser}
        onError={setError}
        error={error}
      />
    );
  }

  if (screen === "compose") {
    return (
      <>
        <ComposeScreen
          form={compose}
          setForm={setCompose}
          fileName={fileName}
          recipients={recipients}
          manualRecipient={manualRecipient}
          setManualRecipient={setManualRecipient}
          addManualRecipient={addManualRecipient}
          senders={senders}
          senderId={senderId}
          setSenderId={setSenderId}
          readLeadFile={readLeadFile}
          attachments={attachments}
          uploadMedia={uploadMedia}
          removeAttachment={removeAttachment}
          uploading={uploading}
          onBack={() => setScreen("home")}
          onSubmit={scheduleEmail}
          saving={saving}
          showSendLater={showSendLater}
          setShowSendLater={setShowSendLater}
        />
        {toast ? <Toast key={toast.id} message={toast.message} onClose={() => setToast(null)} /> : null}
      </>
    );
  }

  if (screen === "detail" && selected) {
    return <DetailScreen email={selected} onBack={() => setScreen("home")} />;
  }

  // -------------------------------------------------------------------------
  // Home — inbox list
  // -------------------------------------------------------------------------
  const emails = folder === "scheduled" ? scheduled : sent;
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredEmails = normalizedSearch
    ? emails.filter((email) =>
      email.recipient.toLowerCase().includes(normalizedSearch)
      || email.batch.subject.toLowerCase().includes(normalizedSearch),
    )
    : emails;

  return (
    <div className="app">
      {toast ? <Toast key={toast.id} message={toast.message} onClose={() => setToast(null)} /> : null}
      <Sidebar
        folder={folder}
        scheduledCount={scheduled.length}
        sentCount={sent.length}
        setFolder={(next) => {
          setFolder(next);
          setMessage("");
        }}
        onCompose={() => {
          setError("");
          setScreen("compose");
        }}
      />

      <main className="workspace">
        <header className="workspace-header">
          <div className="mobile-brand">ONG</div>
          <div className="search-box">
            <Search size={16} />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search recipient or subject"
              aria-label="Search emails"
            />
          </div>
          <button className="header-icon" aria-label="Refresh" onClick={() => void loadEmails()}>
            ↻
          </button>
          <div className="header-profile ml-auto flex items-center gap-2">
            <span className="profile-avatar">
              {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : user.name.slice(0, 2).toUpperCase()}
            </span>
            <span className="header-user-details">
              <strong>{user.name}</strong>
              <small>{user.email}</small>
            </span>
            <button className="header-logout" onClick={logout} aria-label="Log out">
              <LogOut size={14} />
              <span>Log out</span>
            </button>
          </div>
        </header>

        <section className="inbox-content">
          {message && (
            <div className="success-message">
              {message}
              <button onClick={() => setMessage("")}>
                <X size={14} />
              </button>
            </div>
          )}
          {error && <div className="error-message">{error}</div>}

          <div className="list-heading">
            <div>
              <span className="overline">Core</span>
              <h1>
                {folder === "scheduled" ? "Scheduled" : "Sent"}{" "}
                <small>{emails.length}</small>
              </h1>
            </div>
            <button className="compose-button" onClick={() => setScreen("compose")}>
              Compose
            </button>
          </div>

          <div className="email-list">
            {loading ? (
              <div className="empty-row">Loading emails...</div>
            ) : filteredEmails.length === 0 ? (
              <div className="empty-row">No {folder} emails yet.</div>
            ) : (
              filteredEmails.map((email) => (
                <EmailRow
                  key={email.id}
                  email={email}
                  folder={folder}
                  onOpen={() => {
                    setSelected(email);
                    setScreen("detail");
                  }}
                />
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
