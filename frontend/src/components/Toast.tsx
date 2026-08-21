import { useEffect, useRef, useState } from "react";
import { CheckCircle2, X } from "lucide-react";

interface ToastProps {
  message: string;
  onClose: () => void;
  duration?: number;
}

export function Toast({ message, onClose, duration = 4200 }: ToastProps) {
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
      className={`toast ${closing ? "toast-closing" : ""}`}
      role="status"
      aria-live="polite"
      onMouseEnter={pauseTimer}
      onMouseLeave={startTimer}
    >
      <CheckCircle2 size={18} aria-hidden="true" />
      <span>{message}</span>
      <button type="button" aria-label="Close notification" onClick={dismiss}><X size={16} /></button>
    </div>
  );
}
