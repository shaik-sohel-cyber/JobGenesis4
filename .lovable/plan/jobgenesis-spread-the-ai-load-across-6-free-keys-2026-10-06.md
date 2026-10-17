# JobGenesis: spread the AI load across 6 free keys

## The answer first: 5 more keys, 6 total

- One interview costs about 23 AI requests: 1 to read the resume, 1 to plan the interview, 2 per question (judge the answer, write the next question) for about 10 questions, and 1 to write the report.
- 25 interviews a day is about 575 requests a day.
- One key is worth roughly 100 free requests a day, not 20. Measured on your existing key just now: `gemini-2.5-flash` is used up until about 00:00 UTC, but the same key still has live daily allowances on five separate models: `gemini-2.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-3.5-flash-lite`, `gemini-3.6-flash`, and `gemma-4-26b-a4b-it`. Each model gets its own allowance of roughly 20 a day.
- 6 keys x about 100 requests = about 600 a day = about 25 interviews, with a little room for retries.

One rule that decides everything: the daily limit is counted **per Google project**, so extra keys from the same account add nothing. Each key must come from a different Google account. You said 4-6 accounts are available, which lines up exactly with 5 new keys.

## What I'll build

1. **A key pool.** Your existing key stays as key 1; keys 2-6 get their own secure entries. You paste each one into the secure form I open; nothing is written into the code or the browser bundle.
2. **Rotation with health tracking.** Every AI call picks the next healthy key-and-model combination instead of always asking the same one. When a combination reports its limit, the app reads the reset time the provider returns and avoids that combination until then, moving on to the next one silently. Nothing is retried against a key that has already said no.
3. **A clear stop when the free capacity is gone.** When every key and model is used up, the app says so plainly, names when capacity returns, and never quietly spends workspace credits. Interviews already started keep their progress and continue where they stopped once capacity is back.
4. **A capacity readout on the settings screen.** How many keys are connected, how many model allowances are still open today, how many requests have been used, and roughly how many interviews are left. This lets you check the morning of your demo instead of guessing.
5. **A quality gate on the weaker models.** The lighter models are less careful about the exact answer format the interview engine needs. Before the demo I run your real resume and a full interview against each model in the rotation; any model that repeatedly returns unusable output is dropped from the ladder rather than left to break interviews mid-run.
6. **Updated instructions and notes.** The local-run guide gets the key-pool steps and the honest capacity numbers, and the saved project notes get corrected: one key is about 100 requests a day across its model allowances, not 20.

## How a request flows

```text
AI call (resume read, interview plan, judge answer, next question, report)
        |
        v
pick next healthy key+model pair (round robin over 6 keys x 6 models)
        |
   +----+-----------------------------+
   | worked                           | limit reached
   v                                  v
use the answer                  read provider's reset time,
                                bench that pair until then,
                                try the next healthy pair
                                          |
                                   +------+-------+
                                   | pairs left   | none left
                                   v              v
                               keep going    "Today's free capacity is
                                              used up. It returns at
                                              00:00 UTC." (no credits)
```

## Technical details

- **Secrets:** keep `GEMINI_API_KEY` as key 1 and add `GEMINI_API_KEY_2` ... `GEMINI_API_KEY_6` through the secure form. The pool reads whichever are present, so the app works with 2 keys today and 6 later.
- **`src/services/aiProvider.server.ts`** becomes the pool: builds the key-and-model pair list, keeps a round-robin pointer, and exposes `nextPair()` plus `bench(pair, resetSeconds)`. Model ladder, best first: `gemini-3.6-flash`, `gemini-2.5-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-2.5-flash-lite`, `gemma-4-26b-a4b-it`. The built-in workspace gateway stays only as the fallback when no Gemini key exists at all, never as a fallback after a limit.
- **Bench state** lives in a small table (`ai_capacity`: key label, model, day, requests used, benched until) with row-level security for signed-in users, so a server restart or a second instance does not lose the reset times and the settings readout has real numbers.
- **`src/services/interviewEngine/ai.server.ts`** and **`src/services/resumeAnalyzer/analyze.server.ts`** both switch to `nextPair()`, and both parse the provider's reset time from the limit message. A response that fails format validation also benches that pair and retries once on the next one, so a weak model cannot stall an interview.
- **New server function `getCapacity`** returns keys connected, pairs open, requests used today, and estimated interviews left; **`src/routes/_authenticated/settings.tsx`** shows it under the existing service section.
- **Messages** replace the current "The analysis service is busy right now" with the honest capacity wording, including the reset time.
- **Docs and notes:** `README.md` gains the key-pool section and the corrected numbers; the free-tier notes at `mem://features/free-tier-limits` gain the per-model-allowance finding and the per-project rule.

## How I'll check it works

- Probe every key against every model in the ladder and print which allowances are open, so the pool starts from measured facts.
- Run one real resume upload and a full spoken interview, then confirm the request log shows the load landing on several keys and models rather than one.
- Deliberately exhaust one pair and confirm the app moves to the next without a visible error, then exhaust all of them and confirm the clear capacity message and that no workspace credits were spent.
- Confirm the settings readout matches the probe numbers, and that the build and type checks stay clean.

## Notes

- Keys can be added any time before the demo; allowances reset every day, so nothing expires.
- Keeping both AI calls per answer, as you chose, is what holds the 23-requests-per-interview figure.
- If you later want more than about 25 a day, the next lever is either more accounts or one paid key; adding keys from the same account will not help.
