# Give the interview a real opening

## The problem
When the interview goes active, the engine immediately generates the first blueprint question. Even though the blueprint starts with an "introduction" item, the AI often opens with projects or background probes — no hello, no introduction, no settling in. A real interviewer greets the candidate, introduces themselves, sets expectations, and eases in with a soft opener.

## What changes

**1. A warm greeting becomes the first thing the candidate hears**
- When the interview starts (zero questions asked), the engine inserts a greeting message before touching the blueprint, for example:
  > "Hi [name], welcome, and thanks for taking the time today. I'll be your interviewer — this is a relaxed conversation about your background and the work on your resume, about 15 to 20 minutes. Nothing tricky, just answer naturally. Before we dive in: how are you doing today?"
- Personalised with the candidate's name from their resume; spoken aloud through the same voice path as every other question.
- Costs zero AI requests — the greeting is a fixed, well-written template, not a generated call. This matters given the daily free-key limits.

**2. The greeting answer is stored but not analyzed**
- The candidate's reply ("doing well, thanks!") is saved and shown in the conversation as normal.
- The answer evaluator skips the greeting turn, so no AI request is spent scoring small talk and no noise enters the evidence or the final report.
- After the greeting is answered, the interview flows into the blueprint's introduction item exactly as it does today.

**3. The first real question stays warm**
- Strengthen the question writer's instructions: when the only exchange so far is the greeting, briefly acknowledge what the candidate said, then ask an easy, open opener (e.g. invite them to walk through their background) — never jump straight into a project or technical claim.

## Technical details
- `orchestrator.server.ts` (`runNextQuestion`): if the interview has no questions yet, insert the greeting row (category `introduction`, no blueprint item, no claim) and return; the blueprint activates only after the greeting is answered.
- `orchestrator.server.ts` (`runPendingAnalysis`): skip questions with no blueprint item so the greeting answer never triggers an AI analysis call; the follow-up engine already treats "no analysis" as "move to the next item", so flow is unchanged.
- `questionGenerator.server.ts`: add the warm-opening rule to the system prompt.
- No database, UI, voice, or report changes needed — the greeting travels the existing question/answer/speech path, and interviews already in progress are unaffected.

## Verification
- Run a fresh interview end-to-end in the preview: greeting is spoken first, reply is accepted, and the next question opens warmly about background rather than projects.
- Confirm the settings capacity card shows the greeting cost nothing extra (no additional requests consumed).
