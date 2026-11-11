**English** | [README_zh.md (Chinese)](./README_zh.md)

> **Live WebApp:** [https://jerryliu369.github.io/gaistudio/](https://jerryliu369.github.io/gaistudio/) (auto-deployed from `main` via GitHub Actions)  
> Direct App Links: [Lucky Landlord](https://jerryliu369.github.io/gaistudio/?app=lucky-landlord) | [CHRONO STAGE](https://jerryliu369.github.io/gaistudio/?app=chrono-stage)

# gaistudio — Unified React WebApp Workspace

`gaistudio` is a single unified React 19 + Vite 8 + TypeScript + Tailwind CSS 4 web application shell that hosts multiple isolated mini-apps under one entry point and one development/preview origin.

---

## Hosted Apps

| App ID | Title | Runtime Isolation | Location | Route | Documentation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `lucky-landlord` | `Lucky Landlord` | Lazy-loaded React module (`React.lazy`) with localStorage auto-save & audio teardown | `src/apps/lucky-landlord/` | `/?app=lucky-landlord` | Built-in Compendium |
| `chrono-stage` | `CHRONO STAGE` | Lazy-loaded React module (`React.lazy`) with WebGL/Audio lifecycle teardown | `src/apps/chrono-stage/` | `/?app=chrono-stage` | [Manual (Chinese)](docs/chrono-stage_zh.md) |

---

## Architecture & Directory Layout

```text
gaistudio/
├── src/
│   ├── App.tsx                  # Unified shell router, Home Hub / active app viewport & top bar
│   ├── apps/
│   │   ├── registry.ts          # Single project registration entry for all mini-apps
│   │   ├── lucky-landlord/      # Lucky Landlord (Tabletop slot-building roguelike)
│   │   └── chrono-stage/        # CHRONO STAGE lazy-loaded React app entry
│   ├── shell/
│   │   ├── HomeHub.tsx          # Responsive Home Hub launcher (desktop + mobile)
│   │   ├── IframeAppHost.tsx    # Isolated iframe host with explicit teardown on exit
│   │   ├── AppErrorBoundary.tsx # Sub-app error boundary with Home recovery
│   │   ├── router.ts            # Portable URL routing (?app=..., #/apps/..., subpath-safe)
│   │   └── shell.test.ts        # Registry and router unit tests
│   ├── components/              # CHRONO STAGE UI modals & SVG pacenote signs
│   ├── game/                    # CHRONO STAGE 120Hz physics, 6 stages, WRC championship & tests
│   └── render/                  # CHRONO STAGE WebGL 3D atmospheric & terrain renderer
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
npm run apps:check   # Validate .env hygiene, tsc, unit tests, and vite build
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
- `ds-stage`: Preserved historical standalone branch for `STAGE`.
- `gh-pages`: Preserved historical deployment branch. It is **no longer** the GitHub Pages publishing source.
- **Automated GitHub Pages Deployment (`main` -> Pages)**: Pushing to `main` automatically triggers [`.github/workflows/deploy-pages.yml`](./.github/workflows/deploy-pages.yml) (`build_type: workflow`), which runs `npm run apps:check` (`.env` hygiene check, TypeScript typecheck, unit tests, and `vite build`) and publishes `./dist` to `https://jerryliu369.github.io/gaistudio/` (manual runs are also supported via `workflow_dispatch`).
- **Intentional Split Visibility**: Keeping source code **Private** (`private: true`) while serving the compiled static WebApp **Publicly** (`public: true`) on GitHub Pages is an intentional configuration. Only compiled runtime assets inside `./dist` (`index.html`, `assets/`, and optional `apps/*` static runtime files) are deployed — never `src/`, `.env*`, credentials, or `.aistudio/` temporary files.
- **Secrets**: Never commit real `.env` files or API keys anywhere in the repository; keep placeholders only in `.env.example`.
