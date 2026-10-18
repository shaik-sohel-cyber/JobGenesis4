/**
 * AI key pool.
 *
 * Every AI call goes through a healthy (key, model) pair instead of always
 * asking the same key. Each Google project tracks its own daily allowance per
 * model, so one key is worth several small daily allowances rather than one.
 * When a pair reports its limit we read the reset time the provider returns
 * and avoid that pair until then, moving on to the next healthy pair. When
 * nothing is healthy left we stop with an honest message — we never quietly
 * fall back to the workspace gateway, because that would spend credits.
 *
 * State lives in the `ai_capacity` table (per day, per key, per model) so a
 * restart or a second instance keeps the reset times, plus an in-process cache.
 */

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const GATEWAY_MODEL = "google/gemini-3.8-flash";

/** Best first. Each model has its own daily allowance on every key. */
export const MODEL_LADDER = [
  "gemini-3.6-flash",
  "gemini-2.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite",
  "gemma-4-26b-a4b-it",
] as const;

const DEFAULT_DAILY_LIMIT = 20;
const MAX_KEY_SLOTS = 12;
const CACHE_MS = 20_000;

export type AiPair = { keyLabel: string; model: string; key: string };

type PairState = {
  requests: number;
  failures: number;
  observedLimit: number | null;
  benchedUntil: number | null;
  benchReason: string | null;
};

const state = new Map<string, PairState>();
let loadedDay: string | null = null;
let loadedAt = 0;
let pointer = 0;

