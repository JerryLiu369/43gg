**English** | [README_zh.md (Chinese)](./README_zh.md)

# gaistudio — Unified React WebApp Workspace

`gaistudio` is a single unified React 19 + Vite 8 + TypeScript + Tailwind CSS 4 web application shell that hosts multiple isolated mini-apps under one entry point and one development/preview origin.

---

## Hosted Apps

| App ID | Title | Runtime Isolation | Location | Route | Documentation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `chrono-stage` | `CHRONO STAGE` | Lazy-loaded React module (`React.lazy`) with lifecycle teardown | `src/apps/chrono-stage/` | `/?app=chrono-stage` | [Manual (Chinese)](docs/chrono-stage_zh.md) |
| `ds-stage` | `STAGE` | Isolated static HTML + Vanilla JS + WebGL 1.0 `<iframe>` sandbox | `apps/ds-stage/` | `/?app=ds-stage` | [Project README (Chinese)](apps/ds-stage/README.md) |

---

## Architecture & Directory Layout

```text
gaistudio/
├── src/
│   ├── App.tsx                  # Unified shell router, Home Hub / active app viewport & top bar
│   ├── apps/
│   │   ├── registry.ts          # Single project registration entry for all mini-apps
│   │   └── chrono-stage/        # CHRONO STAGE lazy-loaded React app entry
│   ├── shell/
│   │   ├── HomeHub.tsx          # Responsive Home Hub launcher (desktop + mobile)
│   │   ├── IframeAppHost.tsx    # Isolated iframe host with explicit teardown on exit
│   │   ├── AppErrorBoundary.tsx # Sub-app error boundary with Home recovery
│   │   ├── router.ts            # Portable URL routing (?app=..., #/apps/..., subpath-safe)
│   │   └── shell.test.ts        # Registry and router unit tests
│   ├── components/              # CHRONO STAGE UI modals & SVG pacenote signs
│   ├── game/                    # CHRONO STAGE physics, stages, audio, input & tests
│   └── render/                  # CHRONO STAGE WebGL 3D renderer
├── apps/
│   └── ds-stage/                # Self-contained static WebGL rally game (iframe sandbox)
├── docs/
│   └── chrono-stage_zh.md       # CHRONO STAGE manual (Chinese)
├── scripts/
│   └── workspace.mjs            # Workspace discovery, validation & static staging CLI
├── vite.config.ts               # Relative base (`./`) + static apps dev/build integration
├── index.html                   # Standard React/Vite root entry
├── metadata.json                # Google AI Studio app metadata
├── .env.example                 # Placeholder environment variables (never commit real keys)
└── .gitignore                   # Ignores node_modules/, dist/, .env*, etc.
```

Key properties of the unified shell:

- **Single Dev & Preview Entry**: `npm run dev` launches the entire workspace on `http://127.0.0.1:3000/`. No multiple dev servers or manual entry switching is required.
- **No Premature Engine Startup**: Opening the Home Hub (`/`) initializes zero WebGL contexts, zero `requestAnimationFrame` loops, and zero `AudioContext` instances.
- **Clean Exit Teardown**: Exiting any app back to the Home Hub unmounts the module/sandbox and disposes WebGL resources, animation frames, Web Audio contexts, speech synthesis, and keyboard/resize listeners.
- **Dual-Path Portability**: Built with Vite relative base (`base: './'`) and portable query/hash routing (`?app=<id>` and `#/apps/<id>`), working identically both at root `/` (local dev/preview and Google AI Studio) and under the GitHub Pages subpath `/gaistudio/`.

---

## Quick Start & Commands

Run from the repository root:

```bash
npm install          # Install workspace dependencies
npm run dev          # Start unified React shell + static sub-apps on port 3000
npm run typecheck    # Run TypeScript compiler check (tsc --noEmit)
npm test             # Run physics + shell/registry unit tests
npm run build        # Build production dist/ (root shell + bundled static apps/*)
npm run preview      # Preview production dist/ locally
npm run apps:list    # List discovered shell and mini-apps
npm run apps:check   # Validate .env hygiene, tsc, unit tests, vite build, and static apps
npm run dev:ds       # Optional standalone static server for apps/ds-stage on port 3001
```

---

## Adding a New Mini-App

Only a new app folder plus a single entry in `src/apps/registry.ts` is required — no changes to `vite.config.ts`, `package.json`, or routing internals:

### Option 1: React Mini-App (Recommended for AI Studio React Mode)

1. Create `src/apps/<slug>/index.tsx` exporting a default React component (clean up any timers, listeners, animation frames, or audio in `useEffect` return callbacks).
2. Add one entry to `APP_REGISTRY` in `src/apps/registry.ts` with `kind: 'react-lazy'` and `loader: () => import('./<slug>/index.tsx')`.

### Option 2: Self-Contained Static HTML / Vanilla JS App

1. Place the app directory under `apps/<slug>/` containing `index.html` and relative asset references.
2. Add one entry to `APP_REGISTRY` in `src/apps/registry.ts` with `kind: 'iframe'` and `entryPath: 'apps/<slug>/index.html'`.
3. `vite.config.ts` automatically serves `/apps/<slug>/` during `npm run dev` and copies non-secret runtime assets into `dist/apps/<slug>/` during `npm run build`.

---

## Google AI Studio Build Mode & GitHub Sync Workflow

Based on Google's official documentation ([Sync your AI Studio apps with GitHub](https://aistudio.google.com/learn/sync-your-ai-studio-apps-with-github) and [Build apps in Google AI Studio](https://ai.google.dev/gemini-api/docs/aistudio-build-mode)):

- Official documentation covers importing and syncing an entire repository into Google AI Studio Build mode (selecting React as the client framework) with two-way GitHub commit/pull/push sync; it does **not** document per-subdirectory binding or selecting separate branches per mini-app.
- **Recommended Workflow**: Import this single repository (`JerryLiu369/gaistudio`) into Google AI Studio as one unified React workspace, select React in AI Studio Build settings, and add or iterate on each mini-app inside its own isolated directory registered via `src/apps/registry.ts`.
- Pull before editing and commit/push promptly to keep AI Studio and local changes in sync without force-pushing.
- Note: Local development (`npm run dev`), production build (`npm run build`), `npm run preview`, and GitHub Pages output have been verified directly; behavior inside the live Google AI Studio web UI itself was not separately tested in an authenticated session.

---

## Visibility, Branches & Secrets

- `main`: Private source repository workspace (`JerryLiu369/gaistudio`, `private: true`).
- `ds-stage`: Preserved historical standalone branch for `STAGE` (also stored under `apps/ds-stage/` on `main`).
- `gh-pages`: Public static deployment branch (`public: true` via GitHub Pages at `https://jerryliu369.github.io/gaistudio/`).
- **Intentional Split Visibility**: Keeping source code **Private** while serving the compiled static WebApp **Publicly** on GitHub Pages is an intentional configuration. `gh-pages` only receives pure compiled runtime files from `dist/` (`.nojekyll`, `index.html`, `assets/`, `apps/*` runtime assets) — never `src/`, `.env*`, credentials, or `.aistudio/` temporary media.
- **Secrets**: Never commit real `.env` files or API keys anywhere in the repository; keep placeholders only in `.env.example`.
