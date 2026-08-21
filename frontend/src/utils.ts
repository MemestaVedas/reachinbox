export const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

export const USER_STORAGE_KEY = "reachinbox-user";
export const AUTH_TOKEN_STORAGE_KEY = "reachinbox-google-token";

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
  sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
}

export function clearGoogleSession(): void {
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
