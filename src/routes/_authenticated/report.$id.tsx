import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { generateReport, getReport, setReportSharing, type ReportView, type ShareResult } from "@/lib/report.functions";
import { cameraLabel } from "@/services/reportGenerator/types";

export const Route = createFileRoute("/_authenticated/report/$id")({
  head: () => ({
    meta: [
      { title: "Interview report — JobGenesis" },
      { name: "description", content: "Evidence-based summary of a JobGenesis AI interview." },
      { property: "og:title", content: "Interview report — JobGenesis" },
      { property: "og:description", content: "Evidence-based summary of a JobGenesis AI interview." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportPage,
});

function ReportPage() {
  const { id } = Route.useParams();
  const get = useServerFn(getReport);
  const gen = useServerFn(generateReport);
  const [view, setView] = useState<ReportView | null>(null);
  const [busy, setBusy] = useState(false);
  const [share, setShare] = useState<ShareResult | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const shareToggle = useServerFn(setReportSharing);
  const started = useRef(false);
  const [shareLink, setShareLink] = useState("");
  const [shareError, setShareError] = useState<string | null>(null);

  const run = async (force = false) => {
    setBusy(true);
    try { setView(await gen({ data: { interviewId: id, force } })); } finally { setBusy(false); }
  };

  const toggleShare = async (shared: boolean) => {
    setShareBusy(true);
    setShareError(null);
    try {
      const res = await shareToggle({ data: { interviewId: id, shared } });
      setShare(res);
      setShareLink(res.token ? `${window.location.origin}/share/report/${res.token}` : "");
      setCopied(false);
    } catch (e) {
      setShareError(e instanceof Error ? e.message : "Sharing couldn't be updated. Please try again.");
    } finally {
      setShareBusy(false);
    }
  };

  useEffect(() => {
    get({ data: { interviewId: id } }).then((v) => {
      setView(v);
      if (v.state === "ready") {
        setShare({ shared: v.shared, token: v.shareToken });
        setShareLink(v.shareToken ? `${window.location.origin}/share/report/${v.shareToken}` : "");
      }
      if ((v.state === "pending" && !v.message) && !started.current) { started.current = true; void run(); }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!view || busy || (view.state === "pending")) {
    return <Shell><p className="text-muted-foreground">Preparing your report… this takes a few seconds.</p></Shell>;
  }
  if (view.state === "not_found") return <Shell><p>We couldn't find that interview.</p></Shell>;
  if (view.state === "not_ready") return <Shell><p>The report becomes available once the interview is completed.</p></Shell>;
  if (view.state === "failed") {
    return (
      <Shell>
        <p className="text-muted-foreground">{view.message ?? "The report couldn't be generated."}</p>
        <button onClick={() => run(true)} className="mt-4 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">Try again</button>
      </Shell>
    );
  }

  if (view.state !== "ready") return null;
  const { summary, data } = view;
  return (
    <Shell>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Interview report</p>
          <h1 className="font-display text-2xl font-semibold">{data.candidateName ?? "Candidate"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.resumeName} · {new Date(data.startedAt).toLocaleDateString()}
            {data.durationMinutes ? ` · ${data.durationMinutes} min` : ""} · {data.questionCount} questions · Camera {data.cameraUsed ? "on" : "off"}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <button onClick={() => run(true)} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-secondary">Regenerate</button>
          <button onClick={() => window.print()} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">Download PDF</button>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-border bg-card p-4 print:hidden">
        {share?.shared && share.token && shareLink ? (
          <>
            <p className="text-sm font-medium">This report is publicly shared.</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Anyone with this link sees a read-only scorecard — no transcript, resume details or session notes.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                readOnly
                value={shareLink}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Share link"
                className="min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-1.5 text-xs"
              />
              <button
                onClick={() => void navigator.clipboard.writeText(shareLink).then(() => setCopied(true)).catch(() => {})}
                className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-secondary"
              >
                {copied ? "Copied" : "Copy link"}
              </button>
              <a
                href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareLink)}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Share on LinkedIn
              </a>
              <button
                disabled={shareBusy}
                onClick={() => void toggleShare(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Stop sharing
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Share a clean scorecard — no transcript, resume details or session notes — with a private link.
            </p>
            <button
              disabled={shareBusy}
              onClick={() => void toggleShare(true)}
              className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-secondary"
            >
              Create share link
            </button>
          </div>
        )}
        {shareError ? <p className="mt-2 text-xs text-destructive">{shareError}</p> : null}
      </div>

      <Section title="Summary">
        <span className="mb-3 inline-block rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium">Evidence level: {summary.evidenceLevel}</span>
        <p className="text-sm leading-relaxed">{summary.overview}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <List title="Strengths shown" items={summary.strengths} />
          <List title="Worth exploring further" items={summary.areasToExplore} />
        </div>
      </Section>

      {data.roleFit && data.roleFit.length > 0 && (
        <Section title={`Role fit${data.targetRole ? ` — ${data.targetRole}` : ""}`}>
          <p className="mb-3 text-xs text-muted-foreground">
            Key skills for this role{data.hasJobDescription ? " (from the job description)" : ""}, marked only by what was said in the interview.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {data.roleFit.map((r) => (
              <li key={r.skill} className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm">
                <span className="font-medium">{r.skill}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${r.status === "Demonstrated" ? "bg-accent/15 text-accent" : r.status === "Partially shown" ? "bg-secondary" : "text-muted-foreground"}`}>{r.status}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {data.evidence.length > 0 && (
        <Section title="Skill and project evidence">
          <ul className="space-y-3">
            {data.evidence.map((e, i) => (
              <li key={i} className="rounded-xl border border-border p-3 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="font-medium">{[e.skill, e.project].filter(Boolean).join(" · ") || "General"}</span>
                  <span className="shrink-0 text-xs capitalize text-muted-foreground">{e.strength}</span>
                </div>
                <p className="mt-1 text-muted-foreground">{e.evidence}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {data.claims.length > 0 && (
        <Section title="Resume claim checks">
          <ul className="space-y-3">
            {data.claims.map((c, i) => (
              <li key={i} className="rounded-xl border border-border p-3 text-sm">
                <p className="font-medium">{c.claim}</p>
                <p className="mt-1 text-xs text-muted-foreground">{c.status} · confidence {c.confidence}%</p>
                {c.unanswered.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Open questions: {c.unanswered.join("; ")}</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Question-by-question">
        <ol className="space-y-4">
          {data.questions.map((q) => (
            <li key={q.id} className="break-inside-avoid rounded-xl border border-border p-3 text-sm">
              <p className="text-xs text-muted-foreground">Q{q.sequence}{q.isFollowUp ? " · follow-up" : ""} · {q.category}{q.quality ? ` · answer ${q.quality}` : ""}{q.responseSeconds ? ` · ${q.responseSeconds}s` : ""}</p>
              <p className="mt-1 font-medium">{q.question}</p>
              <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{q.answer ?? "No answer recorded."}</p>
              {q.notes && <p className="mt-2 text-xs text-muted-foreground">{q.notes}</p>}
              {q.camera.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">Camera: {q.camera.map((c) => `${cameraLabel(c.type)} (~${c.seconds}s)`).join(", ")}</p>
              )}
            </li>
          ))}
        </ol>
      </Section>

      {data.integrity && (
        <Section title="Session activity">
          <p className="mb-3 text-xs text-muted-foreground">Plain facts recorded during the interview. They have many ordinary causes and are not judgments about honesty.</p>
          <ul className="space-y-1 text-sm">
            <li>Left the interview tab: {data.integrity.tabSwitches}×{data.integrity.tabSwitches ? ` · about ${data.integrity.tabAwaySeconds}s in total` : ""}</li>
            <li>Switched to another window: {data.integrity.windowBlurs}×{data.integrity.windowBlurs ? ` · about ${data.integrity.windowAwaySeconds}s in total` : ""}</li>
            <li>Text pasted: {data.integrity.pastes}×{data.integrity.pastes ? ` · ${data.integrity.pastedChars} characters` : ""}</li>
          </ul>
        </Section>
      )}

      {data.cameraUsed && (
        <Section title="Camera observations">
          <p className="mb-3 text-xs text-muted-foreground">These are observable events only. They are not judgments about feelings, honesty or ability, and can have ordinary causes such as lighting or room setup.</p>
          {data.cameraTotals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No notable camera events were recorded.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {data.cameraTotals.map((t) => (
                <li key={t.type}>{cameraLabel(t.type)}: {t.count}× · about {t.seconds}s in total</li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link to="/dashboard" className="mb-6 inline-block text-sm text-muted-foreground hover:text-foreground print:hidden">← Dashboard</Link>
      {children}
    </main>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 break-inside-avoid">
      <h2 className="mb-3 font-display text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}
function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
      <ul className="list-disc space-y-1 pl-4 text-sm">{items.length ? items.map((s, i) => <li key={i}>{s}</li>) : <li>None noted</li>}</ul>
    </div>
  );
}
