export const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

export const USER_STORAGE_KEY = "reachinbox-user";
export const AUTH_TOKEN_STORAGE_KEY = "reachinbox-google-token";
export const THEME_STORAGE_KEY = "reachinbox-theme";

export function readStoredSession(key: string): string | null {
  const persistent = localStorage.getItem(key);
  if (persistent) return persistent;

  // Migrate users from the previous tab-only session storage behavior.
  const legacy = sessionStorage.getItem(key);
  if (legacy) localStorage.setItem(key, legacy);
  return legacy;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function initials(value: string): string {
  return value
    .split(/[ @.]/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function saveGoogleSession(user: object, token: string): void {
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  sessionStorage.removeItem(USER_STORAGE_KEY);
  sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
}

export function clearGoogleSession(): void {
  localStorage.removeItem(USER_STORAGE_KEY);
  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  sessionStorage.removeItem(USER_STORAGE_KEY);
  sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
}

export function blankForm() {
  const localDate = new Date(Date.now() + 15 * 60_000);
  const offsetMinutes = localDate.getTimezoneOffset();
  // Adjust time by subtracting offset to construct ISO format in local time
  const localIso = new Date(localDate.getTime() - offsetMinutes * 60 * 1000)
    .toISOString()
    .slice(0, 16);
  return {
    subject: "",
    body: "",
    startTime: localIso,
    delaySeconds: 2,
    hourlyLimit: 200,
  };
}

export function plainTextFromHtml(value: string): string {
  const document = new DOMParser().parseFromString(value, "text/html");
  return (document.body.innerText || document.body.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
