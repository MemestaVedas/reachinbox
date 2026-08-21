import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Search, X } from "lucide-react";

import type { ComposeForm, EmailRecord, Folder, Screen, UserProfile } from "./types";
import {
  API_BASE,
  AUTH_TOKEN_STORAGE_KEY,
  USER_STORAGE_KEY,
  blankForm,
  clearGoogleSession,
  saveGoogleSession,
} from "./utils";

import { Sidebar } from "./components/Sidebar";
import { LoginScreen } from "./components/LoginScreen";
import { ComposeScreen } from "./components/ComposeScreen";
import { EmailRow } from "./components/EmailRow";
import { DetailScreen } from "./components/DetailScreen";

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
  const [fileName, setFileName] = useState("");
  const [showSendLater, setShowSendLater] = useState(false);

  // UI state
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------
  async function loadEmails() {
    setLoading(true);
    try {
      const headers: HeadersInit = authToken ? { Authorization: `Bearer ${authToken}` } : {};
      const [scheduledRes, sentRes] = await Promise.all([
        fetch(`${API_BASE}/api/emails?status=pending`, { headers }),
        fetch(`${API_BASE}/api/emails?status=sent`, { headers }),
      ]);
      if (!scheduledRes.ok || !sentRes.ok) throw new Error("API unavailable");
      setScheduled((await scheduledRes.json() as { emails: EmailRecord[] }).emails);
      setSent((await sentRes.json() as { emails: EmailRecord[] }).emails);
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
    setRecipients([...new Set(emails.map((e) => e.toLowerCase()))]);
    setFileName(file.name);
  }

  async function scheduleEmail(event: FormEvent) {
    event.preventDefault();
    if (!compose.subject.trim() || !compose.body.trim() || recipients.length === 0) {
      setError("Add a subject, message, and lead file first.");
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
          body: compose.body,
          recipients,
          startTime: new Date(compose.startTime).toISOString(),
          delayMs: compose.delaySeconds * 1000,
          hourlyLimit: compose.hourlyLimit,
        }),
      });
      if (!response.ok) throw new Error("Could not schedule");
      setMessage(`${recipients.length} emails scheduled successfully.`);
      setCompose(blankForm());
      setRecipients([]);
      setFileName("");
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
      <ComposeScreen
        form={compose}
        setForm={setCompose}
        fileName={fileName}
        recipients={recipients}
        readLeadFile={readLeadFile}
        onBack={() => setScreen("home")}
        onSubmit={scheduleEmail}
        saving={saving}
        showSendLater={showSendLater}
        setShowSendLater={setShowSendLater}
      />
    );
  }

  if (screen === "detail" && selected) {
    return <DetailScreen email={selected} onBack={() => setScreen("home")} />;
  }

  // -------------------------------------------------------------------------
  // Home — inbox list
  // -------------------------------------------------------------------------
  const emails = folder === "scheduled" ? scheduled : sent;

  return (
    <div className="app">
      <Sidebar
        user={user}
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
        onLogout={logout}
      />

      <main className="workspace">
        <header className="workspace-header">
          <div className="mobile-brand">ONG</div>
          <div className="search-box">
            <Search size={16} />
            <input placeholder="Search" />
          </div>
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
            ) : emails.length === 0 ? (
              <div className="empty-row">No {folder} emails yet.</div>
            ) : (
              emails.map((email) => (
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
