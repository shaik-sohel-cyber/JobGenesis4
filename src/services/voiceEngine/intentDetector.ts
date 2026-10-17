/**
 * Detects short conversational requests ("repeat that", "give me a second") so they are
 * never saved or scored as answers. Local and deterministic — no AI calls.
 */
export type MetaIntent = "repeat" | "pause" | null;

const REPEAT = [
  /\b(can|could|would) you (please )?(repeat|say) (that|it|the question)( again)?\b/,
  /\brepeat (that|the question|it|please)\b/,
  /^(sorry|pardon|excuse me)\b.{0,15}$/,
  /\b(say|ask) (that|it) again\b/,
  /\bi (didn'?t|did not|couldn'?t|could not) (catch|hear|get|understand) (that|it|you|the question)\b/,
  /\bwhat (was|is) the question\b/,
  /^what( was that| did you say)?\??$/,
  /\bone more time\b/,
  /^come again\b/,
];
const PAUSE = [
  /\bgive me (a|one) (second|sec|moment|minute|min)\b/,
  /\b(let me|i need to|i want to) (think|gather my thoughts)\b/,
  /^(hold on|hang on|wait|one sec(ond)?|just a (second|moment|sec|minute))\b/,
  /\bneed (a|one) (second|moment|minute)\b/,
];

export function detectMetaIntent(raw: string): MetaIntent {
  const text = raw.toLowerCase().replace(/[^a-z' ?]/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return null;
  // Real answers are longer; only short utterances can be meta-requests.
  if (text.split(" ").length > 14) return null;
  if (REPEAT.some((r) => r.test(text))) return "repeat";
  if (PAUSE.some((r) => r.test(text))) return "pause";
  return null;
}
