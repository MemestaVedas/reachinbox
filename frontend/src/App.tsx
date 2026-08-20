import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { ArrowLeft, CalendarClock, ChevronDown, Clock3, Paperclip, Search, Send, Star, Trash2, Upload, X } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

type Status = "pending" | "processing" | "sent" | "failed";
type Folder = "scheduled" | "sent";
type Screen = "login" | "home" | "compose" | "detail";

interface EmailRecord { id: string; recipient: string; scheduledFor: string; sentAt?: string | null; status: Status; batch: { subject: string; body: string } }
interface UserProfile { id: string; name: string; email: string; avatarUrl?: string | null }
interface ComposeForm { subject: string; body: string; startTime: string; delaySeconds: number; hourlyLimit: number }

interface GoogleIdentity { accounts: { id: { initialize: (options: { client_id: string; callback: (response: { credential: string }) => void }) => void; renderButton: (element: HTMLElement, options: Record<string, string>) => void } } }
declare global { interface Window { google?: GoogleIdentity } }

const demoUser: UserProfile = { id: "preview", name: "Oliver Brown", email: "oliver.brown@domain.io" };
const sampleScheduled: EmailRecord[] = [
  { id: "1", recipient: "john.smith@domain.io", scheduledFor: "2026-08-20T09:15:00Z", status: "pending", batch: { subject: "Meeting follow-up", body: "Hi John, just wanted to follow up on our meeting..." } },
  { id: "2", recipient: "olive@domain.io", scheduledFor: "2026-08-21T08:15:00Z", status: "pending", batch: { subject: "Meeting follow-up", body: "Hi Olive, just wanted to follow up on our meeting..." } },
];
const sampleSent: EmailRecord[] = [{ id: "3", recipient: "amanda.clark@sender.example.com", scheduledFor: "2026-08-20T10:23:00Z", sentAt: "2026-08-20T10:23:00Z", status: "sent", batch: { subject: "Oliver, hello there! | MJWY T44 BM#52W01", body: "You have just RECEIVED something\n\nExtremely Exclusive—Only 4 Spots Worldwide Per Year | $25,000 investment" } }];
const blankForm = (): ComposeForm => ({ subject: "", body: "", startTime: new Date(Date.now() + 15 * 60_000).toISOString().slice(0, 16), delaySeconds: 2, hourlyLimit: 200 });

