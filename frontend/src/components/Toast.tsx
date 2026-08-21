import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Trash2, X } from "lucide-react";

interface ToastProps {
  title: string;
  message: string;
  kind?: "success" | "error" | "warning";
  onClose: () => void;
  duration?: number;
}

export function Toast({ title, message, kind = "success", onClose, duration = 4200 }: ToastProps) {
  const [closing, setClosing] = useState(false);
  const timerRef = useRef<number | null>(null);

  function dismiss() {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 220);
  }

  function startTimer() {
    if (closing || timerRef.current !== null) return;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      dismiss();
    }, duration);
  }

  function pauseTimer() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  useEffect(() => {
    startTimer();
    return pauseTimer;
  }, [duration]);

  return (
    <div
      className={`toast toast-${kind} ${closing ? "toast-closing" : ""}`}
      role={kind === "error" ? "alert" : "status"}
      aria-live="polite"
      onMouseEnter={pauseTimer}
      onMouseLeave={startTimer}
    >
      <span className="toast-icon">{kind === "error" ? <AlertCircle size={25} aria-hidden="true" /> : kind === "warning" ? <Trash2 size={25} aria-hidden="true" /> : <CheckCircle2 size={25} aria-hidden="true" />}</span>
      <span className="toast-copy"><strong>{title}</strong><span>{message}</span></span>
      <button type="button" aria-label="Close notification" onClick={dismiss}><X size={16} /></button>
    </div>
  );
}
