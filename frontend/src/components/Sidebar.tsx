import { Clock3, LogOut, Moon, Send, Sun } from "lucide-react";
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
  return (
    <aside className="sidebar-light">
      <div className="logo">ONG</div>
      <div className="sidebar-account">
        <span className="profile-avatar">{user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : user.name.slice(0, 2).toUpperCase()}</span>
        <span><strong>{user.name}</strong><small>{user.email}</small></span>
      </div>
      <button className="outline-compose" onClick={onCompose}>
        Compose
      </button>

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
