import { useEffect, useState } from "react";

const STAGE_KEYS = ["extracting", "analyzing", "saving"] as const;
const STAGE_LABELS = ["Reading your file", "Analyzing your resume", "Building your profile"];

/**
 * Playful rotating commentary, grouped by the real backend stage so lines stay
 * roughly truthful. They never claim specific findings — no invented skills,
 * no fake "found 12 projects" counts.
 */
const COMMENTARY: readonly (readonly string[])[] = [
  [
    "Opening your file…",
    "Reading between the lines…",
    "Decoding the hieroglyphs…",
    "Warming up the reading glasses…",
  ],
  [
    "Counting your buzzwords (there are many)…",
    "Locating the part where you saved the day…",
    "Giving your projects a slow, appreciative nod…",
    "Cross-checking your claims like a detective…",
    "Impressed. Pretending not to be…",
  ],
  [
    "Polishing your profile…",
    "Folding everything neatly into place…",
    "Almost there — straightening the tie…",
  ],
];

const SCAN_SECONDS = 3.2;

/** Stylized resume lines; each lights up in turn as the scanner beam passes. */
const DOC_LINES: ReadonlyArray<{ w: string; strong?: boolean; gap?: boolean }> = [
  { w: "42%", strong: true },
  { w: "26%" },
  { w: "84%", gap: true },
  { w: "78%" },
  { w: "88%" },
  { w: "64%" },
  { w: "30%", strong: true, gap: true },
  { w: "82%" },
  { w: "74%" },
  { w: "86%" },
  { w: "56%" },
];

const CHIPS = ["2.5rem", "3.5rem", "2rem", "3rem"];

/**
 * The "analysis theater" shown while a resume is processing: a live scanner
 * document, witty rotating commentary, and a stage-reactive glow. Driven
 * entirely by the real backend stage — no timers fake the progress.
 */
export function AnalyzingExperience({ stage }: { stage: string | null }) {
  const raw = stage ? STAGE_KEYS.indexOf(stage as (typeof STAGE_KEYS)[number]) : -1;
  const stageIndex = raw < 0 ? 0 : raw;
  const lines: readonly string[] = COMMENTARY[stageIndex] ?? COMMENTARY[0]!;
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setTick(0);
    const timer = setInterval(() => setTick((t) => t + 1), 3000);
    return () => clearInterval(timer);
  }, [stageIndex]);

  const line = lines[tick % lines.length] ?? "Working on it…";
  const progress = ((stageIndex + 0.5) / STAGE_KEYS.length) * 100;
  const orbDuration = stageIndex === 0 ? "10s" : stageIndex === 1 ? "5s" : "2.8s";
  const orbOpacity = stageIndex === 0 ? 0.55 : stageIndex === 1 ? 0.8 : 1;

  return (
    <section className="mt-8 overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
      <div className="grid items-center gap-8 p-7 sm:grid-cols-[220px_1fr] sm:p-8">
        {/* Scanner document with glow orb behind it */}
        <div className="relative mx-auto w-full max-w-[220px]">
          <div aria-hidden className="absolute -inset-10">
            <div
              className="jg-orb-layer absolute top-1/2 left-1/2 size-40 rounded-full"
              style={{
                animationDuration: orbDuration,
                opacity: orbOpacity,
                background:
                  "radial-gradient(circle, color-mix(in oklab, var(--accent) 38%, transparent), transparent 70%)",
              }}
            />
            <div
              className="jg-orb-layer jg-orb-reverse absolute top-1/2 left-1/2 size-56 rounded-full"
              style={{
                animationDuration: orbDuration,
                opacity: orbOpacity * 0.6,
                background:
                  "radial-gradient(circle, color-mix(in oklab, var(--primary) 22%, transparent), transparent 70%)",
              }}
            />
          </div>

          <div className="relative overflow-hidden rounded-xl border border-border bg-background p-4 shadow-[var(--shadow-card)]">
            <div className="space-y-2">
              {DOC_LINES.map((l, i) => (
                <div
                  key={i}
                  className={`jg-doc-line rounded-full ${l.strong ? "h-2.5" : "h-1.5"} ${l.gap ? "mt-4" : ""}`}
                  style={{
                    width: l.w,
                    animationDelay: `${((i / DOC_LINES.length) * SCAN_SECONDS).toFixed(2)}s`,
                  }}
                />
              ))}
              <div className="mt-4 flex gap-1.5">
                {CHIPS.map((w, i) => (
                  <div
                    key={i}
                    className="jg-doc-line h-3.5 rounded-full"
                    style={{
                      width: w,
                      animationDelay: `${(((DOC_LINES.length + i) / (DOC_LINES.length + CHIPS.length)) * SCAN_SECONDS).toFixed(2)}s`,
                    }}
                  />
                ))}
              </div>
            </div>
            <div
              aria-hidden
              className="jg-beam pointer-events-none absolute inset-x-0 top-0 h-16"
              style={{
                background:
                  "linear-gradient(to bottom, transparent, color-mix(in oklab, var(--accent) 22%, transparent), transparent)",
                animationDuration: `${SCAN_SECONDS}s`,
              }}
            />
          </div>
        </div>

        {/* Commentary + honest stage progress */}
        <div className="flex flex-col justify-center">
          <h2 className="font-display text-lg font-semibold">Analyzing your resume</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            This usually takes under a minute. You can leave this page open.
          </p>

          <p
            key={`${stageIndex}-${tick % lines.length}`}
            aria-live="polite"
            className="jg-commentary mt-6 min-h-6 font-display text-base font-medium text-accent"
          >
            {line}
          </p>

          <div className="mt-6">
            <div className="relative h-1.5 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-accent transition-all duration-700 ease-out"
                style={{ width: `${progress}%` }}
              />
              <div
                aria-hidden
                className="jg-shimmer absolute inset-y-0 w-1/3 rounded-full"
                style={{
                  background:
                    "linear-gradient(to right, transparent, color-mix(in oklab, var(--accent) 45%, transparent), transparent)",
                }}
              />
            </div>
            <ol className="mt-3 flex flex-wrap justify-between gap-2 text-xs">
              {STAGE_LABELS.map((label, i) => (
                <li
                  key={label}
                  className={`flex items-center gap-1.5 ${
                    i < stageIndex
                      ? "text-success"
                      : i === stageIndex
                        ? "font-medium text-foreground"
                        : "text-muted-foreground"
                  }`}
                >
                  <span
                    className={`size-1.5 rounded-full ${
                      i < stageIndex
                        ? "bg-success"
                        : i === stageIndex
                          ? "animate-pulse bg-accent"
                          : "bg-border"
                    }`}
                  />
                  {label}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
