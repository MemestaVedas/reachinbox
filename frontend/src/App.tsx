import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Search, X } from "lucide-react";

import type { ComposeForm, EmailRecord, Folder, Screen, SenderOption, UploadedAttachment, UserProfile } from "./types";
import {
  API_BASE,
  AUTH_TOKEN_STORAGE_KEY,
  USER_STORAGE_KEY,
  blankForm,
  clearGoogleSession,
  formatFileSize,
  plainTextFromHtml,
  readStoredSession,
  saveGoogleSession,
  THEME_STORAGE_KEY,
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
    readStoredSession(USER_STORAGE_KEY) &&
      readStoredSession(AUTH_TOKEN_STORAGE_KEY)
      ? "home"
      : "login",
  );
  const [folder, setFolder] = useState<Folder>("scheduled");
  const [user, setUser] = useState<UserProfile>(() => {
    const saved = readStoredSession(USER_STORAGE_KEY);
    return saved ? (JSON.parse(saved) as UserProfile) : demoUser;
  });
  const [authToken, setAuthToken] = useState(
    () => readStoredSession(AUTH_TOKEN_STORAGE_KEY) ?? "",
  );
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem(THEME_STORAGE_KEY) === "dark");

  useEffect(() => {
    document.documentElement.classList.toggle("theme-dark", darkMode);
    localStorage.setItem(THEME_STORAGE_KEY, darkMode ? "dark" : "light");
  }, [darkMode]);

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
  const [sortMode, setSortMode] = useState<"date-desc" | "date-asc" | "recipient" | "subject" | "status">("date-desc");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "processing" | "sent" | "failed">("all");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "next7">("all");

  // UI state
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ id: number; title: string; message: string; kind: "success" | "error" | "warning"; actionLabel?: string; onAction?: () => void } | null>(null);

  function showToast(title: string, nextMessage: string, kind: "success" | "error" | "warning" = "success", actionLabel?: string, onAction?: () => void) {
    setToast({ id: Date.now(), title, message: nextMessage, kind, actionLabel, onAction });
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
      const responses = [scheduledRes, sentRes, sendersRes];
      if (responses.some((response) => response.status === 401)) {
        clearGoogleSession();
        setAuthToken("");
        setScreen("login");
        setError("Your Google session has expired. Please sign in again.");
        return;
      }
      const failedResponse = responses.find((response) => !response.ok);
      if (failedResponse) throw new Error(`Dashboard request failed (${failedResponse.status})`);
      setScheduled((await scheduledRes.json() as { emails: EmailRecord[] }).emails);
      setSent((await sentRes.json() as { emails: EmailRecord[] }).emails);
      const loadedSenders = (await sendersRes.json() as { senders: SenderOption[] }).senders;
      setSenders(loadedSenders);
      setSenderId((current) => current || loadedSenders[0]?.id || "");
      setError("");
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "";
      setError(message.startsWith("Dashboard request failed")
        ? "The dashboard could not load your mailbox data. Please try refreshing."
        : "The API could not be reached. Check that the backend server is running.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (screen !== "login") void loadEmails();
  }, [screen]);

  useEffect(() => {
    if (screen === "login" || !authToken) return;
    let active = true;
    const pollNotifications = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/notifications`, { headers: { Authorization: `Bearer ${authToken}` } });
        if (!active || !response.ok) return;
        const payload = await response.json() as { notifications?: Array<{ title?: string; message?: string; kind?: "success" | "error" | "warning" }> };
        const notification = payload.notifications?.at(-1);
        if (notification?.message) showToast(notification.title ?? "Notification", notification.message, notification.kind ?? "error");
      } catch {
        // Notification polling is best effort and must not interrupt composing.
      }
    };
    void pollNotifications();
    const interval = window.setInterval(() => void pollNotifications(), 2000);
    return () => { active = false; window.clearInterval(interval); };
  }, [authToken, screen]);

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
    showToast("Leads detected", `Detected ${new Set(emails.map((email) => email.toLowerCase())).size} from ${file.name}`);
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
        return { ...payload.attachment, previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined };
      }));
      setAttachments((current) => [...current, ...uploaded]);
      showToast("Media uploaded", `${uploaded.length} file${uploaded.length === 1 ? "" : "s"} ready to attach`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Unable to upload attachment.");
    } finally {
      setUploading(false);
    }
  }

  async function removeAttachment(attachment: UploadedAttachment) {
    if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
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

  function removeRecipient(recipient: string) {
    setRecipients((current) => current.filter((value) => value !== recipient));
    showToast("Deleted", `Deleted ${recipient}`, "warning");
  }

  async function scheduleEmail(event?: FormEvent, sendAnyway = false) {
    event?.preventDefault();
    const plainBody = plainTextFromHtml(compose.body);
    if ((!sendAnyway && (!compose.subject.trim() || !plainBody)) || recipients.length === 0 || !senderId) {
      if (!compose.subject.trim() || !plainBody) {
        showToast("Missing details", !compose.subject.trim() && !plainBody
          ? "Add a subject and message before sending."
          : !compose.subject.trim()
            ? "Add a subject before sending."
            : "Add a message before sending.", "warning", "Send anyway", () => { void scheduleEmail(undefined, true); });
      }
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
          allowIncomplete: sendAnyway,
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
      showToast("Success", `Scheduled ${recipients.length} email${recipients.length === 1 ? "" : "s"} successfully`);
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
        darkMode={darkMode}
        onToggleTheme={() => setDarkMode((current) => !current)}
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
          removeRecipient={removeRecipient}
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
        {toast ? <Toast key={toast.id} title={toast.title} message={toast.message} kind={toast.kind} actionLabel={toast.actionLabel} onAction={toast.onAction} onClose={() => setToast(null)} /> : null}
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
  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = startOfToday.getTime() + 24 * 60 * 60 * 1000;
  const visibleEmails = filteredEmails
    .filter((email) => statusFilter === "all" || email.status === statusFilter)
    .filter((email) => {
      const timestamp = new Date(email.sentAt ?? email.scheduledFor).getTime();
      if (dateFilter === "today") return timestamp >= startOfToday.getTime() && timestamp < endOfToday;
      if (dateFilter === "next7") return timestamp >= now && timestamp <= now + 7 * 24 * 60 * 60 * 1000;
      return true;
    })
    .slice()
    .sort((left, right) => {
      if (sortMode === "recipient") return left.recipient.localeCompare(right.recipient);
      if (sortMode === "subject") return left.batch.subject.localeCompare(right.batch.subject);
      if (sortMode === "status") return left.status.localeCompare(right.status);
      const leftDate = new Date(left.sentAt ?? left.scheduledFor).getTime();
      const rightDate = new Date(right.sentAt ?? right.scheduledFor).getTime();
      return sortMode === "date-asc" ? leftDate - rightDate : rightDate - leftDate;
    });
  const failedCount = sent.filter((email) => email.status === "failed").length;
  const nextScheduled = scheduled.filter((email) => email.status === "pending" || email.status === "processing").sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime())[0];

  return (
    <div className="app">
      {toast ? <Toast key={toast.id} title={toast.title} message={toast.message} kind={toast.kind} actionLabel={toast.actionLabel} onAction={toast.onAction} onClose={() => setToast(null)} /> : null}
      <Sidebar
        user={user}
        folder={folder}
        scheduledCount={scheduled.length}
        sentCount={sent.length}
        setFolder={(next) => {
          setFolder(next);
          setStatusFilter("all");
          setDateFilter("all");
          setMessage("");
        }}
        onCompose={() => {
          setError("");
          setScreen("compose");
        }}
        darkMode={darkMode}
        onToggleTheme={() => setDarkMode((current) => !current)}
        onLogout={logout}
      />

      <main className="workspace">
        <header className="workspace-header">
          <h1 className="header-section-title">
            <span className="header-title-text">{folder === "scheduled" ? "Scheduled" : "Sent"}</span>
            <small>{visibleEmails.length}</small>
          </h1>
          <button className="header-icon" aria-label="Refresh" onClick={() => void loadEmails()}>
            ↻
          </button>
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

          <div className="dashboard-summary" aria-label="Mailbox summary">
            <div className="summary-card"><Clock3 size={16} /><span><small>Scheduled</small><strong>{scheduled.length}</strong></span></div>
            <div className="summary-card"><CheckCircle2 size={16} /><span><small>Delivered</small><strong>{sent.filter((email) => email.status === "sent").length}</strong></span></div>
            <div className="summary-card"><AlertTriangle size={16} /><span><small>Needs attention</small><strong>{failedCount}</strong></span></div>
            <div className="summary-card summary-next"><span><small>Next send</small><strong>{nextScheduled ? new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(nextScheduled.scheduledFor)) : "None queued"}</strong></span></div>
          </div>

          <div className="dashboard-toolbar" aria-label="Mailbox controls">
            <div className="search-box">
              <Search size={16} />
              <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search recipient or subject" aria-label="Search emails" />
            </div>

            <div className="dashboard-filters" aria-label="Email sorting and filters">
              <label>
                <span>Sort</span>
                <select value={sortMode} onChange={(event) => setSortMode(event.target.value as typeof sortMode)}>
                  <option value="date-desc">Newest first</option>
                  <option value="date-asc">Oldest first</option>
                  <option value="recipient">Recipient A–Z</option>
                  <option value="subject">Subject A–Z</option>
                  <option value="status">Status</option>
                </select>
              </label>
              <label>
                <span>Status</span>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
                  <option value="all">All statuses</option>
                  {folder === "scheduled" ? <><option value="pending">Pending</option><option value="processing">Processing</option></> : <><option value="sent">Sent</option><option value="failed">Failed</option></>}
                </select>
              </label>
              <label>
                <span>Date</span>
                <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value as typeof dateFilter)}>
                  <option value="all">All dates</option>
                  <option value="today">Today</option>
                  <option value="next7">Next 7 days</option>
                </select>
              </label>
            </div>

            <button className="compose-button" onClick={() => setScreen("compose")}>
              Compose
            </button>
          </div>

          <div className="email-list">
            {loading ? (
              <div className="empty-row">Loading emails...</div>
            ) : visibleEmails.length === 0 ? (
              <div className="empty-row">No {folder} emails yet.</div>
            ) : (
              visibleEmails.map((email) => (
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
