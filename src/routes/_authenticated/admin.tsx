import { createFileRoute, Link } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { AiCapacity } from "@/components/AiCapacity";
import { AdminDiagnostics } from "@/components/AdminDiagnostics";
import { getAdminOverview } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin — JobGenesis" },
      { name: "description", content: "JobGenesis admin overview of users and AI capacity." },
      { property: "og:title", content: "Admin — JobGenesis" },
      {
        property: "og:description",
        content: "JobGenesis admin overview of users and AI capacity.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: () => getAdminOverview(),
  errorComponent: () => (
    <div className="p-10 text-center text-sm text-muted-foreground">
      Couldn't load the admin page.
    </div>
  ),
  notFoundComponent: () => <div className="p-10 text-center">Not found</div>,
  component: Admin,
});

function fmt(d: string | null) {
  return d
    ? new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "Never";
}

function Admin() {
  const data = Route.useLoaderData();
  return (
    <div className="min-h-screen bg-surface">
      <AppHeader />
      <main className="mx-auto max-w-5xl space-y-8 px-5 py-10">
        {!data.authorized ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <h1 className="font-display text-xl font-semibold">Admins only</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This page isn't available for your account.
            </p>
            <Link to="/dashboard" className="mt-4 inline-block text-sm font-medium text-accent">
              Back to dashboard
            </Link>
          </div>
        ) : (
          <>
            <div>
              <h1 className="font-display text-2xl font-semibold">Admin</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {data.users.length} registered users
              </p>
            </div>
            <section className="overflow-x-auto rounded-2xl border border-border bg-card">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Signed up</th>
                    <th className="px-4 py-3">Last sign-in</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((u) => (
                    <tr key={u.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium">{u.fullName || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                      <td className="px-4 py-3">{fmt(u.createdAt)}</td>
                      <td className="px-4 py-3">{fmt(u.lastSignInAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)] sm:p-6">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="font-display text-xl font-semibold">User feedback</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Latest {data.feedback.length} submissions, newest first.
                  </p>
                </div>
                <a
                  className="text-sm font-medium text-primary hover:underline"
                  href="mailto:jobgenesisai@gmail.com"
                >
                  jobgenesisai@gmail.com
                </a>
              </div>
              {data.feedback.length ? (
                <ul className="mt-5 space-y-3">
                  {data.feedback.map((item) => (
                    <li key={item.id} className="rounded-xl border border-border bg-background p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className="font-medium text-amber-500"
                            aria-label={`${item.rating} out of 5 stars`}
                          >
                            {"★".repeat(item.rating)}
                            {"☆".repeat(5 - item.rating)}
                          </span>
                          <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">
                            {feedbackFeature(item.feature)}
                          </span>
                          <span className="rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground">
                            {feedbackCategory(item.category)}
                          </span>
                        </div>
                        <time className="text-xs text-muted-foreground" dateTime={item.createdAt}>
                          {fmt(item.createdAt)}
                        </time>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{item.message}</p>
                      {item.contactEmail ? (
                        <a
                          className="mt-3 inline-block text-xs font-medium text-primary hover:underline"
                          href={`mailto:${item.contactEmail}`}
                        >
                          Reply to {item.contactEmail}
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-5 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  No feedback submissions yet.
                </p>
              )}
            </section>
            <AiCapacity />
            <AdminDiagnostics />
          </>
        )}
      </main>
    </div>
  );
}

function feedbackFeature(feature: string) {
  return (
    {
      resume_analysis: "Resume Analysis",
      ai_interview: "AI Interview",
      interview_report: "Interview Report",
      other: "Other",
    }[feature] ?? feature
  );
}

function feedbackCategory(category: string) {
  return (
    {
      general: "General Feedback",
      bug: "Bug Report",
      feature_request: "Feature Request",
      performance_voice: "Performance / Voice Issue",
    }[category] ?? category
  );
}
