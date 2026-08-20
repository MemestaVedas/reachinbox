import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Clock3,
  FileText,
  Inbox,
  LayoutGrid,
  LoaderCircle,
  LogOut,
  Mail,
  Menu,
  MoreHorizontal,
  Plus,
  Send,
  Settings2,
  Sparkles,
  Upload,
  Users,
  X,
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

type Status = "pending" | "processing" | "sent" | "failed";
type View = "scheduled" | "sent";

interface EmailRecord {
  id: string;
  recipient: string;
  scheduledFor: string;
  sentAt?: string | null;
  status: Status;
  batch: { subject: string; body: string };
}

interface ComposeForm {
  subject: string;
  body: string;
  startTime: string;
  delaySeconds: number;
  hourlyLimit: number;
}

interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: { client_id: string; callback: (response: { credential: string }) => void }) => void;
          renderButton: (element: HTMLElement, options: Record<string, string>) => void;
        };
      };
    };
  }
}

const sampleScheduled: EmailRecord[] = [
  { id: "1", recipient: "maya@northstar.studio", scheduledFor: "2026-08-20T14:15:00Z", status: "pending", batch: { subject: "A sharper launch plan", body: "" } },
  { id: "2", recipient: "hello@orbitlabs.io", scheduledFor: "2026-08-20T14:18:00Z", status: "processing", batch: { subject: "A sharper launch plan", body: "" } },
  { id: "3", recipient: "devon@atelier.co", scheduledFor: "2026-08-20T14:21:00Z", status: "pending", batch: { subject: "A sharper launch plan", body: "" } },
];

const sampleSent: EmailRecord[] = [
  { id: "4", recipient: "jules@fieldnotes.design", scheduledFor: "2026-08-20T11:15:00Z", sentAt: "2026-08-20T11:15:03Z", status: "sent", batch: { subject: "Your Q3 field guide", body: "" } },
  { id: "5", recipient: "sam@commonroom.fm", scheduledFor: "2026-08-20T10:50:00Z", sentAt: "2026-08-20T10:50:04Z", status: "sent", batch: { subject: "Your Q3 field guide", body: "" } },
  { id: "6", recipient: "lee@modemarket.com", scheduledFor: "2026-08-20T10:30:00Z", status: "failed", batch: { subject: "A note on momentum", body: "" } },
];

const blankForm = (): ComposeForm => ({
  subject: "",
  body: "",
  startTime: new Date(Date.now() + 15 * 60_000).toISOString().slice(0, 16),
  delaySeconds: 2,
  hourlyLimit: 200,
});

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function StatusBadge({ status }: { status: Status }) {
  const label = status === "processing" ? "In progress" : status[0].toUpperCase() + status.slice(1);
  return <span className={`status status-${status}`}><span className="status-dot" />{label}</span>;
}

