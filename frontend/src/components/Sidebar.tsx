import { Clock3, Send } from "lucide-react";
import type { Folder } from "../types";

interface SidebarProps {
  folder: Folder;
  scheduledCount: number;
  sentCount: number;
  setFolder: (folder: Folder) => void;
  onCompose: () => void;
}

export function Sidebar({
  folder,
  scheduledCount,
  sentCount,
  setFolder,
  onCompose,
}: SidebarProps) {
  return (
    <aside className="sidebar-light">
      <div className="logo">ONG</div>
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
    </aside>
  );
}
