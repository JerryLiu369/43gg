**English** | [README_zh.md (Chinese)](./README_zh.md)

# gaistudio — Multi-Project Workspace for Google AI Studio

This repository serves as a unified private workspace for organizing Google AI Studio web apps and prototypes under a single GitHub repository.

To remain compatible with Google AI Studio's repository-root sync entry and the existing GitHub Pages deployment (`/` and `/ds/`), the repository root hosts the default active workspace (`CHRONO STAGE`), while additional or archived small projects live self-contained under `apps/<project-slug>/`.

---

## Project Catalog

| Slug | Path | Stack / Type | Local Run Command | Docs & Pages Route |
| :--- | :--- | :--- | :--- | :--- |
| `chrono-stage` | `.` (repository root) | React 19 + Vite 8 + TypeScript + Tailwind CSS 4 + WebGL 3D Rally Simulator | `npm run dev` | [Manual (Chinese)](docs/chrono-stage_zh.md) · Pages `/` |
| `ds-stage` | `apps/ds-stage/` | Zero-build static HTML + Vanilla JS + WebGL 1.0 Rally Simulator (mirrored from `ds-stage` branch) | `npm run dev:ds` or open `apps/ds-stage/index.html` | [Project README (Chinese)](apps/ds-stage/README.md) · Pages `/ds/` |

---

## Directory Layout

```text
gaistudio/
├── apps/
│   └── ds-stage/          # Self-contained static app (STAGE)
├── docs/
│   └── chrono-stage_zh.md # Preserved full Chinese manual for root CHRONO STAGE
├── scripts/
│   └── workspace.mjs      # Zero-dependency helper CLI (list, serve, check, stage-pages)
├── src/                   # Root default app source (CHRONO STAGE)
├── index.html             # Root default app entry
├── metadata.json          # Google AI Studio app metadata
├── package.json           # Root dependencies and workspace helper scripts
├── vite.config.ts         # Vite config (base: '/gaistudio/')
├── .env.example           # Placeholder environment variables (never store real keys)
├── .gitignore             # Ignores node_modules/, dist/, .env*, etc. across root and apps/*
├── README.md              # English workspace guide (this file)
└── README_zh.md           # Chinese workspace guide
```

---

## Quick Start & Commands

Run from the repository root:

```bash
npm install          # Install root dependencies
npm run dev          # Start the root app (CHRONO STAGE) on port 3000
npm run dev:ds       # Serve apps/ds-stage locally on http://127.0.0.1:3001/
npm run typecheck    # Run TypeScript check (tsc --noEmit)
npm test             # Run root physics & stage unit tests
npm run build        # Build the root app into dist/
npm run apps:list    # List all discovered projects in the workspace
npm run apps:check   # Check env rules, root typecheck/tests/build, and all apps/* assets & JS syntax
npm run build:pages  # Stage combined dist/ (/ + /ds/) matching gh-pages layout (local build only)
```

---

## Google AI Studio Sync Boundaries & Recommended Workflows

Verified against official Google documentation ([Sync your AI Studio apps with GitHub](https://aistudio.google.com/learn/sync-your-ai-studio-apps-with-github) and [Build apps in Google AI Studio](https://ai.google.dev/gemini-api/docs/aistudio-build-mode)):

- **Platform Boundary**: Google AI Studio Build mode two-way GitHub sync operates strictly at the **repository root level** (one AI Studio workspace synced to one GitHub repository root on `main`). Official docs do **not** provide a subdirectory selector (`apps/<slug>/`), branch selector, or conflict-free binding of multiple separate AI Studio sessions to different folders in one repository. Moreover, importing an existing repo and initiating sync may prompt AI Studio to force-push root compatibility edits.
- **Practical Workflows in One Repository**:

### Workflow A (Recommended for Many Small Apps): Export ZIP from AI Studio -> Commit under `apps/<project-slug>/`

1. Build and iterate on a small app in Google AI Studio, then download its ZIP export.
2. Locally run `git pull origin main`.
3. Extract the project into `apps/<project-slug>/` (e.g., `apps/json-diff-tool/`), keeping dependencies, assets, and docs self-contained.
4. Run `npm run apps:check`, add an entry to the Project Catalog tables in `README.md` and `README_zh.md`, then commit and push.

### Workflow B (Active Root Slot + Archive Rotation)

If you bind `JerryLiu369/gaistudio` directly in AI Studio Settings -> GitHub:

1. Treat the **repository root** as the single active AI Studio two-way sync slot (`CHRONO STAGE` currently).
2. Always **Pull before editing** and **Push promptly**; avoid blind force-pushes that could overwrite repository history or `apps/`.
3. When switching the active root slot to a new app, archive the finished root project into `apps/<project-slug>/` locally and commit/push first before replacing root files.

---

## Adding a New Small Project & Secrets Rules

1. **Naming**: Place each app under `apps/<project-slug>/` using lowercase kebab-case (e.g., `apps/pomodoro-timer/`).
2. **Self-Contained Assets**: Keep each project's `index.html`, `src/`, `assets/`, `public/`, and optional `package.json` / `metadata.json` inside its own folder. Prefer relative paths (or configure `base` appropriately) if you intend to host under a subpath.
3. **Secrets & `.env` Hygiene**:
   - **Never** commit `.env` files or real API keys to Git.
   - Commit `.env.example` with placeholder values only (`GEMINI_API_KEY="MY_GEMINI_API_KEY"`), and keep real credentials in local `.env` (already excluded recursively across root and `apps/*` by `.gitignore`).

---

## Branches & GitHub Pages Visibility

- `main`: Default multi-project workspace branch.
- `ds-stage`: Preserved historical branch for `STAGE` (also mirrored under `apps/ds-stage/` on `main`).
- `gh-pages`: Legacy static deployment branch (`/` serves `CHRONO STAGE`; `/ds/` serves `STAGE`).
- **Visibility Notice**: Although `JerryLiu369/gaistudio` is a **private** repository, its currently enabled GitHub Pages site (`https://jerryliu369.github.io/gaistudio/`) is **publicly accessible** (`public: true`). Do not deploy sensitive data to `gh-pages`.
