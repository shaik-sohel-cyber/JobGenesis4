# JobGenesis — How to run this project on your computer

This guide explains how to download the project, open it in VS Code, and run it locally. Follow the steps in order — no programming experience needed.

## 1. What you need first

1. **Node.js (version 20 or newer)** — download the free "LTS" version from [nodejs.org](https://nodejs.org) and install it with all default options. To check it worked, open a terminal and run `node -v` — it should print `v20.` or higher.
2. **VS Code** — download from [code.visualstudio.com](https://code.visualstudio.com).

Nothing else is required.

## 2. Open the project in VS Code

1. Download the project (ZIP) and extract it to a folder on your computer, e.g. `Documents\jobgenesis`.
2. Open VS Code → **File → Open Folder…** → choose the extracted folder.
3. Open the built-in terminal with **View → Terminal** (or press Ctrl+` / Cmd+`).

## 3. Install the packages

In the VS Code terminal, run:

```sh
npm install
```

This downloads everything the app needs (takes a few minutes the first time). You only do this once per copy of the project.

> If `npm` is not recognized, Node.js was not added to your PATH — reinstall it and restart VS Code.

## 4. Environment variables

Environment files are not included. Create a `.env` file in the project root using your existing Supabase project values. Copy the publishable key from the Supabase project settings; it is intended for browser use. Do not use a secret or service-role key for either `VITE_` variable.

```sh
VITE_SUPABASE_URL=https://pxclqsjzoljgjohphzmx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_existing_publishable_key

# Server-side Supabase settings used by authenticated server functions.
SUPABASE_URL=https://pxclqsjzoljgjohphzmx.supabase.co
SUPABASE_PUBLISHABLE_KEY=your_existing_publishable_key

# Server-only: required by privileged admin operations. Never add a VITE_ prefix.
SUPABASE_SERVICE_ROLE_KEY=your_existing_service_role_key
```

The Vite build supports existing Vercel settings named `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` for the browser client as a compatibility fallback. Prefer `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for new deployment configuration. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only.

**Other secret API keys are not included.** Keys for Gemini, Groq, Cartesia, Deepgram, ElevenLabs, etc. are stored separately. To use them locally, add the ones you already have to `.env`, for example:

```sh
GEMINI_API_KEY=your_key_here
# Optional but recommended: the AI load is spread across up to six separate
# Gemini keys, each from its own Google account (limits are per account, so
# extra keys from one account add nothing). Add as many as you have — the app
# rotates through them and sets aside any key that reports it is used up:
GEMINI_API_KEY_2=your_second_key
GEMINI_API_KEY_3=your_third_key
GROQ_API_KEY=your_key_here
CARTESIA_API_KEY=your_key_here
DEEPGRAM_API_KEY=your_key_here
ELEVENLABS_API_KEY=your_key_here
```

The app runs fine without them — AI features just fall back to the built-in services, and voice falls back to the browser's voice.

## 5. Run the app

```sh
npm run dev
```

The terminal prints a local address — open it in your browser (usually **http://localhost:8080** or **http://localhost:5173**; check the exact line in the terminal).

Sign in with the same account you use in the live app — it connects to the same backend.

## 6. Important: your data is real

A local run connects to the same hosted cloud database and file storage as the published app. Nothing is copied locally — resumes, interviews, and reports you create locally are real and visible in the live app too (and vice versa). Keep this in mind when testing.

## 7. Other commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the app in development mode (live reload) |
| `npm run build` | Create a production build |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Check the code for problems |
| `npm run format` | Auto-format all files |

## 8. Stopping the app

Press **Ctrl+C** in the terminal (Cmd+C on Mac). Run `npm run dev` again any time to restart.

## 9. Troubleshooting

- **"Missing Supabase environment variable(s)"** — create the root `.env` file with the public `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` values shown in step 4, then restart the dev server.
- **Port already in use** — another app is on that port. Close the other terminal running the app, or run `npm run dev -- --port 3000` to use a different port.
- **`npm install` fails** — delete the `node_modules` folder and `package-lock.json` if present, then run `npm install` again.
- **Microphone or camera not working** — the browser asks for permission the first time; allow it. Camera analysis only works on `localhost` or an HTTPS site.
- **Voice services show as inactive in Settings** — their API keys are not in your local `.env`. Add the keys (see step 4) or rely on the built-in fallbacks.
- **Changes not appearing** — make sure the dev server is running and refresh the browser.
