import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { recordVisualEvents, setCameraConsent, upsertVisualSummary } from "@/lib/webcam.functions";
import type { CameraState } from "@/services/webcamAnalyzer/config";
import type { WebcamAnalyzer } from "@/services/webcamAnalyzer/webcamAnalyzer";

type Props = {
  interviewId: string;
  /** "consent" shows the choice card; "preview" shows the small corner preview. */
  view: "consent" | "preview" | "hidden";
  sessionState: string;
  questionId: string | null;
};

/** Optional camera layer. Every failure is swallowed so the voice interview is never affected. */
export function CameraAnalysis({ interviewId, view, sessionState, questionId }: Props) {
  const saveConsent = useServerFn(setCameraConsent);
  const record = useServerFn(recordVisualEvents);
  const summarize = useServerFn(upsertVisualSummary);
  const [choice, setChoice] = useState<"granted" | "declined" | null>(null);
  const [camera, setCamera] = useState<CameraState>("CAMERA_NOT_REQUESTED");
  const [analysis, setAnalysis] = useState<"active" | "idle" | "unavailable">("idle");
  const az = useRef<WebcamAnalyzer | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastQ = useRef<string | null>(null);

  const persist = (consent: "granted" | "declined" | null, state: CameraState) =>
    saveConsent({ data: { interviewId, consent, cameraState: state } }).catch(() => undefined);

  const flush = async () => {
    const a = az.current;
    if (!a) return;
    const events = a.drain();
    if (events.length) await record({ data: { interviewId, events: events.slice(0, 200) } }).catch(() => undefined);
  };
  const flushSummary = async (qid: string | null) => {
    const m = qid ? az.current?.metrics(qid) : null;
    if (qid && m) await summarize({ data: { interviewId, questionId: qid, metrics: m } }).catch(() => undefined);
  };

  async function enable() {
    setChoice("granted");
    try {
      if (!az.current) {
        const { WebcamAnalyzer } = await import("@/services/webcamAnalyzer/webcamAnalyzer");
        az.current = new WebcamAnalyzer();
        az.current.onChange((s) => {
          setCamera(s.camera);
          setAnalysis(s.analysis);
        });
      }
      az.current.sessionState = sessionState;
      az.current.questionId = questionId;
      const state = await az.current.start();
      void persist(state === "CAMERA_READY" ? "granted" : null, state);
    } catch {
      setCamera("CAMERA_ERROR");
      setAnalysis("unavailable");
    }
  }

  function decline() {
    setChoice("declined");
    az.current?.stop();
    void persist("declined", camera === "CAMERA_NOT_REQUESTED" ? "CAMERA_NOT_REQUESTED" : camera);
  }

  // Keep the analyzer in sync with the interview; flush per question.
  useEffect(() => {
    const a = az.current;
    if (!a) return;
    a.sessionState = sessionState;
    if (lastQ.current !== questionId) {
      const prev = lastQ.current;
      a.flushOpen();
      void flush().then(() => flushSummary(prev));
      lastQ.current = questionId;
    }
    a.questionId = questionId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionState, questionId]);

  useEffect(() => {
    const id = setInterval(() => void flush().then(() => flushSummary(lastQ.current)), 10000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      const a = az.current;
      if (!a) return;
      a.stop();
      const events = a.drain();
      if (events.length) void record({ data: { interviewId, events: events.slice(0, 200) } }).catch(() => undefined);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    if (videoRef.current && az.current?.stream && videoRef.current.srcObject !== az.current.stream) {
      videoRef.current.srcObject = az.current.stream;
      void videoRef.current.play().catch(() => undefined);
    }
  });

  const failed = camera === "CAMERA_DENIED" || camera === "CAMERA_UNAVAILABLE" || camera === "CAMERA_ERROR";

  if (view === "consent") {
    if (choice === "declined")
      return (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
          <span className="text-muted-foreground">Continuing without camera analysis.</span>
          <button onClick={() => void enable()} className="text-sm font-medium text-accent hover:underline">Enable camera</button>
        </div>
      );
    if (choice === "granted" && !failed)
      return (
        <div className="mb-4 flex items-center gap-4 rounded-xl border border-border bg-card p-3">
          <video ref={videoRef} muted playsInline className="h-20 w-28 -scale-x-100 rounded-lg bg-secondary object-cover" />
          <div className="text-sm">
            <p className="font-medium">{camera === "CAMERA_READY" ? "Camera is working" : "Requesting camera…"}</p>
            <p className="text-muted-foreground">Observations start only once the interview begins.</p>
            <button onClick={decline} className="mt-1 text-xs text-muted-foreground underline">Turn camera off</button>
          </div>
        </div>
      );
    return (
      <section className="mb-4 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <h2 className="font-display text-lg font-semibold">Camera analysis</h2>
        {failed ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {camera === "CAMERA_UNAVAILABLE" ? "No camera was found." : "Camera access was not enabled."} Your voice interview will continue normally.
          </p>
        ) : (
          <div className="mt-2 space-y-2 text-sm text-muted-foreground">
            <p>This interview may use your camera to note observable signals such as face visibility, gaze direction and head orientation.</p>
            <p>It does not determine emotions, honesty, personality, or whether you are telling the truth. Video stays on your device and is never uploaded.</p>
            <p>Camera analysis is used only as supporting interview information, and it's optional.</p>
          </div>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          <button onClick={() => void enable()} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            {failed ? "Try camera again" : "Enable camera analysis"}
          </button>
          <button onClick={decline} className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-secondary">
            Continue without camera
          </button>
        </div>
      </section>
    );
  }

  if (view !== "preview" || choice !== "granted") return null;
  const active = !failed && analysis === "active";
  return (
    <div className="fixed bottom-4 right-4 z-30 w-36 overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-card)] sm:w-44">
      {!failed ? <video ref={videoRef} muted playsInline className="aspect-[4/3] w-full -scale-x-100 bg-secondary object-cover" /> : null}
      <p className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] text-muted-foreground">
        <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-accent" : "bg-muted-foreground/50"}`} />
        {active ? "Camera analysis active" : "Camera analysis unavailable"}
      </p>
      {failed || analysis === "unavailable" ? (
        <p className="px-2 pb-2 text-[11px] text-muted-foreground">Camera analysis is temporarily unavailable. Your interview will continue.</p>
      ) : null}
    </div>
  );
}
