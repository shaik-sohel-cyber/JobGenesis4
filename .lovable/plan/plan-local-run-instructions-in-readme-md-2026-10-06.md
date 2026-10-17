# Plan: Local run instructions in README.md

## What to build
Replace the generic README.md with a complete, beginner-friendly guide for downloading the project, opening it in VS Code, and running it locally.

## File
- `README.md` — rewritten (single file, so instructions travel with the code).

## Guide contents
1. **Prerequisites** — install Node.js 20+ (nodejs.org, LTS) and VS Code; no other tools needed.
2. **Open the project** — extract the downloaded ZIP, open the folder in VS Code (File → Open Folder).
3. **Install packages** — `npm install` in the VS Code terminal (first run takes a few minutes).
4. **Environment file** — the download includes `.env` with the project's connection variables (safe, publishable keys only). Explain:
   - Do not delete or rename `.env`; the app won't start without it.
   - Never commit `.env` to a public repo or share it.
   - Secret API keys (Gemini, voice providers) are NOT in the download — to use them locally, add lines to `.env` yourself, e.g. `GEMINI_API_KEY=...`, `GROQ_API_KEY=...`, `CARTESIA_API_KEY=...`. Without them the app still runs; it just falls back to built-in/browser services.
5. **Run the app** — `npm run dev`, open http://localhost:8080. Sign in with the same account as the live app (same backend).
6. **Important note** — local runs connect to the same hosted cloud database and storage as the published app; nothing is duplicated locally, so changes to data are real.
7. **Other commands** — `npm run build` (production build), `npm run preview`, `npm run lint`, `npm run format`.
8. **Troubleshooting** — common fixes: missing `.env` error, port already in use, install failures (retry with a clean `node_modules`), mic/camera permissions in the browser, voice providers inactive without keys.
9. **Stopping** — Ctrl+C in the terminal.

Keep the guide plain-English and step-numbered; no framework jargon beyond command names.

## Verification
- Read the final README to confirm every command matches `package.json` scripts and the actual `.env` variable names.
