import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { advanceInterview, getInterview, setSessionState, submitAnswer, type SessionState } from "@/lib/interview.functions";
import { detectMetaIntent } from "@/services/voiceEngine/intentDetector";
import { AppHeader } from "@/components/AppHeader";
import { STAGE_LABELS, type InterviewStage } from "@/services/interviewEngine/types";
import { VoiceProviderManager, type ProviderStatus } from "@/services/voiceEngine/voiceProviderManager";
import { Microphone, MIC_STORAGE_KEY, listMics, openMicStream } from "@/services/voiceEngine/microphone";
import { getInterviewCapacity, type InterviewCapacityView } from "@/lib/capacity.functions";
import { CameraAnalysis } from "@/components/CameraAnalysis";
import { useIntegrityMonitor } from "@/hooks/useIntegrityMonitor";

export const Route = createFileRoute("/_authenticated/interview/$id")({
  head: () => ({
    meta: [
      { title: "AI Voice Interview — JobGenesis" },
      { name: "description", content: "A personalised voice interview based on your analyzed resume." },
      { property: "og:title", content: "AI Voice Interview — JobGenesis" },
      { property: "og:description", content: "A personalised voice interview based on your analyzed resume." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InterviewPage,
});

/** Local screen, always derived from explicit transitions (never from on-screen text). */
type Stage = "device" | "resume" | "audio_check" | "confirm" | "audio_failed" | "confirmed" | "countdown" | "live" | "ended";
type LiveState = "ready" | "speaking" | "listening" | "processing" | "preparing" | "reconnecting" | "voice_lost" | "error";

const AUDIO_CHECK_TEXT = "Before we begin, I want to make sure you can hear me clearly. Can you hear me?";
const CONFIRM_TEXT = "Perfect. Let's begin.";

const LIVE_LABEL: Record<LiveState, string> = {
  ready: "Ready",
  speaking: "Speaking",
  listening: "Listening",
  processing: "Processing your answer",
  preparing: "Thinking",
  reconnecting: "Connection interrupted. Reconnecting…",
  voice_lost: "Voice connection lost",
  error: "Paused",
};

function InterviewPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const fetchInterview = useServerFn(getInterview);
  const advance = useServerFn(advanceInterview);
  const submit = useServerFn(submitAnswer);
  const setState = useServerFn(setSessionState);
  const fetchCapacity = useServerFn(getInterviewCapacity);
  const { data: iv, isLoading } = useQuery({
    queryKey: ["interview", id],
    queryFn: () => fetchInterview({ data: { interviewId: id } }),
  });

  const [stage, setStage] = useState<Stage | null>(null);
  useIntegrityMonitor(id, stage === "live" && iv?.status !== "completed", iv?.pendingQuestionId ?? null);
  const [live, setLive] = useState<LiveState>("ready");
  const [count, setCount] = useState(3);
  const [partial, setPartial] = useState("");
  const [pendingAnswer, setPendingAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [level, setLevel] = useState(0);
  const [provider, setProvider] = useState<ProviderStatus | null>(null);
  const [showTyping, setShowTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [locked, setLocked] = useState(false);
  const [micId, setMicId] = useState<string | null>(null);
  const [micNote, setMicNote] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [quiet, setQuiet] = useState(false);
  const [capacity, setCapacity] = useState<InterviewCapacityView | null>(null);
  useEffect(() => {
    let active = true;
    fetchCapacity().then((c) => {
      if (active) setCapacity(c);
    }).catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const micIdRef = useRef<string | null>(null);
  micIdRef.current = micId;
  const lastLoud = useRef(Date.now());

  useEffect(() => {
    try {
      setMicId(localStorage.getItem(MIC_STORAGE_KEY));
    } catch {
      /* storage unavailable */
    }
  }, []);

  async function chooseMic(next: string) {
    setMicId(next);
    setMicNote(null);
    try {
      localStorage.setItem(MIC_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    if (mic.current) {
      try {
        await mic.current.switchDevice(next);
        lastLoud.current = Date.now();
        setQuiet(false);
        if (mic.current.usedFallback) setMicNote("That microphone isn't available — using your default one.");
      } catch {
        setMicNote("We couldn't switch to that microphone. Try another one.");
      }
    }
  }

  // Hint when the chosen mic seems silent while we're waiting for an answer.
  useEffect(() => {
    if (stage !== "live" || live !== "listening" || muted) {
      setQuiet(false);
      return;
    }
    lastLoud.current = Date.now();
    const t = setInterval(() => setQuiet(Date.now() - lastLoud.current > 8000), 1000);
    return () => clearInterval(t);
  }, [stage, live, muted]);

  const ivRef = useRef(iv);
  ivRef.current = iv;
  const stageRef = useRef(stage);
  stageRef.current = stage;
  const mgr = useRef<VoiceProviderManager | null>(null);
  const mic = useRef<Microphone | null>(null);
  const spoken = useRef<Set<string>>(new Set());
  const busy = useRef(false);
  const shownAt = useRef(Date.now());
  const turnIds = useRef<Map<string, string>>(new Map());
  const transition = useRef(false);
  const resumed = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["interview", id] });
  const moveTo = (state: SessionState) => setState({ data: { interviewId: id, state } });

  // Pick the initial screen once, from the stored session state.
  useEffect(() => {
    if (!iv || stage) return;
    if (iv.status === "completed" || iv.status === "cancelled" || iv.sessionState === "CANCELLED" || iv.sessionState === "COMPLETED")
      setStage("ended");
    else if (iv.sessionState === "INTERVIEW_ACTIVE") setStage("resume");
    else setStage("device");
    // Prepare the interview plan in the background while the candidate checks devices. Never asks a question.
    if (iv.status === "created" || iv.status === "failed") void advance({ data: { interviewId: id, phase: "prepare" } }).then(refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iv]);

  const runAdvance = useCallback(async () => {
    setError(null);
    setLive("preparing");
    const r = await advance({ data: { interviewId: id, phase: "interview" } });
    await refresh();
    if (!r.ok) {
      setError(r.message);
      setLive("error");
      return;
    }
    // Score the previous answer in the background while the candidate hears the next question.
    void advance({ data: { interviewId: id, phase: "analyze" } }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /** Handles "repeat that" / "give me a second" without saving or scoring anything. */
  const handleMeta = useCallback(async (intent: "repeat" | "pause") => {
    const cur = ivRef.current;
    const q = cur?.messages.find((m) => m.id === cur.pendingQuestionId);
    const microphone = mic.current;
    setPartial("");
    setError(null);
    if (!q || !mgr.current) return;
    const line = intent === "repeat" ? `Sure, let me repeat that. ${q.text}` : "Of course, take your time. I'm listening whenever you're ready.";
    setNote(intent === "repeat" ? "Repeating the question…" : "Take your time — we'll listen when you're ready.");
    if (microphone) {
      microphone.listening = false;
      microphone.aiSpeaking = true;
    }
    setLive("speaking");
    await mgr.current.speak(line);
    if (microphone) {
      microphone.aiSpeaking = false;
      microphone.listening = true;
    }
    if (intent === "repeat") shownAt.current = Date.now();
    setLive("listening");
    setTimeout(() => setNote(null), 4000);
  }, []);

  const sendAnswer = useCallback(
    async (answer: string, durationSeconds: number) => {
      const cur = ivRef.current;
      if (stageRef.current !== "live" || !cur?.pendingQuestionId || busy.current || !answer.trim()) return;
      const intent = detectMetaIntent(answer);
      if (intent) {
        await handleMeta(intent);
        return;
      }
      busy.current = true;
      if (mic.current) mic.current.listening = false;
      const qid = cur.pendingQuestionId;
      let turnId = turnIds.current.get(qid);
      if (!turnId) {
        turnId = crypto.randomUUID();
        turnIds.current.set(qid, turnId);
      }
      setPendingAnswer(answer);
      setPartial("");
      setLive("processing");
      const r = await submit({ data: { interviewId: id, questionId: qid, answer, durationSeconds, turnId } });
      if (!r.ok) {
        setPendingAnswer(null);
        setError(r.message);
        setLive("error");
        busy.current = false;
        return;
      }
      await runAdvance();
      setPendingAnswer(null);
      busy.current = false;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, runAdvance, handleMeta],
  );

  /** Opens the voice session and microphone. The microphone stays gated until the interview is live. */
  async function connectVoice() {
    await mgr.current?.disconnect();
    const m = new VoiceProviderManager(id, (s) => {
      setProvider(s);
      if (stageRef.current === "live") setLive(s.reconnecting ? "reconnecting" : (l) => (l === "reconnecting" ? "speaking" : l));
    });
    mgr.current = m;
    await m.connect();
    if (!mic.current) {
      const microphone = new Microphone({
        onLevel: (l) => {
          setLevel(l);
          if (l > 0.02) lastLoud.current = Date.now();
        },
        onSpeechStart: () => {
          if (stageRef.current !== "live") return;
          if (microphone.aiSpeaking) {
            void mgr.current?.interrupt();
            microphone.aiSpeaking = false;
          }
          if (!busy.current) {
            microphone.listening = true;
            setLive("listening");
          }
        },
        onTurnEnd: async (audio) => {
          if (stageRef.current !== "live" || busy.current || !ivRef.current?.pendingQuestionId) return;
          setLive("processing");
          setPartial("Got it — thinking…");
          try {
            const text = (await mgr.current!.transcribe(audio, (t) => setPartial(t))).trim();
            if (!text) {
              setPartial("");
              setLive("listening");
              return;
            }
            await sendAnswer(text, Math.round((Date.now() - shownAt.current) / 1000));
          } catch {
            setPartial("");
            setError("We couldn't catch that. Please try answering again, or type your answer.");
            setLive("listening");
          }
        },
      });
      await microphone.start(micIdRef.current);
      mic.current = microphone;
      if (microphone.usedFallback) setMicNote("Your chosen microphone isn't available — using your default one.");
    }
    mic.current.acceptingAnswers = false;
    mic.current.listening = false;
  }

  async function runAudioCheck() {
    setStage("audio_check");
    await moveTo("AUDIO_CHECK");
    const ok = await mgr.current!.speak(AUDIO_CHECK_TEXT);
    if (!ok) {
      await moveTo("AUDIO_FAILED");
      setStage("audio_failed");
      return;
    }
    transition.current = false;
    setStage("confirm");
  }

  async function onReady() {
    if (locked) return;
    setLocked(true);
    try {
      await connectVoice();
      await runAudioCheck();
    } catch {
      setError("We couldn't start the voice connection. Please check your microphone and try again.");
      setLocked(false);
      setStage("device");
    }
  }

  async function onYes() {
    if (transition.current) return;
    transition.current = true;
    setStage("confirmed");
    await moveTo("AUDIO_CONFIRMED");
    await mgr.current?.speak(CONFIRM_TEXT);
    await moveTo("COUNTDOWN");
    setStage("countdown");
    for (const n of [3, 2, 1]) {
      setCount(n);
      await new Promise((r) => setTimeout(r, 1000));
    }
    setCount(0);
    await new Promise((r) => setTimeout(r, 600));
    const r = await moveTo("INTERVIEW_ACTIVE");
    if (r.state !== "INTERVIEW_ACTIVE") {
      setError("We couldn't start the interview. Please refresh the page.");
      return;
    }
    await refresh();
    setStage("live");
    if (mic.current) mic.current.acceptingAnswers = true;
  }

  async function onNo() {
    if (transition.current) return;
    transition.current = true;
    await moveTo("AUDIO_FAILED");
    setStage("audio_failed");
  }

  async function onReconnect() {
    try {
      await connectVoice();
      await runAudioCheck();
    } catch {
      setStage("audio_failed");
    }
  }

  async function onResume() {
    try {
      resumed.current = true;
      await connectVoice();
      setStage("live");
      if (mic.current) mic.current.acceptingAnswers = true;
    } catch {
      setError("We couldn't reconnect your microphone. You can continue by typing.");
      setShowTyping(true);
      setStage("live");
    }
  }

  async function retryVoice() {
    setError(null);
    setLive("reconnecting");
    try {
      await connectVoice();
      if (mic.current) mic.current.acceptingAnswers = true;
      const cur = ivRef.current;
      const q = cur?.messages.find((m) => m.id === cur.pendingQuestionId);
      if (q) spoken.current.delete(q.id);
      await refresh();
      setLive("listening");
    } catch {
      setLive("voice_lost");
    }
  }

  async function endInterview() {
    setConfirmEnd(false);
    await mgr.current?.interrupt();
    if (mic.current) mic.current.acceptingAnswers = false;
    await mic.current?.stop();
    mic.current = null;
    await mgr.current?.disconnect();
    await moveTo("CANCELLED");
    await refresh();
    setStage("ended");
  }

  useEffect(
    () => () => {
      void mic.current?.stop();
      void mgr.current?.disconnect();
    },
    [],
  );

  // During the live interview only: request the next question when none is waiting.
  useEffect(() => {
    if (!iv || stage !== "live" || busy.current || live === "preparing") return;
    if (iv.errorMessage) {
      setError(iv.errorMessage);
      setLive("error");
      return;
    }
    if (iv.status !== "completed" && !iv.pendingQuestionId && live !== "error") {
      busy.current = true;
      void runAdvance().finally(() => (busy.current = false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iv, stage]);

  // Speak each new interviewer message exactly once, only during the live interview.
  useEffect(() => {
    if (!iv || stage !== "live" || !mgr.current || !mic.current) return;
    const lastAi = [...iv.messages].reverse().find((x) => x.role === "ai");
    if (!lastAi || spoken.current.has(lastAi.id)) return;
    const isPending = iv.pendingQuestionId === lastAi.id;
    if (!isPending && iv.status !== "completed") return;
    spoken.current.add(lastAi.id);
    const m = mgr.current;
    const microphone = mic.current;
    void (async () => {
      setLive("speaking");
      microphone.listening = false;
      microphone.aiSpeaking = true;
      const ok = await m.speak(lastAi.text);
      microphone.aiSpeaking = false;
      shownAt.current = Date.now();
      if (ivRef.current?.status === "completed") {
        microphone.acceptingAnswers = false;
        void microphone.stop();
        mic.current = null;
        setStage("ended");
        return;
      }
      if (!ok) {
        setLive("voice_lost");
        return;
      }
      if (!busy.current) {
        microphone.listening = true;
        setLive((s) => (s === "processing" ? s : "listening"));
      }
    })();
  }, [iv, stage]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [iv?.messages.length, partial, pendingAnswer]);

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    if (mic.current) mic.current.muted = next;
  }

  async function retry() {
    setError(null);
    if (ivRef.current?.pendingQuestionId) {
      setLive("listening");
      if (mic.current) mic.current.listening = true;
    } else await runAdvance();
  }

  const lastAi = iv ? [...iv.messages].reverse().find((x) => x.role === "ai") : undefined;
  const showProgress = stage === "live" || stage === "ended" || stage === "resume";

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <AppHeader />
      <div className="border-b border-border bg-background">
        <div className="mx-auto max-w-3xl px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-display text-base font-semibold">JobGenesis AI Interview</p>
              <p className="text-xs text-muted-foreground">
                {iv ? iv.resumeName : ""}
                {showProgress && iv?.currentStage ? ` · ${STAGE_LABELS[iv.currentStage as InterviewStage] ?? iv.currentStage}` : ""}
              </p>
            </div>
            {showProgress ? <p className="text-xs text-muted-foreground">{iv?.questionCount ?? 0} questions asked</p> : null}
          </div>
          {showProgress ? (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-accent transition-all duration-700"
                style={{ width: `${Math.round((iv?.status === "completed" ? 1 : iv?.progress ?? 0) * 100)}%` }}
              />
            </div>
          ) : null}
        </div>
      </div>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">
        {iv && stage && stage !== "ended" ? (
          <CameraAnalysis
            interviewId={id}
            view={stage === "device" ? "consent" : stage === "live" ? "preview" : "hidden"}
            sessionState={stage === "live" ? "INTERVIEW_ACTIVE" : "PREPARING"}
            questionId={stage === "live" ? iv.pendingQuestionId : null}
          />
        ) : null}
        {isLoading || (iv && !stage) ? (
          <div className="h-32 animate-pulse rounded-2xl bg-secondary" />
        ) : !iv ? (
          <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">We couldn't find this interview.</p>
        ) : stage === "device" ? (
          <DeviceCheck locked={locked} error={error} onReady={() => void onReady()} micId={micId} onMicChange={(v) => void chooseMic(v)} capacity={capacity} />
        ) : stage === "resume" ? (
          <Panel title="Your previous interview session was interrupted.">
            <p className="text-sm text-muted-foreground">Your answers so far are saved. You'll continue from the current question.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <PrimaryButton onClick={() => void onResume()}>Resume Interview</PrimaryButton>
              <SecondaryButton onClick={() => setConfirmEnd(true)}>End Interview</SecondaryButton>
            </div>
          </Panel>
        ) : stage === "audio_check" || stage === "confirm" || stage === "confirmed" ? (
          <Panel title="Audio check">
            <Orb active={stage === "audio_check" || stage === "confirmed"} />
            <p className="mx-auto mt-4 max-w-md text-center text-base">
              {stage === "confirmed" ? CONFIRM_TEXT : stage === "confirm" ? "Can you hear me?" : "The interviewer is checking your audio…"}
            </p>
            {stage === "confirm" ? (
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                <PrimaryButton onClick={() => void onYes()}>✓ Yes, I can hear you</PrimaryButton>
                <SecondaryButton onClick={() => void onNo()}>✕ No, I can't hear you</SecondaryButton>
              </div>
            ) : null}
          </Panel>
        ) : stage === "audio_failed" ? (
          <Panel title="Let's fix your audio before we begin.">
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Check your system volume isn't muted</li>
              <li>Check the selected output device (speakers or headphones)</li>
              <li>Check this site is allowed to play sound in your browser</li>
              <li>Reconnect your headphones or speakers</li>
            </ul>
            <div className="mt-5 flex flex-wrap gap-2">
              <PrimaryButton onClick={() => void runAudioCheck()}>🔊 Test audio again</PrimaryButton>
              <SecondaryButton onClick={() => void onReconnect()}>🔄 Reconnect</SecondaryButton>
              <SecondaryButton onClick={() => setConfirmEnd(true)}>Cancel interview</SecondaryButton>
            </div>
          </Panel>
        ) : stage === "countdown" ? (
          <Panel title="">
            <div className="py-6 text-center" aria-live="assertive">
              {count > 0 ? (
                <>
                  <p className="text-sm text-muted-foreground">Get ready. The interview will begin in</p>
                  <p className="mt-4 font-display text-7xl font-semibold tabular-nums">{count}</p>
                </>
              ) : (
                <p className="font-display text-2xl font-semibold">🎙 Interview starting</p>
              )}
            </div>
          </Panel>
        ) : (
          <div className="space-y-6">
            {stage === "live" ? (
              <>
                <section className="rounded-2xl border border-border bg-card p-6 text-center shadow-[var(--shadow-card)]">
                  <Orb active={live === "speaking"} />
                  <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground" aria-live="polite">
                    {LIVE_LABEL[live]}
                  </p>
                  {lastAi ? <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed">{lastAi.text}</p> : null}
                </section>

                <section className="flex flex-col items-center gap-3">
                  <MicIndicator level={level} muted={muted} listening={live === "listening"} />
                  <p className="text-sm text-muted-foreground">
                    {muted ? "Microphone muted" : note ? note : live === "listening" ? "Listening… take your time." : " "}
                  </p>
                  {quiet ? (
                    <p className="text-xs text-destructive">We can't hear you — try another microphone below.</p>
                  ) : null}
                  <div className="flex flex-wrap justify-center gap-2">
                    <SecondaryButton onClick={toggleMute}>{muted ? "🎤 Unmute" : "🎤 Mute"}</SecondaryButton>
                    <SecondaryButton onClick={() => { if (!busy.current && live !== "speaking") void handleMeta("repeat"); }}>🔁 Repeat question</SecondaryButton>
                    <SecondaryButton onClick={() => { if (!busy.current && live !== "speaking") void handleMeta("pause"); }}>⏱ Need a moment</SecondaryButton>
                    <SecondaryButton onClick={() => setShowTyping((v) => !v)}>{showTyping ? "Hide typing" : "Type instead"}</SecondaryButton>
                    <button type="button" onClick={() => setConfirmEnd(true)} className="rounded-lg border border-destructive/40 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/5">
                      End Interview
                    </button>
                  </div>
                  <MicSelect compact value={mic.current?.deviceId ?? micId} onChange={(v) => void chooseMic(v)} />
                  {micNote ? <p className="text-xs text-muted-foreground">{micNote}</p> : null}
                  {provider?.provider === "browser" ? <p className="text-xs text-muted-foreground">Using your browser's voice for now.</p> : null}
                </section>

                {live === "voice_lost" ? (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
                    <p>We couldn't reconnect the interviewer's voice. The question is shown above.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <PrimaryButton onClick={() => void retryVoice()}>Retry connection</PrimaryButton>
                      <SecondaryButton onClick={() => { setShowTyping(true); setLive("listening"); }}>Continue with text</SecondaryButton>
                      <SecondaryButton onClick={() => setConfirmEnd(true)}>End Interview</SecondaryButton>
                    </div>
                  </div>
                ) : null}

                {error ? (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
                    <p>{error}</p>
                    <div className="mt-3"><PrimaryButton onClick={() => void retry()}>Try again</PrimaryButton></div>
                  </div>
                ) : null}
              </>
            ) : null}

            <section>
              <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Transcript</h2>
              <div className="max-h-96 space-y-3 overflow-y-auto rounded-2xl border border-border bg-background p-4 text-sm">
                {iv.messages.length === 0 ? <p className="text-muted-foreground">No questions were asked.</p> : null}
                {iv.messages.map((m) => (
                  <p key={m.id} className="leading-relaxed">
                    <span className="font-medium">{m.role === "ai" ? "Interviewer: " : "You: "}</span>
                    {m.text}
                  </p>
                ))}
                {pendingAnswer ? (
                  <p className="leading-relaxed"><span className="font-medium">You: </span>{pendingAnswer}</p>
                ) : partial ? (
                  <p className="leading-relaxed text-muted-foreground"><span className="font-medium">You: </span>{partial}</p>
                ) : null}
                <div ref={bottomRef} />
              </div>
            </section>

            {stage === "live" && showTyping && iv.status !== "completed" ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!draft.trim()) return;
                  const a = draft.trim();
                  setDraft("");
                  void sendAnswer(a, Math.round((Date.now() - shownAt.current) / 1000));
                }}
                className="flex items-end gap-3"
              >
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  disabled={!iv.pendingQuestionId}
                  rows={3}
                  maxLength={6000}
                  aria-label="Type your answer"
                  placeholder="Type your answer…"
                  className="min-h-20 flex-1 resize-y rounded-xl border border-input bg-card px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                />
                <button type="submit" disabled={!iv.pendingQuestionId || !draft.trim()} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  Send
                </button>
              </form>
            ) : null}

            {stage === "ended" ? (
              <div className="rounded-2xl border border-border bg-card p-6 text-sm shadow-[var(--shadow-card)]">
                <p className="font-display text-base font-semibold">{iv.status === "cancelled" ? "Interview ended" : "Interview completed"}</p>
                <p className="mt-1 text-muted-foreground">
                  Thanks for taking the time. Your answers are saved — your detailed interview report is ready below.
                </p>
                <div className="mt-4 flex gap-2">
                  {iv.status === "completed" ? (
                    <Link to="/report/$id" params={{ id: iv.id }} className="rounded-lg bg-primary px-3 py-1.5 font-medium text-primary-foreground hover:bg-primary/90">View report</Link>
                  ) : null}
                  <Link to="/dashboard" className="rounded-lg border border-border px-3 py-1.5 hover:bg-secondary">Back to dashboard</Link>
                  <Link to="/resume/$id" params={{ id: iv.resumeId }} className="rounded-lg border border-border px-3 py-1.5 hover:bg-secondary">View resume analysis</Link>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {confirmEnd ? (
          <div role="dialog" aria-modal="true" aria-labelledby="end-title" className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-5">
            <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
              <p id="end-title" className="font-display text-base font-semibold">Are you sure you want to end the interview?</p>
              <p className="mt-1 text-sm text-muted-foreground">Answers you've already given are kept.</p>
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <SecondaryButton onClick={() => setConfirmEnd(false)}>Continue Interview</SecondaryButton>
                <button type="button" onClick={() => void endInterview()} className="rounded-lg bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90">
                  End Interview
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      {title ? <p className="mb-3 font-display text-lg font-semibold">{title}</p> : null}
      {children}
    </div>
  );
}

function PrimaryButton({ onClick, children, disabled }: { onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
      {children}
    </button>
  );
}

function SecondaryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-secondary">
      {children}
    </button>
  );
}

function Orb({ active }: { active: boolean }) {
  return (
    <div className="relative mx-auto flex size-20 items-center justify-center">
      {active ? <span className="absolute inset-0 animate-ping rounded-full bg-accent/30" /> : null}
      <span className="relative flex size-16 items-center justify-center rounded-full bg-primary font-display text-sm font-semibold text-primary-foreground">JG</span>
    </div>
  );
}

function MicIndicator({ level, muted, listening }: { level: number; muted: boolean; listening: boolean }) {
  const scale = 1 + Math.min(level * 8, 0.6);
  return (
    <div className="relative flex size-16 items-center justify-center">
      <span
        className={`absolute inset-0 rounded-full transition-transform duration-75 ${listening && !muted ? "bg-accent/25" : "bg-secondary"}`}
        style={{ transform: `scale(${scale})` }}
      />
      <svg viewBox="0 0 24 24" className={`relative size-7 ${muted ? "text-muted-foreground" : "text-foreground"}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        {muted ? <path d="M4 4l16 16" /> : null}
      </svg>
    </div>
  );
}

type Check = "pending" | "ok" | "fail";

function DeviceCheck({
  onReady,
  locked,
  error,
  micId,
  onMicChange,
  capacity,
}: {
  onReady: () => void;
  locked: boolean;
  error: string | null;
  micId: string | null;
  onMicChange: (id: string) => void;
  capacity: InterviewCapacityView | null;
}) {
  const [mic, setMic] = useState<Check>("pending");
  const [out, setOut] = useState<Check>("pending");
  const [browser, setBrowser] = useState<Check>("pending");
  const [net, setNet] = useState<Check>("pending");
  const [perm, setPerm] = useState<"unknown" | "prompt" | "granted" | "denied">("unknown");

  // Checks without opening the microphone; the mic is only requested after a click.
  async function passive() {
    const supported = !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined" && "AudioContext" in window;
    setBrowser(supported ? "ok" : "fail");
    setOut("AudioContext" in window ? "ok" : "fail");
    setNet(navigator.onLine ? "ok" : "fail");
    if (!supported) return setMic("fail");
    try {
      const st = await navigator.permissions.query({ name: "microphone" as PermissionName });
      setPerm(st.state as "prompt" | "granted" | "denied");
      if (st.state === "granted") await requestMic();
      else if (st.state === "denied") setMic("fail");
    } catch {
      setPerm("prompt");
    }
  }

  async function requestMic() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      setMic("ok");
      setPerm("granted");
    } catch (e) {
      setMic("fail");
      if ((e as DOMException)?.name === "NotAllowedError") setPerm("denied");
    }
  }

  useEffect(() => {
    void passive();
  }, []);

  const allOk = [mic, out, browser, net].every((c) => c === "ok");
  const row = (label: string, c: Check, ok: string, bad: string) => (
    <li className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-0">
      <span>{label}</span>
      <span className={c === "ok" ? "text-accent" : c === "fail" ? "text-destructive" : "text-muted-foreground"}>
        {c === "ok" ? `✓ ${ok}` : c === "fail" ? `✕ ${bad}` : "…"}
      </span>
    </li>
  );

  return (
    <Panel title="JobGenesis AI Interviewer">
      <p className="text-base font-medium">Your interview is ready.</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Before we begin, we'll quickly check your microphone and audio connection. The microphone is used only while the
        interview runs; your answers are saved as text and the audio itself is not stored.
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        During the interview we note when you switch tabs or windows and when text is pasted. These are shown as plain facts in your report.
      </p>
      <ul className="mt-5 text-sm">
        {row("Microphone", mic, "Connected", perm === "denied" ? "Blocked" : "Not available")}
        {row("Speaker", out, "Available", "Not available")}
        {row("Browser", browser, "Supported", "Not supported — try the latest Chrome, Edge or Safari")}
        {row("Connection", net, "Ready", "Offline")}
      </ul>
      {mic === "pending" && perm !== "denied" ? (
        <div className="mt-4 rounded-xl bg-secondary p-4 text-sm">
          <p>Microphone access is required for the voice interview.</p>
          <div className="mt-3"><PrimaryButton onClick={() => void requestMic()}>Allow Microphone</PrimaryButton></div>
        </div>
      ) : null}
      {perm === "denied" ? (
        <div className="mt-4 rounded-xl bg-secondary p-4 text-sm">
          Microphone access is blocked. Click the lock icon in your browser's address bar, allow the microphone for this
          site, then press "Check again".
          <div className="mt-3"><SecondaryButton onClick={() => void requestMic()}>Check again</SecondaryButton></div>
        </div>
      ) : null}
      {error ? <p className="mt-4 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p> : null}
      {mic === "ok" ? (
        <div className="mt-4 rounded-xl border border-border p-4">
          <MicSelect value={micId} onChange={onMicChange} />
          <MicTestMeter deviceId={micId} />
        </div>
      ) : null}
      <p className="mt-4 text-xs text-muted-foreground">Tip: headphones give the smoothest conversation.</p>
      {capacity?.full ? (
        <div className="mt-4 rounded-xl border border-border bg-secondary p-4 text-sm">
          <p className="font-medium">Interviews are temporarily unavailable.</p>
          <p className="mt-1 text-muted-foreground">
            Resume analysis is still available. Please try starting an interview again later.
          </p>
          <div className="mt-3">
            <Link to="/dashboard" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-background">
              Back to dashboard
            </Link>
          </div>
        </div>
      ) : null}
      <div className="mt-5">
        <PrimaryButton disabled={!allOk || locked || (capacity?.full ?? false)} onClick={onReady}>
          {locked ? "Connecting…" : "🎤 I'm Ready to Start"}
        </PrimaryButton>
      </div>
    </Panel>
  );
}

/** Dropdown of input devices. Labels only appear after mic permission is granted. */
function MicSelect({ value, onChange, compact }: { value: string | null; onChange: (id: string) => void; compact?: boolean }) {
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    const load = () => void listMics().then(setMics).catch(() => {});
    load();
    navigator.mediaDevices?.addEventListener?.("devicechange", load);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", load);
  }, []);
  if (mics.length === 0) return null;
  const current = value && mics.some((m) => m.deviceId === value) ? value : (mics[0]?.deviceId ?? "");
  return (
    <label className={compact ? "flex items-center gap-2 text-xs text-muted-foreground" : "block text-sm"}>
      <span className={compact ? "" : "font-medium"}>Microphone</span>
      <select
        value={current}
        onChange={(e) => onChange(e.target.value)}
        className={`${compact ? "max-w-56 py-1 text-xs" : "mt-1.5 w-full py-2 text-sm"} rounded-lg border border-input bg-background px-2 text-foreground outline-none focus:ring-2 focus:ring-ring`}
      >
        {mics.map((m, i) => (
          <option key={m.deviceId || i} value={m.deviceId}>
            {m.label || `Microphone ${i + 1}`}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Live sound bar for the selected mic, using its own short-lived stream. */
function MicTestMeter({ deviceId }: { deviceId: string | null }) {
  const [level, setLevel] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    let stop = false;
    let raf = 0;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    void (async () => {
      try {
        let fb = false;
        const s = await openMicStream(deviceId, (f) => (fb = f));
        stream = s;
        if (stop) return s.getTracks().forEach((t) => t.stop());
        setNote(fb ? "That microphone isn't available — using your default one." : null);
        ctx = new AudioContext();
        const an = ctx.createAnalyser();
        an.fftSize = 1024;
        ctx.createMediaStreamSource(s).connect(an);
        const buf = new Float32Array(an.fftSize);
        const tick = () => {
          an.getFloatTimeDomainData(buf);
          let s = 0;
          for (const v of buf) s += v * v;
          setLevel(Math.sqrt(s / buf.length));
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        setNote("We couldn't open that microphone. Try another one.");
      }
    })();
    return () => {
      stop = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close().catch(() => {});
    };
  }, [deviceId]);
  return (
    <div className="mt-2">
      <div className="h-2 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-accent transition-[width] duration-75" style={{ width: `${Math.min(100, level * 900)}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{note ?? "Say something — the bar should move."}</p>
    </div>
  );
}
