import { useEffect, useState } from "react";
import { useSession } from "@/hooks/useSession";
import { Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Wordmark } from "@/components/brand";

function friendlyError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "That email and password combination doesn't match.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "An account already exists with this email. Try logging in instead.";
  if (m.includes("password")) return message;
  if (m.includes("rate") || m.includes("too many"))
    return "Too many attempts. Please wait a moment and try again.";
  return "We couldn't complete that. Please try again.";
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSignup = mode === "signup";
  const { user } = useSession();

  useEffect(() => {
    if (user) navigate({ to: "/dashboard", replace: true });
  }, [user, navigate]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (isSignup && password.length < 8) {
      setError("Please use a password with at least 8 characters.");
      return;
    }

    setBusy(true);
    try {
      const result = isSignup
        ? await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: window.location.origin,
              data: { full_name: fullName.trim() },
            },
          })
        : await supabase.auth.signInWithPassword({ email, password });

      if (result.error) {
        setError(friendlyError(result.error.message));
        return;
      }
      if (!result.data.session) {
        setError("Please confirm your email address, then log in.");
        return;
      }
      navigate({ to: "/dashboard", replace: true });
    } catch {
      setError("We couldn't reach the server. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    setError(null);
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      if (error) {
        console.error("[auth] Google sign-in failed", error);
        setError(error.message || "Google sign-in didn't complete. Please try again.");
      }
    } catch (error) {
      console.error("[auth] Google sign-in failed", error);
      setError("We couldn't reach the authentication server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <div className="mx-auto flex w-full max-w-6xl items-center px-5 py-6">
        <Wordmark />
      </div>

      <main className="flex flex-1 items-start justify-center px-5 pb-16">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-7 shadow-[var(--shadow-card)]">
          <h1 className="font-display text-2xl font-semibold">
            {isSignup ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {isSignup
              ? "Upload a resume and see exactly what it claims."
              : "Log in to pick up where you left off."}
          </p>

          <button
            type="button"
            onClick={onGoogle}
            disabled={busy}
            className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
              <path
                fill="currentColor"
                d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9Z"
              />
              <path
                fill="currentColor"
                d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24Z"
              />
              <path
                fill="currentColor"
                d="M5.4 14.4a7.2 7.2 0 0 1 0-4.6V6.7H1.4a12 12 0 0 0 0 10.8l4-3.1Z"
              />
              <path
                fill="currentColor"
                d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.7l4 3.1C6.3 6.9 8.9 4.8 12 4.8Z"
              />
            </svg>
            Continue with Google
          </button>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or with email
            <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            {isSignup ? (
              <Field
                label="Full name"
                type="text"
                value={fullName}
                onChange={setFullName}
                autoComplete="name"
                required
              />
            ) : null}
            <Field
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
              required
            />
            <Field
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete={isSignup ? "new-password" : "current-password"}
              required
            />

            {error ? (
              <p
                role="alert"
                className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium transition-colors hover:bg-secondary disabled:opacity-60"
            >
              {busy ? "Please wait…" : isSignup ? "Create account" : "Log in"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {isSignup ? (
              <>
                Already have an account?{" "}
                <Link to="/login" className="font-medium text-foreground hover:text-accent">
                  Log in
                </Link>
              </>
            ) : (
              <>
                New to JobGenesis?{" "}
                <Link to="/signup" className="font-medium text-foreground hover:text-accent">
                  Create an account
                </Link>
              </>
            )}
          </p>
        </div>
      </main>
    </div>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  autoComplete,
  required,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none transition-shadow focus:ring-2 focus:ring-ring"
      />
    </label>
  );
}