function formatDate(value: string | null | undefined) { return value ? new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)) : "—"; }
function initials(value: string) { return value.split(/[ @.]/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }

export function App() {
  const [screen, setScreen] = useState<Screen>(() => localStorage.getItem("reachinbox-user") ? "home" : "login");
  const [folder, setFolder] = useState<Folder>("scheduled");
  const [user, setUser] = useState<UserProfile>(() => { const saved = localStorage.getItem("reachinbox-user"); return saved ? JSON.parse(saved) as UserProfile : demoUser; });
  const [scheduled, setScheduled] = useState<EmailRecord[]>(sampleScheduled);
  const [sent, setSent] = useState<EmailRecord[]>(sampleSent);
  const [selected, setSelected] = useState<EmailRecord | null>(null);
  const [compose, setCompose] = useState<ComposeForm>(blankForm);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [showSendLater, setShowSendLater] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadEmails() {
    setLoading(true);
    try {
      const [scheduledResponse, sentResponse] = await Promise.all([fetch(`${API_BASE}/api/emails?status=pending`), fetch(`${API_BASE}/api/emails?status=sent`)]);
      if (!scheduledResponse.ok || !sentResponse.ok) throw new Error("API unavailable");
      setScheduled((await scheduledResponse.json() as { emails: EmailRecord[] }).emails);
      setSent((await sentResponse.json() as { emails: EmailRecord[] }).emails);
      setError("");
    } catch { setError("Preview data is shown while the API is offline."); } finally { setLoading(false); }
  }
  useEffect(() => { if (screen !== "login") void loadEmails(); }, [screen]);

  function login(event: FormEvent) { event.preventDefault(); localStorage.setItem("reachinbox-user", JSON.stringify(demoUser)); setUser(demoUser); setScreen("home"); }
  function logout() { localStorage.removeItem("reachinbox-user"); setScreen("login"); }
  async function readLeadFile(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (!file) return; const text = await file.text(); const emails = text.match(/[^\s,;]+@[^\s,;]+\.[^\s,;]+/gi) ?? []; setRecipients([...new Set(emails.map((email) => email.toLowerCase()))]); setFileName(file.name); }
  async function scheduleEmail(event: FormEvent) {
    event.preventDefault();
    if (!compose.subject.trim() || !compose.body.trim() || recipients.length === 0) { setError("Add a subject, message, and lead file first."); return; }
    setSaving(true); setError("");
    try {
      const response = await fetch(`${API_BASE}/api/batches`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID(), "X-User-Id": user.id }, body: JSON.stringify({ subject: compose.subject, body: compose.body, recipients, startTime: new Date(compose.startTime).toISOString(), delayMs: compose.delaySeconds * 1000, hourlyLimit: compose.hourlyLimit }) });
      if (!response.ok) throw new Error("Could not schedule");
      setMessage(`${recipients.length} emails scheduled successfully.`); setCompose(blankForm()); setRecipients([]); setFileName(""); setScreen("home"); await loadEmails();
    } catch { setError("Could not schedule this batch. Check the API and database."); } finally { setSaving(false); }
  }

  if (screen === "login") return <LoginScreen onLogin={login} onGoogleUser={(nextUser) => { setUser(nextUser); localStorage.setItem("reachinbox-user", JSON.stringify(nextUser)); setScreen("home"); }} onError={setError} error={error} />;
  if (screen === "compose") return <ComposeScreen form={compose} setForm={setCompose} fileName={fileName} recipients={recipients} readLeadFile={readLeadFile} onBack={() => setScreen("home")} onSubmit={scheduleEmail} saving={saving} showSendLater={showSendLater} setShowSendLater={setShowSendLater} />;
  if (screen === "detail" && selected) return <DetailScreen email={selected} onBack={() => setScreen("home")} />;

  const emails = folder === "scheduled" ? scheduled : sent;
  return <div className="app"><Sidebar user={user} folder={folder} setFolder={(next) => { setFolder(next); setMessage(""); }} onCompose={() => { setError(""); setScreen("compose"); }} onLogout={logout} /><main className="workspace"><header className="workspace-header"><div className="mobile-brand">ONG</div><div className="search-box"><Search size={16} /><input placeholder="Search" /></div><button className="header-icon" aria-label="Refresh" onClick={() => void loadEmails()}>↻</button></header><section className="inbox-content">{message && <div className="success-message">{message}<button onClick={() => setMessage("")}><X size={14} /></button></div>}{error && <div className="error-message">{error}</div>}<div className="list-heading"><div><span className="overline">Core</span><h1>{folder === "scheduled" ? "Scheduled" : "Sent"} <small>{emails.length}</small></h1></div><button className="compose-button" onClick={() => setScreen("compose")}>Compose</button></div><div className="email-list">{loading ? <div className="empty-row">Loading emails...</div> : emails.length === 0 ? <div className="empty-row">No {folder} emails yet.</div> : emails.map((email) => <EmailRow key={email.id} email={email} folder={folder} onOpen={() => { setSelected(email); setScreen("detail"); }} />)}</div></section></main></div>;
}

function Sidebar({ user, folder, setFolder, onCompose, onLogout }: { user: UserProfile; folder: Folder; setFolder: (folder: Folder) => void; onCompose: () => void; onLogout: () => void }) {
  return <aside className="sidebar-light"><div className="logo">ONG</div><button className="profile"><span className="profile-avatar">{initials(user.name)}</span><span><strong>{user.name}</strong><small>{user.email}</small></span><ChevronDown size={14} /></button><button className="outline-compose" onClick={onCompose}>Compose</button><span className="overline sidebar-label">Core</span><button className={`side-link ${folder === "scheduled" ? "selected" : ""}`} onClick={() => setFolder("scheduled")}><Clock3 size={15} />Scheduled <b>12</b></button><button className={`side-link ${folder === "sent" ? "selected" : ""}`} onClick={() => setFolder("sent")}><Send size={15} />Sent <b>785</b></button><button className="logout-link" onClick={onLogout}>Log out</button></aside>;
}

function LoginScreen({ onLogin, onGoogleUser, onError, error }: { onLogin: (event: FormEvent) => void; onGoogleUser: (user: UserProfile) => void; onError: (message: string) => void; error: string }) {
  const googleRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!GOOGLE_CLIENT_ID || !googleRef.current) return; const render = () => { if (!window.google || !googleRef.current) return; window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: async ({ credential }) => { try { const response = await fetch(`${API_BASE}/api/auth/google`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credential }) }); if (!response.ok) throw new Error(); onGoogleUser((await response.json() as { user: UserProfile }).user); } catch { onError("Google sign-in could not be completed."); } } }); window.google.accounts.id.renderButton(googleRef.current, { theme: "outline", size: "large", text: "signin_with", shape: "rectangular", width: "230" }); }; const script = document.createElement("script"); script.src = "https://accounts.google.com/gsi/client"; script.async = true; script.onload = render; document.head.appendChild(script); return () => script.remove(); }, [onGoogleUser, onError]);
  return <div className="login-page"><form className="login-card" onSubmit={onLogin}><h1>Login</h1>{GOOGLE_CLIENT_ID ? <div ref={googleRef} className="google-login" /> : <button type="button" className="google-fallback" onClick={onLogin}><span>G</span>Login with Google</button>}<div className="or-divider"><span>or sign up through email</span></div><label>Email ID<input type="email" placeholder="Email ID" required /></label><label>Password<input type="password" placeholder="Password" required /></label>{error && <p className="form-error">{error}</p>}<button className="login-button">Login</button></form></div>;
}

