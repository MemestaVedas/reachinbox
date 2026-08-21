import { ChevronDown, Clock3, Send } from "lucide-react";
import type { Folder, UserProfile } from "../types";
import { initials } from "../utils";

interface SidebarProps {
  user: UserProfile;
  folder: Folder;
  scheduledCount: number;
  sentCount: number;
  setFolder: (folder: Folder) => void;
  onCompose: () => void;
  onLogout: () => void;
}

export function Sidebar({
  user,
  folder,
  scheduledCount,
  sentCount,
  setFolder,
  onCompose,
  onLogout,
}: SidebarProps) {
  return (
    <aside className="sidebar-light">
      <div className="logo">ONG</div>

      <button className="profile">
        <span className="profile-avatar">
          {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : initials(user.name)}
        </span>
        <span>
          <strong>{user.name}</strong>
          <small>{user.email}</small>
        </span>
        <ChevronDown size={14} />
      </button>

      <button className="outline-compose" onClick={onCompose}>
        Compose
      </button>

      <span className="overline sidebar-label">Core</span>

      <button
        className={`side-link ${folder === "scheduled" ? "selected" : ""}`}
        onClick={() => setFolder("scheduled")}
      >
        <Clock3 size={15} />
        Scheduled <b>{scheduledCount}</b>
      </button>

      <button
        className={`side-link ${folder === "sent" ? "selected" : ""}`}
        onClick={() => setFolder("sent")}
      >
        <Send size={15} />
        Sent <b>{sentCount}</b>
      </button>

      <button className="logout-link" onClick={onLogout}>
        Log out
      </button>
    </aside>
  );
}
