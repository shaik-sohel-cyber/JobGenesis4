# JobGenesis AI Interviewer — Phase 1

Resume intelligence only: sign up, upload a resume, get a structured, AI-extracted candidate profile. No live interview, voice, webcam, or scoring — but the data model leaves room for them.

## Decisions locked in
- Built-in AI (Gemini models) for resume analysis — no API key needed from you.
- Signup logs you in immediately, no confirmation email.
- Email/password plus Google sign-in.

## Pages
- `/` — landing page: "Know Your Resume. Prove Your Skills." with the six capabilities; Resume Intelligence live, the rest marked "Coming soon".
- `/login`, `/signup` — email/password and Google; success goes to the dashboard.
- `/dashboard` — welcome, current resume card (name, upload date, status), an "AI Interview — coming next phase" placeholder, and recent activity.
- `/resume/upload` — drag-and-drop or browse, PDF/DOCX up to 10 MB, with validation, upload progress, and clear success/error states.
- `/resume/:id` — analysis page with Candidate Overview, Education, Skills, Projects, Experience, Certifications, Achievements, and Resume Claims.
- `/settings` — account info, sign out, delete resume data.

Everything except the landing page and auth pages requires being signed in.

## The resume flow
1. File is validated in the browser, then stored in a private area only you can read (`{user_id}/{resume_id}/{filename}`).
2. A resume record is created with status `uploaded`.
3. Backend processing starts: text is extracted from the PDF or DOCX, sent to Gemini with a strict schema, and the response is validated before anything is saved.
4. The processing screen shows real backend stages — uploaded, extracting text, analyzing, saving profile — never fake percentages; it polls the actual status.
5. On success the page moves to the finished analysis. On failure the status is set to `failed` with a plain-English message and a Retry button.

The AI is instructed never to invent anything: missing fields come back empty rather than guessed.

## Resume Claims
Each verifiable statement ("Built a real-time interviewer using WebSockets") is stored with its type, related project/skill, supporting evidence text, and a high/medium/low verification priority. The UI frames these neutrally: these are the points a future AI interview may ask follow-ups about — never an accusation.

## Design
Premium, restrained SaaS look: clean typography, generous spacing, rounded cards, subtle motion, fully responsive. No neon, heavy gradients, or glassmorphism. All colors go through a semantic theme so light/dark stay consistent.

## Technical notes
- Backend: Lovable Cloud (Postgres, auth, private storage). Tables: `resumes`, `resume_skills`, `resume_projects`, `resume_experience`, `resume_education`, `resume_certifications`, `resume_claims`, matching the field lists in the spec, plus a `profiles` table for display name.
- Row Level Security on every table, `auth.uid()`-scoped, with explicit grants; child tables scoped through their parent resume's owner. Storage policies restrict each user to their own `{user_id}/` prefix. RLS is never disabled.
- Processing runs as a TanStack server function (this stack's server runtime) rather than a Supabase Edge Function: authenticates the caller, verifies resume ownership, downloads the file with admin access, extracts text, calls the AI gateway with a JSON schema, validates with Zod, writes the normalized rows in one pass, and updates status.
- PDF and DOCX text extraction uses pure-JS, Worker-compatible libraries (no native binaries).
- Service boundaries under `src/services/`: `resumeAnalyzer` implemented; `interviewEngine`, `voiceEngine`, `webcamAnalyzer`, `evaluationEngine`, `reportGenerator` left as typed stubs.
- Google sign-in goes through the managed OAuth broker; email sign-in enabled with auto-confirm.

## Verification before finishing
Sign up, sign in, upload a real resume, watch it process, and confirm the analysis page shows data extracted from that actual file — including claims — plus that retry works after a forced failure and that one account cannot read another's data.