function EmailRow({ email, folder, onOpen }: { email: EmailRecord; folder: Folder; onOpen: () => void }) {
  return <button className="email-row" onClick={onOpen}><span className="row-to">To: {email.recipient}</span>{folder === "scheduled" && <span className="date-pill">◷ {formatDate(email.scheduledFor)}</span>}<strong>{email.batch.subject}</strong><span className="preview">- {email.batch.body || "Hi there, just wanted to follow up on our meeting..."}</span><Star size={15} className="star" /></button>;
}

function ComposeScreen({ form, setForm, fileName, recipients, readLeadFile, onBack, onSubmit, saving, showSendLater, setShowSendLater }: { form: ComposeForm; setForm: (form: ComposeForm) => void; fileName: string; recipients: string[]; readLeadFile: (event: ChangeEvent<HTMLInputElement>) => void; onBack: () => void; onSubmit: (event: FormEvent) => void; saving: boolean; showSendLater: boolean; setShowSendLater: (show: boolean) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  return <div className="compose-page"><header className="compose-header"><button onClick={onBack} className="back-button"><ArrowLeft size={18} />Compose New Email</button><div className="compose-actions"><button aria-label="Attach file" onClick={() => fileRef.current?.click()}><Paperclip size={18} /></button><button aria-label="Schedule send" onClick={() => setShowSendLater(!showSendLater)}><Clock3 size={18} /></button><button className="send-button" onClick={() => void onSubmit(new Event("submit") as unknown as FormEvent)}>Send</button></div></header><form className="compose-form" onSubmit={onSubmit}><div className="compose-fields"><label>From <span className="from-pill">oliver.brown@domain.io <ChevronDown size={14} /></span></label><label>To <input placeholder="recipient@example.com" /></label><label>Subject <input value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} placeholder="Subject" /></label><div className="compose-controls"><label>Delay between 2 emails <input type="number" min={0} value={form.delaySeconds} onChange={(event) => setForm({ ...form, delaySeconds: Number(event.target.value) })} /></label><label>Hourly Limit <input type="number" min={1} value={form.hourlyLimit} onChange={(event) => setForm({ ...form, hourlyLimit: Number(event.target.value) })} /></label></div></div><div className="editor"><div className="toolbar">↶　↷　|　Tᵀ　⌄　 <b>B</b>　<i>I</i>　<u>U</u>　☷　☷　❝　▤</div><textarea value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} placeholder="Type Your Reply..." /></div><label className="lead-upload" onClick={() => fileRef.current?.click()}><Upload size={16} /><span>{fileName || "Upload lead list (.csv or .txt)"}</span><small>{recipients.length ? `${recipients.length} email addresses detected` : "Required for scheduling"}</small><input ref={fileRef} type="file" accept=".csv,.txt" onChange={readLeadFile} /></label><input type="datetime-local" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} className="hidden-date" />{showSendLater && <div className="send-later"><strong>Send Later</strong><label>Pick date & time<input type="datetime-local" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} /></label><button type="button" onClick={() => setShowSendLater(false)}>Done</button></div>}<button className="mobile-send" disabled={saving}>{saving ? "Scheduling..." : "Schedule emails"}</button></form></div>;
}

function DetailScreen({ email, onBack }: { email: EmailRecord; onBack: () => void }) { return <div className="detail-page"><header className="detail-header"><button onClick={onBack} className="back-button"><ArrowLeft size={18} />{email.batch.subject}</button><div><Star size={17} /><Trash2 size={17} /></div></header><article className="message"><div className="message-meta"><span className="sender-avatar">{initials(email.recipient)}</span><div><strong>Amanda Clark</strong><span>&lt;sender@example.com&gt;</span><small>to me⌄</small></div><time>{formatDate(email.sentAt || email.scheduledFor)}</time></div><div className="message-body"><p>Hey Oliver,</p><p>{email.batch.body || "You've just RECEIVED something"}</p><blockquote>⚡ <b>Extremely Exclusive—Only 4 Spots Worldwide Per Year | $25,000 investment</b> ⚡<br />⚡ To explore securing your private transformation, simply reply right now with <b>“FLY OUT FIX”</b> ⚡</blockquote><p>Your coach for world-class performance,</p><p>Grant</p><em>P.S. Always remember you can develop world class technique! 🚀</em><div className="attachments"><div>Tennis_Coach_Profile.png<small>1.2 MB</small></div><div>Tennis_Coach_Profile2.png<small>1.2 MB</small></div></div></div></article></div>; }
