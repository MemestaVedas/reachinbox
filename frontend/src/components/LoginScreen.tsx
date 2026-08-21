import { useEffect, useRef } from "react";
import { Moon, Sun } from "lucide-react";
import type { FormEvent } from "react";
import type { UserProfile } from "../types";
import { API_BASE, GOOGLE_CLIENT_ID } from "../utils";

interface LoginScreenProps {
  onLogin: (event: FormEvent) => void;
  onGoogleUser: (user: UserProfile, token: string) => void;
  onError: (message: string) => void;
  error: string;
  darkMode: boolean;
  onToggleTheme: () => void;
}

export function LoginScreen({ onLogin, onGoogleUser, onError, error, darkMode, onToggleTheme }: LoginScreenProps) {
  const googleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !googleRef.current) return;

    const render = () => {
      if (!window.google || !googleRef.current || !GOOGLE_CLIENT_ID) return;

      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async ({ credential }) => {
          try {
            const response = await fetch(`${API_BASE}/api/auth/google`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ credential }),
            });
            if (!response.ok) throw new Error();
            onGoogleUser(
              (await response.json() as { user: UserProfile }).user,
              credential,
            );
          } catch {
            onError("Google sign-in could not be completed.");
          }
        },
      });

      window.google.accounts.id.renderButton(googleRef.current, {
        theme: "outline",
        size: "large",
        text: "signin_with",
        shape: "rectangular",
        width: "230",
      });
    };

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = render;
    document.head.appendChild(script);

    return () => script.remove();
  }, [onGoogleUser, onError]);

  return (
    <div className="login-page">
      <button type="button" className="theme-toggle login-theme-toggle" aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"} onClick={onToggleTheme}>
        {darkMode ? <Sun size={16} /> : <Moon size={16} />}
      </button>
      <form className="login-card" onSubmit={onLogin}>
        <h1>Login</h1>

        {GOOGLE_CLIENT_ID ? (
          <div ref={googleRef} className="google-login" />
        ) : (
          <p className="form-error">
            Google OAuth is not configured. Set VITE_GOOGLE_CLIENT_ID to continue.
          </p>
        )}

        <div className="or-divider">
          <span>Google sign-in is required</span>
        </div>

        <label>
          Email ID
          <input type="email" placeholder="Email ID" disabled />
        </label>
        <label>
          Password
          <input type="password" placeholder="Password" disabled />
        </label>

        {error && <p className="form-error">{error}</p>}

        <button className="login-button" disabled={!GOOGLE_CLIENT_ID}>
          Login with Google
        </button>
      </form>
    </div>
  );
}
