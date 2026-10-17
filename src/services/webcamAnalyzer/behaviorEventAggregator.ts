import { webcamConfig, type VisualEventType } from "./config";

export type VisualEvent = {
  clientEventId: string;
  type: VisualEventType;
  startedAt: string;
  durationMs: number;
  confidence: number | null;
  details: Record<string, unknown>;
  questionId: string | null;
  sessionState: string;
};

export type Sample = {
  t: number;
  faces: number;
  conditions: Partial<Record<VisualEventType, { confidence?: number; details?: Record<string, unknown> }>>;
};

type Open = { start: number; last: number; confidence: number; n: number; details: Record<string, unknown> };

export type QuestionMetrics = {
  samples: number;
  faceVisiblePct: number;
  lookingAwayPct: number;
  headTurnedPct: number;
  lookingAwayMs: number;
  multipleFacesMs: number;
  events: Partial<Record<VisualEventType, number>>;
};

/**
 * Turns per-frame observations into debounced, timestamped events and per-question rollups.
 * Only records what was observed; never derives emotions or traits.
 */
export class BehaviorEventAggregator {
  private open = new Map<VisualEventType, Open>();
  private queue: VisualEvent[] = [];
  private lastT = 0;
  private roll = new Map<string, { samples: number; face: number; away: number; turned: number; awayMs: number; multiMs: number; events: Partial<Record<VisualEventType, number>> }>();

  constructor(private ctx: () => { questionId: string | null; sessionState: string }) {}

  add(s: Sample) {
    const dt = this.lastT ? Math.min(1000, s.t - this.lastT) : 0;
    this.lastT = s.t;
    const { questionId } = this.ctx();
    if (questionId) {
      const r = this.roll.get(questionId) ?? { samples: 0, face: 0, away: 0, turned: 0, awayMs: 0, multiMs: 0, events: {} };
      r.samples++;
      if (s.faces > 0) r.face++;
      if (s.conditions.LOOKING_AWAY) { r.away++; r.awayMs += dt; }
      if (s.conditions.HEAD_TURNED_AWAY) r.turned++;
      if (s.conditions.MULTIPLE_FACES_DETECTED) r.multiMs += dt;
      this.roll.set(questionId, r);
    }
    for (const [type, c] of Object.entries(s.conditions) as [VisualEventType, { confidence?: number; details?: Record<string, unknown> }][]) {
      if (type === "HEAD_MOVEMENT") {
        this.emit(type, s.t, s.t, c.confidence ?? null, c.details ?? {});
        continue;
      }
      const o = this.open.get(type);
      if (o) {
        o.last = s.t;
        o.confidence += c.confidence ?? 0;
        o.n++;
        o.details = { ...o.details, ...c.details };
      } else this.open.set(type, { start: s.t, last: s.t, confidence: c.confidence ?? 0, n: 1, details: c.details ?? {} });
    }
    for (const [type, o] of this.open) {
      if (!s.conditions[type] && s.t - o.last > 400) this.close(type);
    }
  }

  /** Records a one-off technical event (camera lost/recovered). */
  technical(type: VisualEventType, details: Record<string, unknown> = {}) {
    const now = Date.now();
    this.emit(type, now, now, null, details);
  }

  closeAll() {
    for (const type of [...this.open.keys()]) this.close(type);
  }

  drain(): VisualEvent[] {
    const out = this.queue;
    this.queue = [];
    return out;
  }

  metrics(questionId: string): QuestionMetrics | null {
    const r = this.roll.get(questionId);
    if (!r || !r.samples) return null;
    const pct = (n: number) => Math.round((n / r.samples) * 1000) / 10;
    return {
      samples: r.samples,
      faceVisiblePct: pct(r.face),
      lookingAwayPct: pct(r.away),
      headTurnedPct: pct(r.turned),
      lookingAwayMs: Math.round(r.awayMs),
      multipleFacesMs: Math.round(r.multiMs),
      events: r.events,
    };
  }

  private close(type: VisualEventType) {
    const o = this.open.get(type);
    this.open.delete(type);
    if (!o) return;
    if (o.last - o.start < (webcamConfig.minEventMs[type] ?? 1000)) return;
    this.emit(type, o.start, o.last, o.n ? o.confidence / o.n : null, o.details);
  }

  private emit(type: VisualEventType, start: number, end: number, confidence: number | null, details: Record<string, unknown>) {
    const { questionId, sessionState } = this.ctx();
    if (questionId) {
      const r = this.roll.get(questionId);
      if (r) r.events[type] = (r.events[type] ?? 0) + 1;
    }
    this.queue.push({
      clientEventId: crypto.randomUUID(),
      type,
      startedAt: new Date(start).toISOString(),
      durationMs: Math.max(0, Math.round(end - start)),
      confidence: confidence === null ? null : Math.round(confidence * 100) / 100,
      details,
      questionId,
      sessionState,
    });
  }
}
