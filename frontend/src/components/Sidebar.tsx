import { ChevronDown, Clock3, LogOut, Moon, Send, Sun } from "lucide-react";
import { useState } from "react";
import type { Folder } from "../types";

interface SidebarProps {
  user: { name: string; email: string; avatarUrl?: string | null };
  folder: Folder;
  scheduledCount: number;
  sentCount: number;
  setFolder: (folder: Folder) => void;
  onCompose: () => void;
  darkMode: boolean;
  onToggleTheme: () => void;
  onLogout: () => void;
}

export function Sidebar({
  folder,
  user,
  scheduledCount,
  sentCount,
  setFolder,
  onCompose, darkMode, onToggleTheme, onLogout,
}: SidebarProps) {
  const [accountOpen, setAccountOpen] = useState(false);

  return (
    <aside className="sidebar-light">
      <div className="logo">ONB</div>
      <button type="button" className="sidebar-account" aria-expanded={accountOpen} onClick={() => setAccountOpen((current) => !current)}>
        <span className="profile-avatar">{user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : user.name.slice(0, 2).toUpperCase()}</span>
        <span><strong>{user.name}</strong><small>{user.email}</small></span>
        <ChevronDown className="sidebar-account-chevron" size={17} />
      </button>
      {accountOpen ? <div className="sidebar-account-menu"><strong>{user.name}</strong><small>{user.email}</small></div> : null}
      <button className="outline-compose" onClick={onCompose}>
        Compose
      </button>

      <span className="sidebar-section-label">CORE</span>

      <button
        className={`side-link ${folder === "scheduled" ? "selected" : ""}`}
        onClick={() => setFolder("scheduled")}
      >
        <Clock3 size={15} />
        Scheduled <b aria-label={`${scheduledCount} scheduled emails`}>{scheduledCount}</b>
      </button>

      <button
        className={`side-link ${folder === "sent" ? "selected" : ""}`}
        onClick={() => setFolder("sent")}
      >
        <Send size={15} />
        Sent <b aria-label={`${sentCount} sent emails`}>{sentCount}</b>
      </button>

      <button type="button" className="sidebar-theme-toggle" aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"} onClick={onToggleTheme}>
        {darkMode ? <Sun size={15} /> : <Moon size={15} />}
        <span>{darkMode ? "Light mode" : "Dark mode"}</span>
      </button>
      <button type="button" className="sidebar-logout-toggle" aria-label="Log out" onClick={onLogout}>
        <LogOut size={15} />
        <span>Log out</span>
      </button>
    </aside>
  );
}
