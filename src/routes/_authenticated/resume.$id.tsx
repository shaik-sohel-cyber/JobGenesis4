import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { processResume } from "@/lib/resume.functions";
import { startInterview } from "@/lib/interview.functions";
import { ROLE_GROUPS, suggestRoles } from "@/lib/roles";
import { AppHeader } from "@/components/AppHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDate } from "@/lib/format";
import { AnalyzingExperience } from "@/components/AnalyzingExperience";
import { SKILL_CATEGORY_LABELS, type SkillCategory } from "@/services/resumeAnalyzer/schema";

export const Route = createFileRoute("/_authenticated/resume/$id")({
  head: () => ({
    meta: [
      { title: "Resume analysis — JobGenesis" },
      { name: "description", content: "Your structured candidate profile from your resume." },
      { property: "og:title", content: "Resume analysis — JobGenesis" },
      {
        property: "og:description",
        content: "Your structured candidate profile from your resume.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResumeDetail,
});


function useResumeData(id: string) {
  return useQuery({
    queryKey: ["resume", id],
    queryFn: async () => {
      const [resume, skills, projects, experience, education, certifications, achievements, claims] =
        await Promise.all([
          supabase.from("resumes").select("*").eq("id", id).maybeSingle(),
          supabase.from("resume_skills").select("*").eq("resume_id", id),
          supabase.from("resume_projects").select("*").eq("resume_id", id),
          supabase.from("resume_experience").select("*").eq("resume_id", id),
          supabase.from("resume_education").select("*").eq("resume_id", id),
          supabase.from("resume_certifications").select("*").eq("resume_id", id),
          supabase.from("resume_achievements").select("*").eq("resume_id", id),
          supabase.from("resume_claims").select("*").eq("resume_id", id),
        ]);
      if (resume.error) throw resume.error;
      return {
        resume: resume.data,
        skills: skills.data ?? [],
        projects: projects.data ?? [],
        experience: experience.data ?? [],
        education: education.data ?? [],
        certifications: certifications.data ?? [],
        achievements: achievements.data ?? [],
        claims: claims.data ?? [],
      };
    },
    refetchInterval: (query) =>
      query.state.data?.resume?.status === "processing" ||
      query.state.data?.resume?.status === "uploaded"
        ? 2000
        : false,
  });
}

function ResumeDetail() {
  const { id } = Route.useParams();
  const { data, isLoading, isError } = useResumeData(id);
  const queryClient = useQueryClient();
  const run = useServerFn(processResume);
  const started = useRef(false);
  const [retrying, setRetrying] = useState(false);

  const resume = data?.resume;
  const status = resume?.status;

  const processing = status === "uploaded" || status === "processing";
  const [theaterVisible, setTheaterVisible] = useState(processing);
  useEffect(() => {
    if (processing) {
      setTheaterVisible(true);
      return;
    }
    if (!theaterVisible) return;
    // Let the theater fade out before unmounting when analysis completes.
    const timer = setTimeout(() => setTheaterVisible(false), 450);
    return () => clearTimeout(timer);
  }, [processing, theaterVisible]);

  useEffect(() => {
    if (status !== "uploaded" || started.current) return;
    started.current = true;
    run({ data: { resumeId: id } })
      .catch(() => undefined)
      .finally(() => {
        queryClient.invalidateQueries({ queryKey: ["resume", id] });
        queryClient.invalidateQueries({ queryKey: ["resumes"] });
      });
  }, [status, id, run, queryClient]);

  async function retry() {
    setRetrying(true);
    started.current = true;
    try {
      await run({ data: { resumeId: id } });
    } catch {
      /* status row carries the human-readable error */
    } finally {
      setRetrying(false);
      queryClient.invalidateQueries({ queryKey: ["resume", id] });
      queryClient.invalidateQueries({ queryKey: ["resumes"] });
    }
  }

  return (
    <div className="min-h-screen bg-surface">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-5 py-10">
        <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to dashboard
        </Link>

        {isLoading ? (
          <div className="mt-8 h-40 animate-pulse rounded-2xl bg-secondary" />
        ) : isError || !resume ? (
          <p className="mt-8 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            We couldn't find this resume.
          </p>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="truncate font-display text-3xl font-semibold">
                  {resume.file_name}
                </h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Uploaded {formatDate(resume.created_at)}
                </p>
              </div>
              <StatusBadge status={resume.status} />
            </div>

            {theaterVisible ? (
              <div className={processing ? "" : "jg-theater-exit"}>
                <AnalyzingExperience stage={resume.stage ?? null} />
              </div>
            ) : null}

            {resume.status === "failed" ? (
              <div className="mt-8 rounded-2xl border border-destructive/30 bg-destructive/5 p-6">
                <h2 className="font-display text-lg font-semibold">Analysis didn't finish</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {resume.error_message ?? "Something went wrong. Please try again."}
                </p>
                <button
                  type="button"
                  onClick={retry}
                  disabled={retrying}
                  className="mt-5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                >
                  {retrying ? "Retrying…" : "Try again"}
                </button>
              </div>
            ) : null}

            {resume.status === "completed" && data ? (
              <div className="jg-fade-up">
                <StartInterviewCard
                  resumeId={resume.id}
                  resumeText={JSON.stringify([data.skills, data.projects, data.experience])}
                />
                <Analysis data={{ ...data, resume }} />
              </div>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}

function StartInterviewCard({ resumeId, resumeText }: { resumeId: string; resumeText: string }) {
  const start = useServerFn(startInterview);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [role, setRole] = useState("");
  const [jd, setJd] = useState("");
  const suggested = suggestRoles(resumeText);
  async function go() {
    setBusy(true);
    setErr(null);
    const r = await start({
      data: { resumeId, targetRole: role.trim() || undefined, jobDescription: jd.trim() || undefined },
    });
    if (r.ok) navigate({ to: "/interview/$id", params: { id: r.interviewId } });
    else {
      setErr(r.message);
      setBusy(false);
    }
  }
  return (
    <section className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <h2 className="font-display text-lg font-semibold">Ready for your interview?</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        A voice interview tailored to this resume. Optionally tell us the role you're aiming for and the interview will
        focus on it.
      </p>

      <div className="mt-5 grid gap-4">
        <div>
          <label htmlFor="target-role" className="text-sm font-medium">
            Target role <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          {suggested.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Suggested for you:</span>
              {suggested.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setRole(s)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${role === s ? "border-primary bg-primary/10 text-foreground" : "border-border hover:bg-secondary"}`}
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}
          <input
            id="target-role"
            list="role-options"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            maxLength={80}
            placeholder="Search or type a role, e.g. Frontend Developer"
            className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <datalist id="role-options">
            {ROLE_GROUPS.flatMap((g) => g.roles.map((r) => <option key={r.name} value={r.name} label={g.group} />))}
          </datalist>
        </div>
        <div>
          <label htmlFor="jd" className="text-sm font-medium">
            Job description <span className="font-normal text-muted-foreground">(optional — paste the company's posting)</span>
          </label>
          <textarea
            id="jd"
            value={jd}
            onChange={(e) => setJd(e.target.value)}
            maxLength={8000}
            rows={4}
            placeholder="Paste the requirements and responsibilities here…"
            className="mt-2 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {err ? <p className="mt-3 text-sm text-destructive">{err}</p> : null}
      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={go}
          disabled={busy}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {busy ? "Starting…" : "Start AI Interview"}
        </button>
      </div>
    </section>
  );
}


type Row = Record<string, unknown>;

function Analysis({
  data,
}: {
  data: {
    resume: Row & { parsed_profile: unknown };
    skills: Row[];
    projects: Row[];
    experience: Row[];
    education: Row[];
    certifications: Row[];
    achievements: Row[];
    claims: Row[];
  };
}) {
  const profile = (data.resume.parsed_profile ?? {}) as {
    candidate?: Record<string, string | null>;
  };
  const candidate = profile.candidate ?? {};
  const skillsByCategory = groupBy(data.skills, (s) => String(s["category"] ?? "other"));

  return (
    <div className="mt-8 space-y-5">
      <Section title="Candidate overview">
        <dl className="grid gap-4 sm:grid-cols-2">
          {[
            ["Name", candidate["name"]],
            ["Email", candidate["email"]],
            ["Phone", candidate["phone"]],
            ["Location", candidate["location"]],
            ["LinkedIn", candidate["linkedin"]],
            ["GitHub", candidate["github"]],
            ["Portfolio", candidate["portfolio"]],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <dt className="text-xs tracking-wide text-muted-foreground uppercase">{label}</dt>
              <dd className="mt-0.5 text-sm break-words">
                {value ? String(value) : <span className="text-muted-foreground">Not listed</span>}
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="Education" empty={data.education.length === 0}>
        <ul className="space-y-4">
          {data.education.map((e, i) => (
            <li key={i} className="border-l-2 border-border pl-4">
              <p className="text-sm font-medium">{String(e["institution"])}</p>
              <p className="text-sm text-muted-foreground">
                {[e["degree"], e["field"]].filter(Boolean).join(" · ") || "—"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {[dateRange(e), e["grade"]].filter(Boolean).join(" · ")}
              </p>
              {e["description"] ? (
                <p className="mt-1.5 text-sm text-muted-foreground">{String(e["description"])}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Technical skills" empty={data.skills.length === 0}>
        <div className="space-y-5">
          {Object.entries(skillsByCategory).map(([category, items]) => (
            <div key={category}>
              <h3 className="text-xs tracking-wide text-muted-foreground uppercase">
                {SKILL_CATEGORY_LABELS[category as SkillCategory] ?? category}
              </h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {items.map((s, i) => (
                  <span
                    key={i}
                    title={s["proficiency_claim"] ? String(s["proficiency_claim"]) : undefined}
                    className="rounded-lg border border-border bg-background px-2.5 py-1 text-sm"
                  >
                    {String(s["name"])}
                    {s["proficiency_claim"] ? (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        {String(s["proficiency_claim"])}
                      </span>
                    ) : null}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Projects" empty={data.projects.length === 0}>
        <ul className="space-y-5">
          {data.projects.map((p, i) => (
            <li key={i} className="rounded-xl border border-border bg-background p-4">
              <p className="font-display text-sm font-semibold">{String(p["name"])}</p>
              {p["description"] ? (
                <p className="mt-1.5 text-sm text-muted-foreground">{String(p["description"])}</p>
              ) : null}
              <Chips items={p["technologies"]} />
              <BulletList label="Responsibilities" items={p["responsibilities"]} />
              <BulletList label="Achievements" items={p["achievements"]} />
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Experience" empty={data.experience.length === 0}>
        <ul className="space-y-5">
          {data.experience.map((e, i) => (
            <li key={i} className="border-l-2 border-border pl-4">
              <p className="text-sm font-medium">
                {String(e["role"])} · {String(e["company"])}
              </p>
              <p className="text-xs text-muted-foreground">
                {[dateRange(e), e["employment_type"]].filter(Boolean).join(" · ")}
              </p>
              {e["description"] ? (
                <p className="mt-1.5 text-sm text-muted-foreground">{String(e["description"])}</p>
              ) : null}
              <Chips items={e["technologies"]} />
              <BulletList label="Responsibilities" items={e["responsibilities"]} />
              <BulletList label="Achievements" items={e["achievements"]} />
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Certifications" empty={data.certifications.length === 0}>
        <ul className="space-y-3">
          {data.certifications.map((c, i) => (
            <li key={i}>
              <p className="text-sm font-medium">{String(c["name"])}</p>
              <p className="text-xs text-muted-foreground">
                {[c["issuer"], c["date"], c["credential_id"]].filter(Boolean).join(" · ") || "—"}
              </p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Achievements" empty={data.achievements.length === 0}>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          {data.achievements.map((a, i) => (
            <li key={i}>{String(a["text"])}</li>
          ))}
        </ul>
      </Section>

      <Section title="Resume claims" empty={data.claims.length === 0}>
        <p className="-mt-1 mb-4 text-sm text-muted-foreground">
          These are the specific statements your resume makes. In a later phase, your AI interview
          will use them to shape follow-up questions — so they are worth being ready to talk through
          in depth.
        </p>
        <ul className="space-y-3">
          {data.claims.map((c, i) => (
            <li key={i} className="rounded-xl border border-border bg-background p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm font-medium">{String(c["claim"])}</p>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
                  {String(c["claim_type"]).replace(/_/g, " ")}
                </span>
              </div>
              {c["evidence"] ? (
                <p className="mt-2 border-l-2 border-accent/40 pl-3 text-sm text-muted-foreground italic">
                  “{String(c["evidence"])}”
                </p>
              ) : null}
              <p className="mt-2 text-xs text-muted-foreground">
                {[c["related_project"], c["related_skill"]].filter(Boolean).join(" · ")}
                {c["related_project"] || c["related_skill"] ? " · " : ""}
                Likely follow-up depth: {String(c["verification_priority"])}
              </p>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
  empty = false,
}: {
  title: string;
  children: React.ReactNode;
  empty?: boolean;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <h2 className="mb-4 font-display text-lg font-semibold">{title}</h2>
      {empty ? (
        <p className="text-sm text-muted-foreground">Nothing listed in your resume for this.</p>
      ) : (
        children
      )}
    </section>
  );
}

function Chips({ items }: { items: unknown }) {
  const list = asList(items);
  if (list.length === 0) return null;
  return (
    <div className="mt-2.5 flex flex-wrap gap-1.5">
      {list.map((t, i) => (
        <span key={i} className="rounded-md bg-secondary px-2 py-0.5 text-xs">
          {t}
        </span>
      ))}
    </div>
  );
}

function BulletList({ label, items }: { label: string; items: unknown }) {
  const list = asList(items);
  if (list.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="text-xs tracking-wide text-muted-foreground uppercase">{label}</p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        {list.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function asList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function dateRange(row: Row): string {
  const start = row["start_date"];
  const end = row["end_date"];
  if (!start && !end) return "";
  return `${start ?? "—"} – ${end ?? "Present"}`;
}

function groupBy<T>(items: T[], key: (item: T) => string): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const k = key(item);
    (acc[k] ??= []).push(item);
    return acc;
  }, {});
}
