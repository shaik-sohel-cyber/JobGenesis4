import { createFileRoute, Link } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { useSession } from "@/hooks/useSession";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "JobGenesis — An AI interviewer that knows your resume" },
      {
        name: "description",
        content:
          "Upload your resume, then face a live AI voice interviewer that asks about your real projects and claims — and hands you a detailed report on how you held up.",
      },
      { property: "og:title", content: "JobGenesis — An AI interviewer that knows your resume" },
      {
        property: "og:description",
        content:
          "A live AI voice interview built from your actual resume. Practice for real, get an evidence-based report in 15 minutes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Landing,
});

const capabilities = [
  {
    title: "Resume Intelligence",
    body: "Your resume is read end to end and turned into a structured profile: skills, projects, experience, education and certifications.",
  },
  {
    title: "AI Voice Interview",
    body: "A live voice interviewer that opens with a hello, asks about the work on your resume, and adapts to how you answer. You can type instead, any time.",
  },
  {
    title: "Role & Job Description Matching",
    body: "Paste the job you're aiming for. The interview probes the exact skills that posting asks for — including ones your resume doesn't mention.",
  },
  {
    title: "Project Verification",
    body: "Go deeper on the projects you list, from architecture decisions to the trade-offs you made — at whatever depth you claim.",
  },
  {
    title: "Skill Validation",
    body: "Every claimed technology is put to the test at the depth you claimed it, with follow-ups that don't let vague answers slide.",
  },
  {
    title: "Detailed Interview Reports",
    body: "An evidence-based breakdown of how your answers stood up to what your resume promised — plus a shareable summary card.",
  },
];

function Landing() {
  const { user } = useSession();
  return (
    <div className="min-h-screen bg-background">
      <AppHeader variant="public" />

      <main>
        <section className="mx-auto max-w-6xl px-5 pt-20 pb-16 sm:pt-28">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <span className="size-1.5 rounded-full bg-accent" />
              Now live: AI voice interviews
            </span>
            <h1 className="text-balance-tight mt-6 font-display text-5xl leading-[1.05] font-semibold sm:text-6xl">
              Know Your Resume.
              <br />
              <span className="text-accent">Prove Your Skills.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Upload your resume, then sit down with an AI interviewer that has actually read it. It asks about your
              real projects, follows up where your answers are thin, and hands you a report on how you held up —
              before a real recruiter ever asks.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                to={user ? "/resume/upload" : "/signup"}
                className="rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Try the AI interview
              </Link>
              <Link
                to={user ? "/dashboard" : "/login"}
                className="rounded-lg border border-border bg-card px-5 py-3 text-sm font-medium transition-colors hover:bg-secondary"
              >
                {user ? "Go to dashboard" : "I already have an account"}
              </Link>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Free while in beta. PDF or Word, up to 10&nbsp;MB. Your resume stays private to your account.
            </p>
          </div>
        </section>

        <section className="border-t border-border bg-surface">
          <div className="mx-auto max-w-6xl px-5 py-20">
            <h2 className="font-display text-2xl font-semibold">What JobGenesis does</h2>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Everything here is live today — built around one idea: an interview that knows your resume as well as
              you pretend to.
            </p>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {capabilities.map((c) => (
                <article
                  key={c.title}
                  className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-display text-base font-semibold">{c.title}</h3>
                    <span className="shrink-0 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">
                      Available
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{c.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="font-display text-2xl font-semibold">How it works</h2>
          <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Upload", "Drop in your PDF or Word resume. It's stored privately to your account."],
              ["Analyze", "Your resume is read and turned into a structured candidate profile in about a minute."],
              ["Interview", "Talk to the AI voice interviewer — or type. Roughly 15 to 20 minutes, adaptive to your answers."],
              ["Report", "Get an evidence-based report: what held up, what didn't, and what to sharpen next."],
            ].map(([title, body], i) => (
              <li key={title} className="border-t-2 border-accent/50 pt-4">
                <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
                <h3 className="mt-1 font-display text-base font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} JobGenesis</p>
          <p>Resume intelligence for people who want to be ready.</p>
        </div>
      </footer>
    </div>
  );
}
