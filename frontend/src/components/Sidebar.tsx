import { Clock3, Moon, Send, Sun } from "lucide-react";
import type { Folder } from "../types";

interface SidebarProps {
  folder: Folder;
  scheduledCount: number;
  sentCount: number;
  setFolder: (folder: Folder) => void;
  onCompose: () => void;
  darkMode: boolean;
  onToggleTheme: () => void;
}

export function Sidebar({
  folder,
  scheduledCount,
  sentCount,
  setFolder,
  onCompose, darkMode, onToggleTheme,
}: SidebarProps) {
  return (
    <aside className="sidebar-light">
      <div className="logo">ONG</div>
      <button className="outline-compose" onClick={onCompose}>
        Compose
      </button>

      <button
        className={`side-link ${folder === "scheduled" ? "selected" : ""}`}
        onClick={() => setFolder("scheduled")}
      >
        <Clock3 size={15} />
        Scheduled <b>{scheduledCount}</b>
      </button>
      <button type="button" className="sidebar-theme-toggle" aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"} onClick={onToggleTheme}>
        {darkMode ? <Sun size={15} /> : <Moon size={15} />}
        <span>{darkMode ? "Light mode" : "Dark mode"}</span>
      </button>

      <button
        className={`side-link ${folder === "sent" ? "selected" : ""}`}
        onClick={() => setFolder("sent")}
      >
        <Send size={15} />
        Sent <b>{sentCount}</b>
      </button>
    </aside>
  );
}