export function App() {
  const [authUser, setAuthUser] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem("reachinbox-user");
    return saved ? JSON.parse(saved) as UserProfile : null;
  });
  const [view, setView] = useState<View>("scheduled");
  const [scheduled, setScheduled] = useState<EmailRecord[]>(sampleScheduled);
  const [sent, setSent] = useState<EmailRecord[]>(sampleSent);
  const [loading, setLoading] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);
  const [form, setForm] = useState<ComposeForm>(blankForm);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const activeRows = view === "scheduled" ? scheduled : sent;
  const queueCount = scheduled.filter((email) => email.status === "pending").length;
  const deliveredCount = sent.filter((email) => email.status === "sent").length;
  const activeLabel = view === "scheduled" ? "scheduled" : "sent";
  const displayUser: UserProfile = authUser ?? { id: "preview", name: "Kushal Shah", email: "kushal@example.com" };

  async function loadEmails() {
    setLoading(true);
    try {
      const [scheduledResponse, sentResponse] = await Promise.all([
        fetch(`${API_BASE}/api/emails?status=pending`),
        fetch(`${API_BASE}/api/emails?status=sent`),
      ]);
      if (!scheduledResponse.ok || !sentResponse.ok) throw new Error("API unavailable");
      const scheduledData = await scheduledResponse.json() as { emails: EmailRecord[] };
      const sentData = await sentResponse.json() as { emails: EmailRecord[] };
      setScheduled(scheduledData.emails);
      setSent(sentData.emails);
      setError("");
    } catch {
      setError("Showing preview data. Connect the API to see live delivery activity.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadEmails();
  }, []);

  const recipientSummary = useMemo(() => {
    if (!recipients.length) return "No leads added yet";
    return `${recipients.length} valid email${recipients.length === 1 ? "" : "s"} detected`;
  }, [recipients.length]);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const found = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
    setRecipients([...new Set(found.map((email) => email.toLowerCase()))]);
    setFileName(file.name);
  }

  async function scheduleBatch(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!form.subject.trim() || !form.body.trim() || recipients.length === 0) {
      setError("Add a subject, message, and a lead file before scheduling.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE}/api/batches`, {
        method: "POST",
            headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID(), ...(authUser ? { "X-User-Id": authUser.id } : {}) },
        body: JSON.stringify({
          subject: form.subject,
          body: form.body,
          recipients,
          startTime: new Date(form.startTime).toISOString(),
          delayMs: form.delaySeconds * 1_000,
          hourlyLimit: form.hourlyLimit,
        }),
      });
      if (!response.ok) throw new Error("Schedule failed");
      setNotice(`${recipients.length} emails added to the queue.`);
      setComposeOpen(false);
      setForm(blankForm());
      setRecipients([]);
      setFileName("");
      await loadEmails();
    } catch {
      setError("Could not schedule this batch. Check that the API and database are running.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><Sparkles size={16} /></span><span>reach<span>inbox</span></span></div>
        <button className="workspace-switcher"><span className="workspace-avatar">R</span><span className="workspace-copy"><strong>ReachInbox</strong><small>Personal workspace</small></span><ChevronDown size={15} /></button>
        <nav className="main-nav" aria-label="Main navigation">
          <p className="nav-label">Workspace</p>
          <button className="nav-item active"><LayoutGrid size={17} />Overview</button>
          <button className="nav-item"><Send size={17} />Sequences<span className="nav-count">3</span></button>
          <button className="nav-item"><Users size={17} />Audience</button>
          <button className="nav-item"><Inbox size={17} />Inbox<span className="nav-count accent">8</span></button>
          <p className="nav-label spaced">Manage</p>
          <button className="nav-item"><Settings2 size={17} />Settings</button>
        </nav>
        <div className="sidebar-bottom"><div className="usage-head"><span>Monthly volume</span><strong>64%</strong></div><div className="usage-bar"><span /></div><p>1,284 of 2,000 sends used</p><button className="upgrade-button">Upgrade plan <ArrowUpRight size={14} /></button></div>
      </aside>

      <main className="main-content">
        <header className="topbar"><button className="mobile-menu" aria-label="Open menu"><Menu size={20} /></button><div className="breadcrumb"><span>Workspace</span><span>/</span><strong>Overview</strong></div><div className="topbar-actions"><button className="icon-button" aria-label="Open notifications"><Mail size={18} /></button>{GOOGLE_CLIENT_ID && !authUser ? <GoogleAuthButton onUser={(user) => { setAuthUser(user); setError(""); }} onError={setError} /> : <div className="user-menu"><div className="user-avatar">{displayUser.avatarUrl ? <img src={displayUser.avatarUrl} alt="" /> : initials(displayUser.name)}</div><div className="user-copy"><strong>{displayUser.name}</strong><span>{displayUser.email}</span></div>{authUser ? <button className="icon-button" aria-label="Log out" onClick={() => { localStorage.removeItem("reachinbox-user"); setAuthUser(null); }}><LogOut size={15} /></button> : <ChevronDown size={15} />}</div>}</div></header>
        <div className="content-wrap">
          <section className="page-heading"><div><p className="eyebrow">Wednesday, August 20, 2026</p><h1>Good morning, Kushal <span>✦</span></h1><p className="heading-subtitle">Here’s the pulse of your outbound engine.</p></div><button className="primary-button" onClick={() => { setError(""); setComposeOpen(true); }}><Plus size={18} />Compose new email</button></section>
          {error && <div className="notice notice-error"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error"><X size={16} /></button></div>}
          {notice && <div className="notice notice-success"><Check size={16} /><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss notice"><X size={16} /></button></div>}
          <section className="metrics-grid"><Metric icon={<Send size={16} />} label="Emails in queue" value={String(queueCount).padStart(2, "0")} detail="Ready to dispatch" tone="lime" /><Metric icon={<Check size={16} />} label="Delivered today" value={String(deliveredCount).padStart(2, "0")} detail="+18% vs last week" tone="blue" /><Metric icon={<Clock3 size={16} />} label="Avg. delivery time" value="02:14" detail="Per email" tone="orange" /><Metric icon={<Users size={16} />} label="Active leads" value="1,842" detail="Across 3 sequences" tone="purple" /></section>
          <section className="activity-panel"><div className="panel-heading"><div><p className="eyebrow">Delivery center</p><h2>Outbound activity</h2></div><div className="heading-tools"><button className="subtle-button"><Clock3 size={15} />Last 7 days<ChevronDown size={14} /></button><button className="icon-button"><MoreHorizontal size={18} /></button></div></div><div className="chart-area"><div className="chart-y"><span>100</span><span>75</span><span>50</span><span>25</span><span>0</span></div><div className="chart"><div className="chart-grid"><i /><i /><i /><i /><i /></div><svg viewBox="0 0 760 170" preserveAspectRatio="none" aria-label="Email activity chart"><path className="chart-fill" d="M0,140 C55,136 75,105 125,116 S190,135 235,84 S295,105 330,91 S380,40 425,67 S475,96 515,43 S560,87 600,69 S650,50 690,65 S730,24 760,36 L760,170 L0,170 Z" /><path className="chart-line" d="M0,140 C55,136 75,105 125,116 S190,135 235,84 S295,105 330,91 S380,40 425,67 S475,96 515,43 S560,87 600,69 S650,50 690,65 S730,24 760,36" /></svg><div className="chart-x"><span>Aug 14</span><span>Aug 15</span><span>Aug 16</span><span>Aug 17</span><span>Aug 18</span><span>Aug 19</span><span>Aug 20</span></div></div><div className="chart-legend"><span><i className="legend-dot sent-dot" />Sent <strong>1,284</strong></span><span><i className="legend-dot open-dot" />Opened <strong>892</strong></span></div></div></section>
          <section className="table-panel"><div className="table-heading"><div className="tabs"><button className={view === "scheduled" ? "tab active" : "tab"} onClick={() => setView("scheduled")}>Scheduled <span>{scheduled.length}</span></button><button className={view === "sent" ? "tab active" : "tab"} onClick={() => setView("sent")}>Sent <span>{sent.length}</span></button></div><button className="subtle-button">View all <ArrowUpRight size={15} /></button></div><div className="table-scroll"><table><thead><tr><th>Recipient</th><th>Subject</th><th>{view === "scheduled" ? "Scheduled for" : "Sent at"}</th><th>Status</th><th /></tr></thead><tbody>{loading ? <tr><td colSpan={5} className="table-state"><LoaderCircle className="spin" size={20} />Loading activity</td></tr> : activeRows.length === 0 ? <tr><td colSpan={5} className="table-state"><span className="empty-icon"><Mail size={18} /></span>No {activeLabel} emails yet</td></tr> : activeRows.map((email) => <tr key={email.id}><td><div className="recipient"><span className="recipient-avatar">{initials(email.recipient.split("@")[0])}</span><span>{email.recipient}</span></div></td><td><span className="subject-cell">{email.batch.subject}</span></td><td><span className="date-cell">{formatDate(view === "sent" ? email.sentAt : email.scheduledFor)}</span></td><td><StatusBadge status={email.status} /></td><td><button className="row-menu" aria-label={`More options for ${email.recipient}`}><MoreHorizontal size={17} /></button></td></tr>)}</tbody></table></div></section>
        </div>
      </main>
      {composeOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setComposeOpen(false); }}><section className="compose-drawer" role="dialog" aria-modal="true" aria-labelledby="compose-title"><div className="drawer-header"><div><p className="eyebrow">New campaign</p><h2 id="compose-title">Compose email</h2></div><button className="icon-button" onClick={() => setComposeOpen(false)} aria-label="Close compose"><X size={19} /></button></div><form onSubmit={scheduleBatch}><label>Subject<input value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} placeholder="A thoughtful note for your next lead" /></label><label>Message<textarea value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} placeholder="Write something worth opening..." rows={5} /></label><div className="field-row"><label>Start time<input type="datetime-local" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} /></label><label>Delay (seconds)<input type="number" min={0} value={form.delaySeconds} onChange={(event) => setForm({ ...form, delaySeconds: Number(event.target.value) })} /></label></div><div className="field-row"><label>Hourly limit<input type="number" min={1} value={form.hourlyLimit} onChange={(event) => setForm({ ...form, hourlyLimit: Number(event.target.value) })} /></label><div className="field-spacer" /></div><div className="upload-zone" onClick={() => fileRef.current?.click()} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") fileRef.current?.click(); }}><input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} /><span className="upload-icon"><Upload size={18} /></span><div><strong>{fileName || "Upload your lead list"}</strong><small>{fileName ? recipientSummary : "CSV or TXT · email addresses are detected automatically"}</small></div><FileText size={18} className="upload-file" /></div><div className="recipient-count"><span><Users size={15} />{recipientSummary}</span>{recipients.length > 0 && <button type="button" onClick={() => { setRecipients([]); setFileName(""); }}>Clear</button>}</div><div className="drawer-footer"><button type="button" className="secondary-button" onClick={() => setComposeOpen(false)}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />}{saving ? "Scheduling..." : "Schedule emails"}</button></div></form></section></div>}
    </div>
  );
}

