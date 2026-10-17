# Make resume analysis feel alive — "analysis theater" screen

Replace the static three-step checklist shown while a resume is processing with a single playful, animated experience. Pure frontend — no backend, pipeline, or data changes. The real backend stage (`extracting` → `analyzing` → `saving`) still drives everything.

## What the user sees

While the resume is analyzed, the page shows one card containing:

1. **Live scanner document** — a stylized CSS/SVG resume sheet (name line, text lines, a skill-chip block). A soft light beam sweeps down the page on loop, and lines light up in sequence as the beam passes, as if the AI is reading it word by word.
2. **Witty rotating commentary** — under the document, one playful line at a time cross-fades every ~3 seconds, e.g. "Reading between the lines…", "Counting your buzzwords (there are many)…", "Locating the part where you saved the day…", "Polishing your profile…". Lines are grouped by the real stage so they stay roughly truthful, and they never claim specific findings (no invented skills or fake "found 12 projects" counts).
3. **Stage-reactive glow orb** — behind/above the document, a soft particle glow (pure CSS, layered blurred radial elements + slow drift animation) that brightens and spins faster as stages complete: calm pulse while extracting, lively swirl while analyzing, convergent flash when saving, then the real results slide in.
4. **The real stage stepper stays**, restyled as a slim animated progress track with a moving shimmer, so the user still sees honest progress: Reading your file → Analyzing your resume → Building your profile.

When the status flips to `completed`, the theater fades out and the existing profile + Start Interview card appear as they do today. Failure and retry states are untouched.

## Technical details

- New component `src/components/AnalyzingExperience.tsx`, rendered from `ProcessingPanel`'s current spot in `src/routes/_authenticated/resume.$id.tsx`. It receives the real `stage` prop; polling and the `processResume` call are unchanged.
- All animation is CSS keyframes added to `src/styles.css` (scanner beam sweep, line highlight, orb drift/pulse, commentary cross-fade). No new packages, no canvas, no video — cheap enough for any laptop.
- Colors come only from existing semantic tokens (`accent`, `primary`, `muted`, `card`, `border`); the glow uses `color-mix` on tokens so light and dark themes both work. Premium and restrained, per the project's design memory — playful motion and copy, not clown UI.
- `prefers-reduced-motion`: beam, orb, and cross-fades collapse to a calm static state with the stepper still visible.
- Copy lines live in a small array inside the component so wording is easy to tweak.

## Verification

- Type check passes.
- Playwright: open a resume in the processing state, screenshot the theater mid-sweep, confirm the three stage labels, commentary rotation, and that completion still reveals the analysis and Start Interview card.
