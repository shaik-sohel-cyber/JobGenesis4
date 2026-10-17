import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { recordIntegrityEvents } from "@/lib/integrity.functions";

type Ev = { clientEventId: string; kind: "tab_hidden" | "window_blur" | "paste"; durationMs: number; questionId: string | null; detail: Record<string, string | number | boolean> };

/** Records tab switches, focus loss and pastes while the interview is live. Never blocks the interview. */
export function useIntegrityMonitor(interviewId: string, active: boolean, questionId: string | null) {
  const send = useServerFn(recordIntegrityEvents);
  const qRef = useRef(questionId);
  qRef.current = questionId;

  useEffect(() => {
    if (!active) return;
    const queue: Ev[] = [];
    let hiddenAt: number | null = null;
    let blurAt: number | null = null;
    const push = (kind: Ev["kind"], durationMs: number, detail: Ev["detail"] = {}) =>
      queue.push({ clientEventId: crypto.randomUUID(), kind, durationMs: Math.round(durationMs), questionId: qRef.current, detail });
    const flush = () => {
      if (!queue.length) return;
      const events = queue.splice(0, queue.length);
      send({ data: { interviewId, events } }).catch(() => {});
    };
    const onVis = () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (hiddenAt) { push("tab_hidden", Date.now() - hiddenAt); hiddenAt = null; flush(); }
    };
    const onBlur = () => { if (!document.hidden) blurAt = Date.now(); };
    const onFocus = () => {
      if (blurAt) { const d = Date.now() - blurAt; if (d > 1500) push("window_blur", d); blurAt = null; flush(); }
    };
    const onPaste = (e: ClipboardEvent) => {
      const len = e.clipboardData?.getData("text")?.length ?? 0;
      if (len > 0) { push("paste", 0, { chars: len }); flush(); }
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("paste", onPaste);
    return () => {
      if (hiddenAt) push("tab_hidden", Date.now() - hiddenAt);
      flush();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("paste", onPaste);
    };
  }, [active, interviewId, send]);
}
