import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Wordmark } from "@/components/brand";
import { displayNameOf, useSession } from "@/hooks/useSession";

export function AppHeader({ variant = "app" }: { variant?: "app" | "public" }) {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Wordmark to={user ? "/dashboard" : "/"} />

        {loading ? null : user ? (
          <div className="relative flex items-center gap-2">
            {variant === "app" ? (
              <Link
                to="/dashboard"
                className="hidden rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
                activeProps={{ className: "text-foreground" }}
              >
                Dashboard
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-2 rounded-full border border-border bg-card py-1 pr-3 pl-1 text-sm transition-colors hover:bg-secondary"
              aria-haspopup="menu"
              aria-expanded={open}
            >
              <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {displayNameOf(user).charAt(0).toUpperCase()}
              </span>
              <span className="max-w-32 truncate">{displayNameOf(user)}</span>
            </button>
            {open ? (
              <>
                <button
                  type="button"
                  aria-label="Close menu"
                  className="fixed inset-0 z-10 cursor-default"
                  onClick={() => setOpen(false)}
                />
                <div className="absolute top-12 right-0 z-20 w-52 rounded-xl border border-border bg-popover p-1.5 shadow-[var(--shadow-lift)]">
                  <div className="px-2.5 py-2">
                    <p className="truncate text-sm font-medium">{displayNameOf(user)}</p>
                    <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                  </div>
                  <div className="my-1 h-px bg-border" />
                  <Link
                    to="/settings"
                    onClick={() => setOpen(false)}
                    className="block rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-secondary"
                  >
                    Profile & settings
                  </Link>
                  <Link
                    to="/feedback"
                    onClick={() => setOpen(false)}
                    className="block rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-secondary"
                  >
                    Share feedback
                  </Link>
                  <button
                    type="button"
                    onClick={signOut}
                    className="block w-full rounded-lg px-2.5 py-2 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
                  >
                    Log out
                  </button>
                </div>
              </>
            ) : null}
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <Link
              to="/login"
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Log in
            </Link>
            <Link
              to="/signup"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Get started
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
