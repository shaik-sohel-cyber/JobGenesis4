# Make JobGenesis ready to post on LinkedIn

Goal: an outside person who clicks the link can discover the AI interviewer, sign in with one click, complete an interview, and share the result back — within current free capacity.

## 1. Landing page tells the truth (biggest fix)
`src/routes/index.tsx` currently labels the AI Interview, Reports, Skill Validation and Project Verification as "Coming soon" even though they are all live.
- Rewrite the hero: lead with the voice AI interview ("Your resume talks. Our AI interviewer finds out what's real.") with the report as the payoff, resume analysis as step one.
- Update the capabilities grid: mark AI Interview, Role/JD matching, Integrity signals and Reports as Available; keep webcam analysis out of the marketing copy.
- Update "How it works today" to the real 4-step flow: Upload → Analyze → Voice interview → Report.
- Keep the existing restrained visual style (no new design direction).

## 2. One-click entry for strangers
In `src/components/AuthForm.tsx`:
- Make "Continue with Google" the primary, visually dominant button on both signup and login; email+password becomes secondary.
- This sidesteps the email-confirmation round trip for most visitors (default-sender confirmation emails can land in spam for outsiders).
- Verify Google sign-in works on the published URL (not just preview) with a real browser pass.

## 3. Capacity honesty instead of dead ends
- Surface remaining interview capacity (derived from the existing `ai_capacity` per-key daily counts) on the interview start screen: "X interview slots left today."
- When capacity is exhausted, show a friendly full-state screen with the reset time (keys reset around UTC midnight) instead of a generic error — invite people to return tomorrow, capture nothing that burns quota.
- Resume analysis stays available (1 AI call) even when interviews are full.

## 4. Shareable report (the growth loop)
- Add a public share page for a report: `/share/report/<random token>` showing a clean scorecard — headline result, role fit summary, 2–3 strengths and 2–3 growth areas — with no private data, no transcripts, no integrity details.
- Report owner gets a "Copy share link" and "Share on LinkedIn" action on the report page; sharing is opt-in per report via a generated token.
- Public page is read-only, no auth, token unguessable; server route verifies token and serves only the sanitized summary.

## 5. Pre-post checklist (run before you publish the post)
- One full real-machine pass as a brand-new outsider: Google sign-in → upload → analysis → voice interview (confirm greeting, "repeat that" intent, mic picker) → report → share link opens logged-out.
- Confirm email confirmation still arrives for people who choose email signup.

## Out of scope
- Custom email domain (needs a purchased domain — decide later if deliverability becomes a problem).
- Second-voice detection, payments, admin changes.