/** Where a call failed, so callers can word their own message. */
export class AiPoolError extends Error {
  constructor(
    message: string,
    readonly kind: "capacity" | "config" | "upstream",
  ) {
    super(message);
    this.name = "AiPoolError";
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function pairId(p: { keyLabel: string; model: string }): string {
  return `${p.keyLabel}|${p.model}`;
}

function blank(): PairState {
  return { requests: 0, failures: 0, observedLimit: null, benchedUntil: null, benchReason: null };
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Keys that are actually configured, in label order. */
export function geminiKeys(): { label: string; key: string }[] {
  const out: { label: string; key: string }[] = [];
  const first = process.env["GEMINI_API_KEY"]?.trim();
  if (first) out.push({ label: "key-1", key: first });
  for (let i = 2; i <= MAX_KEY_SLOTS; i++) {
    const value = process.env[`GEMINI_API_KEY_${i}`]?.trim();
    if (value) out.push({ label: `key-${i}`, key: value });
  }
  return out;
}

async function loadState(force = false) {
  const day = today();
  if (!force && loadedDay === day && Date.now() - loadedAt < CACHE_MS) return;
  loadedDay = day;
  loadedAt = Date.now();
  try {
    const client = await db();
    const { data, error } = await client.from("ai_capacity").select("*").eq("day", day);
    if (error) throw new Error(error.message);
    state.clear();
    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      const label = String(row["key_label"] ?? "");
      const model = String(row["model"] ?? "");
      if (!label || !model) continue;
      const raw = row["benched_until"];
      const benched = raw == null ? null : Date.parse(String(raw));
      state.set(pairId({ keyLabel: label, model }), {
        requests: Number(row["requests"] ?? 0),
        failures: Number(row["failures"] ?? 0),
        observedLimit: row["observed_limit"] == null ? null : Number(row["observed_limit"]),
        benchedUntil: benched == null || Number.isNaN(benched) ? null : benched,
        benchReason: row["bench_reason"] == null ? null : String(row["bench_reason"]),
      });
    }
  } catch (error) {
    // Bookkeeping is best effort: rotation still works from process memory.
    console.error("[aiPool] could not load capacity state", error);
  }
}

async function persist(pair: AiPair, patch: Partial<PairState>) {
  const id = pairId(pair);
  const next: PairState = { ...(state.get(id) ?? blank()), ...patch };
  state.set(id, next);
  try {
    const client = await db();
    await client.from("ai_capacity").upsert(
      {
        day: today(),
        key_label: pair.keyLabel,
        model: pair.model,
        requests: next.requests,
        failures: next.failures,
        observed_limit: next.observedLimit,
        benched_until: next.benchedUntil == null ? null : new Date(next.benchedUntil).toISOString(),
        bench_reason: next.benchReason,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "day,key_label,model" },
    );
  } catch (error) {
    console.error("[aiPool] could not save capacity state", error);
  }
}

function isOpen(id: string): boolean {
  const row = state.get(id);
  return !row || row.benchedUntil == null || row.benchedUntil <= Date.now();
}

/** All pairs, best model first, every key carrying that model's load. */
export async function listPairs(): Promise<AiPair[]> {
  await loadState();
  const keys = geminiKeys();
  const pairs: AiPair[] = [];
  for (const model of MODEL_LADDER) for (const k of keys) pairs.push({ keyLabel: k.label, model, key: k.key });
  return pairs;
}

/** Next healthy pair, rotating so no single key or model carries the load. */
export async function nextPair(exclude: Set<string> = new Set()): Promise<AiPair | null> {
  const pairs = await listPairs();
  const open = pairs.filter((p) => isOpen(pairId(p)) && !exclude.has(pairId(p)));
  if (!open.length) return null;
  const index = pointer % open.length;
  pointer = (pointer + 1) % open.length;
  return open[index]!;
}

export async function benchPair(pair: AiPair, seconds: number, reason: string) {
  await persist(pair, {
    benchedUntil: Date.now() + Math.max(30, Math.round(seconds)) * 1000,
    benchReason: reason,
  });
}

export async function markUsed(pair: AiPair) {
  const row = state.get(pairId(pair)) ?? blank();
  await persist(pair, { requests: row.requests + 1 });
}

async function markFailed(pair: AiPair) {
  const row = state.get(pairId(pair)) ?? blank();
  await persist(pair, { failures: row.failures + 1 });
}

/** "Please retry in 7h46m31.95s." -> seconds. */
export function parseRetrySeconds(text: string): number | null {
  const match = text.match(/retry in\s+([\d.]+[hms]\S*|\d+)/i);
  if (!match) return null;
  const raw = match[1]!;
  if (/^\d+$/.test(raw)) return Number(raw);
  const h = Number(raw.match(/([\d.]+)h/)?.[1] ?? 0);
  const m = Number(raw.match(/([\d.]+)m/)?.[1] ?? 0);
  const s = Number(raw.match(/([\d.]+)s/)?.[1] ?? 0);
  const total = h * 3600 + m * 60 + s;
  return total > 0 ? Math.ceil(total) : null;
}

/** "limit: 20, model: gemini-2.5-flash" */
export function parseLimit(text: string): number | null {
  const m = text.match(/limit:\s*(\d+)/i);
  return m ? Number(m[1]) : null;
}

function secondsToUtcMidnight(): number {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return Math.max(60, Math.round((next.getTime() - now.getTime()) / 1000));
}

function earliestReset(): number | null {
  let best: number | null = null;
  for (const row of state.values()) {
    if (row.benchedUntil == null || row.benchedUntil <= Date.now()) continue;
    if (best == null || row.benchedUntil < best) best = row.benchedUntil;
  }
  return best;
}

export function capacityMessage(): string {
  const reset = earliestReset();
  if (!reset) return "Today's free AI capacity is used up. It returns at 00:00 UTC.";
  const at = new Date(reset);
  const hh = String(at.getUTCHours()).padStart(2, "0");
  const mm = String(at.getUTCMinutes()).padStart(2, "0");
  return `Today's free AI capacity is used up. It returns at ${hh}:${mm} UTC.`;
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
}

/**
 * One strict-JSON AI call with rotation. Returns the parsed object; the caller
 * still validates it. `validate` lets a caller report unusable output so the
 * weak model behind it is set aside instead of stalling the run.
 */
export async function callAiStructured(opts: {
  name: string;
  system: string;
  user: string;
  jsonSchema: Record<string, unknown>;
  validate?: (json: unknown) => boolean;
}): Promise<unknown> {
  const keys = geminiKeys();
  if (!keys.length) return callWorkspaceGateway(opts);

  const tried = new Set<string>();
  const attempts = Math.min(10, MODEL_LADDER.length * keys.length);

  for (let attempt = 0; attempt < attempts; attempt++) {
    const pair = await nextPair(tried);
    if (!pair) break;
    tried.add(pairId(pair));

    let response: Response;
    try {
      response = await fetch(GEMINI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${pair.key}` },
        body: JSON.stringify({
          model: pair.model,
          messages: [
            { role: "system", content: opts.system },
            { role: "user", content: opts.user },
          ],
          response_format: {
            type: "json_schema",
            json_schema: { name: opts.name, strict: true, schema: opts.jsonSchema },
          },
        }),
      });
    } catch {
      await benchPair(pair, 120, "could not reach the service");
      continue;
    }

    if (response.ok) {
      await markUsed(pair);
      const payload = (await response.json().catch(() => null)) as {
        choices?: Array<{ message?: { content?: string | null } }>;
      } | null;
      const content = payload?.choices?.[0]?.message?.content;
      if (!content) {
        await markFailed(pair);
        continue;
      }
      let json: unknown;
      try {
        json = JSON.parse(stripCodeFence(content));
      } catch {
        await markFailed(pair);
        continue;
      }
      if (opts.validate && !opts.validate(json)) {
        // The model answered, but not in the shape the engine needs.
        await benchPair(pair, 10 * 60, "output was not usable");
        continue;
      }
      return json;
    }

    const detail = await response.text().catch(() => "");
    console.error(`[aiPool:${opts.name}] ${pair.keyLabel}/${pair.model} -> ${response.status}`, detail.slice(0, 300));

    if (response.status === 429) {
      const limit = parseLimit(detail);
      if (limit) await persist(pair, { observedLimit: limit });
      await benchPair(pair, parseRetrySeconds(detail) ?? secondsToUtcMidnight(), "daily limit reached");
      continue;
    }
    if (response.status === 401 || response.status === 403) {
      await benchPair(pair, 60 * 60, "key was rejected");
      continue;
    }
    if (response.status === 404) {
      await benchPair(pair, secondsToUtcMidnight(), "model not available");
      continue;
    }
    if (response.status === 400) {
      await markFailed(pair);
      continue;
    }
    // 503 "high demand", 500 and friends: short bench, then the next pair.
    await benchPair(pair, 90, "temporarily unavailable");
  }

  throw new AiPoolError(capacityMessage(), "capacity");
}

/** Only used when no Gemini key exists at all: the built-in workspace model. */
async function callWorkspaceGateway(opts: {
  name: string;
  system: string;
  user: string;
  jsonSchema: Record<string, unknown>;
}): Promise<unknown> {
  const key = process.env["LOVABLE_API_KEY"]?.trim();
  if (!key) throw new AiPoolError("No AI key is configured.", "config");

  const response = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: GATEWAY_MODEL,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: opts.name, strict: true, schema: opts.jsonSchema },
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[aiPool:workspace] gateway error", response.status, detail.slice(0, 300));
    if (response.status === 429)
      throw new AiPoolError("The interviewer is busy right now. Please try again in a moment.", "upstream");
    if (response.status === 402)
      throw new AiPoolError("The workspace is out of AI credits. Add credits and try again.", "upstream");
    throw new AiPoolError("The AI service could not respond. Please try again.", "upstream");
  }

  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string | null } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new AiPoolError("The AI service returned an empty response.", "upstream");
  return JSON.parse(stripCodeFence(content));
}

export type CapacityView = {
  keysConnected: number;
  pairsTotal: number;
  pairsOpen: number;
  requestsToday: number;
  estimatedInterviewsLeft: number;
  nextResetAt: string | null;
  message: string;
  models: Array<{ model: string; openKeys: number; totalKeys: number; requestsToday: number }>;
  keys: Array<{ label: string; openModels: number; totalModels: number; requestsToday: number }>;
};

/** Candidate-safe capacity check; does not return quota or provider details. */
export async function isInterviewCapacityFull(): Promise<boolean> {
  if (geminiKeys().length === 0) return false;
  return (await nextPair()) === null;
}

/** Numbers for the settings screen: what is connected and what is still open. */
export async function capacitySummary(): Promise<CapacityView> {
  await loadState(true);
  const keys = geminiKeys();
  const pairs = await listPairs();

  let remaining = 0;
  let requestsToday = 0;
  let pairsOpen = 0;
  const byModel = new Map<string, { open: number; total: number; requests: number }>();
  const byKey = new Map<string, { open: number; total: number; requests: number }>();

  for (const pair of pairs) {
    const id = pairId(pair);
    const row = state.get(id) ?? blank();
    const open = isOpen(id);
    const cap = row.observedLimit ?? DEFAULT_DAILY_LIMIT;
    requestsToday += row.requests;
    if (open) {
      pairsOpen += 1;
      remaining += Math.max(0, cap - row.requests);
    }
    const m = byModel.get(pair.model) ?? { open: 0, total: 0, requests: 0 };
    m.total += 1;
    m.requests += row.requests;
    if (open) m.open += 1;
    byModel.set(pair.model, m);
    const k = byKey.get(pair.keyLabel) ?? { open: 0, total: 0, requests: 0 };
    k.total += 1;
    k.requests += row.requests;
    if (open) k.open += 1;
    byKey.set(pair.keyLabel, k);
  }

  const reset = earliestReset();
  return {
    keysConnected: keys.length,
    pairsTotal: pairs.length,
    pairsOpen,
    requestsToday,
    estimatedInterviewsLeft: Math.floor(remaining / 23),
    nextResetAt: reset == null ? null : new Date(reset).toISOString(),
    message: pairsOpen === 0 && pairs.length > 0 ? capacityMessage() : "",
    models: MODEL_LADDER.map((model) => {
      const m = byModel.get(model) ?? { open: 0, total: 0, requests: 0 };
      return { model, openKeys: m.open, totalKeys: m.total, requestsToday: m.requests };
    }),
    keys: [...byKey.entries()].map(([label, v]) => ({
      label,
      openModels: v.open,
      totalModels: v.total,
      requestsToday: v.requests,
    })),
  };
}