function GoogleAuthButton({ onUser, onError }: { onUser: (user: UserProfile) => void; onError: (message: string) => void }) {
  const buttonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !buttonRef.current) return;
    const render = () => {
      if (!window.google || !buttonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async ({ credential }) => {
          try {
            const response = await fetch(`${API_BASE}/api/auth/google`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credential }) });
            if (!response.ok) throw new Error("Google sign-in failed");
            const data = await response.json() as { user: UserProfile };
            localStorage.setItem("reachinbox-user", JSON.stringify(data.user));
            onUser(data.user);
          } catch {
            onError("Google sign-in could not be completed.");
          }
        },
      });
      window.google.accounts.id.renderButton(buttonRef.current, { theme: "outline", size: "medium", text: "signin_with", shape: "rectangular" });
    };
    const existing = document.getElementById("google-identity-script");
    if (existing) { render(); return; }
    const script = document.createElement("script");
    script.id = "google-identity-script";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = render;
    document.head.appendChild(script);
  }, [onError, onUser]);

  return <div ref={buttonRef} className="google-button" />;
}

function Metric({ icon, label, value, detail, tone }: { icon: React.ReactNode; label: string; value: string; detail: string; tone: string }) {
  return <article className="metric-card"><div className={`metric-icon ${tone}`}>{icon}</div><span className="metric-label">{label}</span><strong className="metric-value">{value}</strong><span className="metric-detail">{detail}</span></article>;
}
