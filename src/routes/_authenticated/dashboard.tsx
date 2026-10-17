import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { displayNameOf, useSession } from "@/hooks/useSession";
import { useServerFn } from "@tanstack/react-start";
import { listInterviews } from "@/lib/interview.functions";
import { formatBytes, formatDate, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — JobGenesis" },
      { name: "description", content: "Your resumes and analysis activity on JobGenesis." },
      { property: "og:title", content: "Dashboard — JobGenesis" },
      { property: "og:description", content: "Your resumes and analysis activity on JobGenesis." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

function useResumes() {
  return useQuery({
    queryKey: ["resumes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resumes")
        .select("id, file_name, file_size, file_type, status, created_at, updated_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    refetchInterval: (query) =>
      (query.state.data ?? []).some((r) => r.status === "processing" || r.status === "uploaded")
        ? 4000
        : false,
  });
}

function Dashboard() {
  const { user } = useSession();
  const { data: resumes, isLoading, isError } = useResumes();
  const latest = resumes?.[0];

  return (
    <div className="min-h-screen bg-surface">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-5 py-10">
        <h1 className="font-display text-3xl font-semibold">
          Welcome back, {displayNameOf(user)}.
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Upload a resume and JobGenesis will map out everything it claims.
        </p>

        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] lg:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold">Your resume</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  PDF or Word documents up to 10&nbsp;MB.
                </p>
              </div>
              <Link
                to="/resume/upload"
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Upload resume
              </Link>
            </div>

            <div className="mt-6">
              {isLoading ? (
                <div className="h-20 animate-pulse rounded-xl bg-secondary" />
              ) : isError ? (
                <p className="text-sm text-destructive">
                  We couldn't load your resumes. Please refresh the page.
                </p>
              ) : !latest ? (
                <div className="rounded-xl border border-dashed border-border p-8 text-center">
                  <p className="text-sm font-medium">No resume yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Upload one to see your structured candidate profile.
                  </p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {resumes!.map((r) => (
                    <li key={r.id}>
                      <Link
                        to="/resume/$id"
                        params={{ id: r.id }}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3.5 transition-colors hover:bg-secondary"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{r.file_name}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {r.file_type.toUpperCase()} · {formatBytes(r.file_size)} · uploaded{" "}
                            {formatDate(r.created_at)}
                          </p>
                        </div>
                        <StatusBadge status={r.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <InterviewsCard />

        </div>

        <section className="mt-5 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
          <h2 className="font-display text-lg font-semibold">Recent activity</h2>
          {!resumes || resumes.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Nothing yet. Your uploads and analyses will appear here.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {resumes.slice(0, 5).map((r) => (
                <li key={r.id} className="flex items-start gap-3 text-sm">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
                  <span className="text-muted-foreground">
                    <span className="font-medium text-foreground">{r.file_name}</span>{" "}
                    {activityLabel(r.status)} · {formatDateTime(r.updated_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

function activityLabel(status: string): string {
  switch (status) {
    case "completed":
      return "was analyzed";
    case "processing":
      return "is being analyzed";
    case "failed":
      return "could not be analyzed";
    default:
      return "was uploaded";
  }
}

function InterviewsCard() {
  const list = useServerFn(listInterviews);
  const { data, isLoading } = useQuery({ queryKey: ["interviews"], queryFn: () => list() });
  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <h2 className="font-display text-lg font-semibold">AI Interviews</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Start one from any analyzed resume. Questions adapt to your answers.
      </p>
      <div className="mt-4">
        {isLoading ? (
          <div className="h-16 animate-pulse rounded-xl bg-secondary" />
        ) : !data || data.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            No interviews yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {data.map((i) => (
              <li key={i.id}>
                <Link
                  to={i.status === "completed" ? "/report/$id" : "/interview/$id"}
                  params={{ id: i.id }}
                  className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-sm transition-colors hover:bg-secondary"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{i.resumeName}</span>
                    <span className="text-xs text-muted-foreground">{formatDate(i.startedAt)}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
                    {i.status === "completed" ? "Completed" : i.status === "failed" ? "Needs retry" : "In progress"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
