import { createFileRoute, Link } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { getSharedReport, type SharedReport } from "@/lib/report.functions";

export const Route = createFileRoute("/share/report/$token")({
  head: () => ({
    meta: [
      { title: "Shared interview scorecard — JobGenesis" },
      {
        name: "description",
        content: "A shared, read-only summary of a JobGenesis AI interview: evidence level, strengths and areas to explore.",
      },
      { property: "og:title", content: "My AI interview scorecard — JobGenesis" },
      {
        property: "og:description",
        content: "I sat down with JobGenesis's AI interviewer — here's how it went. Run your own and see how you hold up.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  // The token is the only credential: the loader is public and returns a sanitized slice only.
  loader: async ({ params }) => getSharedReport({ data: { token: params.token } }),
  component: SharedReportPage,
});

function SharedReportPage() {
  const report = Route.useLoaderData() as SharedReport | null;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader variant="public" />
      <main className="mx-auto max-w-2xl px-5 py-12">
        {report ? (
          <article className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] sm:p-8">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">AI interview scorecard</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium">
                Evidence level: {report.evidenceLevel}
              </span>
              <span className="text-xs text-muted-foreground">
                {report.questionCount} questions
                {report.durationMinutes ? ` · ${report.durationMinutes} min voice interview` : ""}
              </span>
            </div>
            <p className="mt-5 text-sm leading-relaxed">{report.overview}</p>

            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Strengths shown</p>
                <ul className="list-disc space-y-1 pl-4 text-sm">
                  {report.strengths.length ? (
                    report.strengths.map((s, i) => <li key={i}>{s}</li>)
                  ) : (
                    <li>None noted</li>
                  )}
                </ul>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Worth exploring further
                </p>
                <ul className="list-disc space-y-1 pl-4 text-sm">
                  {report.areasToExplore.length ? (
                    report.areasToExplore.map((s, i) => <li key={i}>{s}</li>)
                  ) : (
                    <li>None noted</li>
                  )}
                </ul>
              </div>
            </div>

            {report.roleFit?.length ? (
              <div className="mt-6">
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Role skills</p>
                <ul className="flex flex-wrap gap-2">
                  {report.roleFit.map((r) => (
                    <li
                      key={r.skill}
                      className="flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs"
                    >
                      <span className="font-medium">{r.skill}</span>
                      <span className={r.status === "Demonstrated" ? "text-accent" : "text-muted-foreground"}>
                        {r.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <p className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
              Shared by the candidate. A read-only summary — transcripts, resume details and session notes stay private.
            </p>
          </article>
        ) : (
          <article className="rounded-2xl border border-border bg-card p-6 text-sm shadow-[var(--shadow-card)] sm:p-8">
            <p className="font-display text-base font-semibold">This scorecard isn't available</p>
            <p className="mt-1 text-muted-foreground">
              The link may be wrong, or the candidate has turned sharing off.
            </p>
          </article>
        )}

        <div className="mt-8 text-center">
          <p className="text-sm text-muted-foreground">Curious how you'd hold up?</p>
          <Link
            to="/signup"
            className="mt-3 inline-block rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Run your own AI interview
          </Link>
        </div>
      </main>
    </div>
  );
}
