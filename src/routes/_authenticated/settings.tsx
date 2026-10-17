import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { AiCapacity } from "@/components/AiCapacity";
import { useSession } from "@/hooks/useSession";
import { services } from "@/services";
import { voiceConfig, providerNames } from "@/services/voiceEngine/voiceConfig";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Profile & settings — JobGenesis" },
      { name: "description", content: "Manage your JobGenesis profile and account." },
      { property: "og:title", content: "Profile & settings — JobGenesis" },
      { property: "og:description", content: "Manage your JobGenesis profile and account." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Settings,
});

function Settings() {
  const { user } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [status, setStatus] = useState<{ kind: "ok" | "error"; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        const meta = user.user_metadata as { full_name?: string } | undefined;
        setFullName(data?.full_name ?? meta?.full_name ?? "");
      });
    return () => {
      active = false;
    };
  }, [user]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    setStatus(null);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim() || null })
      .eq("id", user.id);
    if (!error) await supabase.auth.updateUser({ data: { full_name: fullName.trim() } });
    setBusy(false);
    setStatus(
      error
        ? { kind: "error", message: "We couldn't save your changes. Please try again." }
        : { kind: "ok", message: "Saved." },
    );
  }

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  }

  return (
    <div className="min-h-screen bg-surface">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-5 py-10">
        <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to dashboard
        </Link>
        <h1 className="mt-4 font-display text-3xl font-semibold">Profile & settings</h1>

        <section className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
          <h2 className="font-display text-lg font-semibold">Your details</h2>
          <form onSubmit={save} className="mt-5 space-y-4">
            <label className="block">
              <span className="text-sm font-medium">Full name</span>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <div>
              <span className="text-sm font-medium">Email</span>
              <p className="mt-1.5 rounded-lg border border-border bg-secondary px-3 py-2.5 text-sm text-muted-foreground">
                {user?.email}
              </p>
            </div>
            {status ? (
              <p
                className={`text-sm ${status.kind === "ok" ? "text-success" : "text-destructive"}`}
              >
                {status.message}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save changes"}
            </button>
          </form>
        </section>

        <section className="mt-5 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
          <h2 className="font-display text-lg font-semibold">What's available</h2>
          <ul className="mt-4 space-y-2.5">
            {services.map((s) => (
              <li key={s.key} className="flex items-start justify-between gap-3 text-sm">
                <div>
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{s.summary}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    s.status === "available"
                      ? "bg-success/15 text-success"
                      : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {s.status === "available" ? "Available" : "Coming soon"}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <VoiceServices />

        <AiCapacity />

        <section className="mt-5 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
          <h2 className="font-display text-lg font-semibold">Account</h2>
          <button
            type="button"
            onClick={signOut}
            className="mt-4 rounded-lg border border-destructive/40 px-4 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
          >
            Log out
          </button>
        </section>
      </main>
    </div>
  );
}

function VoiceServices() {
  const [enabled, setEnabled] = useState<{ tts: Record<string, boolean>; stt: Record<string, boolean> } | null>(null);
  useEffect(() => {
    fetch("/api/voice/providers").then((r) => (r.ok ? r.json() : null)).then(setEnabled).catch(() => {});
  }, []);
  const groups = [
    { title: "Interviewer voice", ids: voiceConfig.ttsOrder, map: enabled?.tts },
    { title: "Speech-to-text", ids: voiceConfig.sttOrder, map: enabled?.stt },
  ];
  return (
    <section className="mt-5 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <h2 className="font-display text-lg font-semibold">Voice services</h2>
      <p className="mt-1 text-xs text-muted-foreground">Used in this order. If one fails, the next one takes over.</p>
      {groups.map((g) => (
        <div key={g.title} className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{g.title}</p>
          <ul className="mt-2 space-y-1.5">
            {g.ids.map((id, i) => {
              const on = !!g.map?.[id];
              return (
                <li key={id} className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    {i + 1}. {providerNames[id]}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      on ? "bg-success/15 text-success" : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {enabled ? (on ? "Active" : "Needs key") : "…"}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
