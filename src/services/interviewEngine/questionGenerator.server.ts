import { z } from "zod";
import { callStructured, INTERVIEWER_RULES } from "./ai.server";
import { DIFFICULTIES, QUESTION_CATEGORIES } from "./types";
import type { InterviewState } from "./interviewStateManager.server";

const outSchema = z.object({
  question: z.string().min(5).max(700),
  category: z.enum(QUESTION_CATEGORIES),
  difficulty: z.enum(DIFFICULTIES),
});
const jsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["question", "category", "difficulty"],
  properties: {
    question: { type: "string" },
    category: { type: "string", enum: QUESTION_CATEGORIES },
    difficulty: { type: "string", enum: DIFFICULTIES },
  },
};

const SYSTEM = `You are a warm, sharp senior technical interviewer conducting a live text interview.
${INTERVIEWER_RULES}

Question style:
- Generate exactly ONE next question. Natural, concise (usually 1-2 sentences), conversational.
- If the only exchange so far is the greeting, briefly and warmly acknowledge what the candidate said, then ask an easy, open opener (for example, invite them to walk you through their background and experience). Never open with a project, a technical claim, or a deep probe.
- Never prefix with "Question 1:" or similar. You may open with a brief natural transition that references the previous answer ("Got it.", "You mentioned earlier that ...").
- Use progressive depth. Depth levels: 1 what is it, 2 your role, 3 how you implemented it, 4 why that approach, 5 trade-offs considered, 6 behaviour at much larger scale. Target the requested depth; don't jump levels without reason.
- Reuse earlier answers as context when useful (cross-question memory), but never re-ask something already answered.
- The question must be designed to obtain concrete evidence about the current objective.
- Prefer questions only the real author of the work can answer quickly: specific decisions they made, why they chose X over Y, what broke and how they found it, what they would change. Avoid textbook "what is X" questions that a chatbot could answer generically.
- If a target role is given, connect questions to what that role needs. When the current skill is required by the role but absent from the resume, ask politely and openly whether they've had any exposure to it — never assume they lack it.`;

export type GeneratedQuestion = z.infer<typeof outSchema>;

/** generateInterviewQuestion — produces exactly one next question for the current blueprint item. */
export async function generateInterviewQuestion(input: {
  state: InterviewState;
  resumeSummary: string;
  role?: string;
  item: { stage: string; objective: string; target_skill: string | null; target_project: string | null; claim: string | null };
  depthLevel: number;
  followUp: { reason: string; direction: string } | null;
}): Promise<GeneratedQuestion> {
  const { state, item, followUp } = input;
  const user = `Analyzed resume:
${input.resumeSummary}
${input.role ?? ""}


Conversation so far (oldest first):
${state.transcriptText || "(the interview is just starting)"}

Evidence collected so far:
${state.evidence_collected.slice(-15).map((e) => `- [${e.strength}] ${e.evidence}`).join("\n") || "(none yet)"}

Topics to avoid repeating: ${state.topics_to_avoid.join("; ") || "(none)"}

Current blueprint item:
- stage: ${item.stage}
- objective: ${item.objective}
- target skill: ${item.target_skill ?? "none"}
- target project: ${item.target_project ?? "none"}
- target resume claim: ${item.claim ?? "none"}
Target depth level: ${input.depthLevel}
${
  followUp
    ? `This is a FOLLOW-UP to the candidate's last answer. Reason: ${followUp.reason}. Recommended direction: ${followUp.direction}. Use category "follow_up" or "clarification".`
    : `This opens the current blueprint item. Transition naturally from the previous topic.`
}
Candidate name (use sparingly): ${state.candidateName ?? "unknown"}

Write the next question.`;
  return callStructured({ name: "interview_question", system: SYSTEM, user, jsonSchema, validator: outSchema });
}
