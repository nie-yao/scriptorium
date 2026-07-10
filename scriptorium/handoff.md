# Handoff: Scriptorium LaTeX Review Web App

## Context

The goal is to build a local LaTeX paper editing and review app. The app should feel like a lightweight Overleaf, but its key feature is AI-change review: after AI proposes edits to a `.tex` file, the user can accept or reject each change while still freely editing the document, then save the final version.

The detailed current requirements and implementation notes are in:

- `latex-review-webapp-requirements.md`

Move that file together with this handoff when changing the project directory.

## Decisions Already Made

- Build the first MVP as a Web app.
- Use React + TypeScript + Vite for the frontend.
- Use CodeMirror 6 for the LaTeX editor.
- Use PDF.js for PDF preview.
- Keep all deterministic logic in code algorithms, not AI:
  - diff generation
  - hunk splitting
  - hunk anchoring and relocation
  - Accept / Reject behavior
  - conflict detection
  - LaTeX compilation
  - file/session persistence
- AI is only responsible for generating proposed edits.
- Design the architecture so the app can later become a cross-platform desktop app.
- Use Tauri + Rust for the macOS desktop shell, with the existing React UI retained.
- Keep Electron only as a fallback if Tauri causes major compatibility issues.

## Architecture Direction

Use a platform-interface architecture:

```text
packages/core/
  diff, hunk, anchor, review session, LaTeX project logic

apps/web/
  React components, CodeMirror integration, review panel, PDF viewer

packages/platform/
  ProjectManagerProvider
  FileSystemProvider
  LatexCompilerProvider
  AiSuggestionProvider

apps/
  local-server-rs
  desktop-tauri (phase 3)
```

The UI should not directly access Node.js, Tauri, Electron, the filesystem, `latexmk`, or AI APIs. It should call platform adapters instead.

## Current Implementation

The current Web MVP includes:

1. A Projects home page backed by `.scriptorium/projects.json`.
2. Creating a basic project under the workspace root.
3. Opening an existing project path inside the workspace root.
4. A project workspace with file tree, CodeMirror editor, PDF / Review / Logs tabs, and status bar.
5. Text editing for `.tex`, `.bib`, `.cls`, `.sty`, and `.bst` files.
6. Uploading supported LaTeX/image/PDF files, creating folders, and dragging project entries to move them.
7. Client-side review sessions from `Original`, editable `Proposed`, and `Working` text.
8. Per-hunk `Accept`, `Reject`, `Keep Edit`, `Use AI`, and hunk-level `Undo` actions.
9. Editor-side red/green hunk decorations, selectable review mark styles, hunk focusing from the Review panel, and deterministic inline diff highlighting.
10. Blocking final review save while any hunk is `pending` or `conflict`, then saving final `Working` text back to disk with a `.bak` backup.
11. Compiling with `latexmk`, showing stdout/stderr/log text, and previewing PDFs through PDF.js.

The web UI currently uses a seeded demo proposal plus a manual Proposed text box. It does not call a real `AiSuggestionProvider` yet.

## macOS Migration Progress

The desktop migration is intentionally split into four stages:

1. Abstract the React frontend's platform API layer.
2. Provide the Web HTTP API through a Rust implementation.
3. Add Tauri and migrate Rust capabilities from HTTP to Tauri command/IPC.
4. Package the macOS `.app` and `.dmg`, including `latexmk` discovery, permissions, and project-directory access.

Stages 1 and 2 are complete.

### Stage 1: Platform API Abstraction

- `packages/platform/` now exposes an aggregate `ScriptoriumPlatform` interface.
- `apps/web/src/platform/runtimePlatform.ts` selects the current Web implementation at runtime.
- `useScriptoriumApp` depends on the platform interface rather than direct HTTP assumptions.
- `PdfPreview` receives PDF bytes through the platform API rather than calling `fetch` directly.

This is the boundary the future Tauri adapter should implement. Do not reintroduce direct browser HTTP or filesystem calls into React components.

### Stage 2: Rust HTTP Backend

- Added the Cargo workspace and Rust crate at `apps/local-server-rs/`.
- The Axum server preserves the Web API used by the React app: projects, tree/file operations, folders, uploads, moves, review sessions, LaTeX compilation, PDF output, and logs.
- `latexmk -pdf -interaction=nonstopmode -halt-on-error` is executed by the Rust backend.
- `npm run dev` starts the Rust backend.
- `npm test` delegates server tests to `cargo test -p scriptorium-local-server`.
- `Cargo.lock` is included for reproducible Rust dependency resolution; Rust build output (`target/`) is ignored.

The following checks passed after installing Rust and LaTeX locally:

- `cargo test -p scriptorium-local-server`: 7 Rust unit tests passed.
- `npm test`: core tests and Rust backend tests passed.
- `npm run build`: production frontend build passed.
- HTTP smoke tests passed for health, text-file reads, review-session create/read, and PDF compilation.
- A real `latexmk` run generated `sample-project/main.pdf` successfully.

Local dependency status at handoff time:

- `cargo 1.97.0`
- `rustc 1.97.0`
- `latexmk 4.83`

The default local ports are API `4317` and frontend `5173`. They can be overridden without changing code:

```bash
SCRIPTORIUM_API_PORT=4318 SCRIPTORIUM_WEB_PORT=5174 npm run dev
```

During validation, a Rust instance was verified on `4318`/`5174`. Do not terminate an existing user-owned process merely to free the default ports.

## Important Constraint

The user wants the review behavior to be algorithmic and reproducible. Do not rely on AI to decide whether a hunk is accepted, rejected, conflicted, or where it belongs after manual edits.

## Next Tasks

The next migration task is Stage 3: create `apps/desktop-tauri/`, reuse the Rust backend modules in the Tauri process, and add a Tauri `ScriptoriumPlatform` adapter. Migrate operations incrementally from HTTP to `invoke` commands while keeping the Web implementation intact for regression comparison.

After Stage 3, complete Stage 4: package and sign the macOS app as appropriate, handle `latexmk` path discovery, and configure macOS file-access permissions for user-selected project directories.

Product gaps that remain independent of the desktop migration:

- Wire review-session persistence into the frontend, or remove currently unused session persistence routes if persistence is deferred.
- Implement a real `AiSuggestionProvider` adapter, while keeping manual Proposed text import available.
- Add friendly UI error handling for failed uploads, moves, and invalid folder operations.
- Add upload size limits in the local server.
- Add direct PDF page input, fit-to-width, SyncTeX, and compile-log line navigation.
- Add project/file rename, delete, remove-from-list, and project compile-entry editing.
