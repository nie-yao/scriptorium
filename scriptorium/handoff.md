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
- Prefer Tauri for the future macOS/Windows desktop shell.
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
  web-local-server
  desktop-tauri (future)
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

## Important Constraint

The user wants the review behavior to be algorithmic and reproducible. Do not rely on AI to decide whether a hunk is accepted, rejected, conflicted, or where it belongs after manual edits.

## Known Gaps

Good next tasks, based on the current code rather than the original scaffold plan:

- Wire review-session persistence into the frontend, or remove currently unused session persistence routes if persistence is deferred.
- Implement a real `AiSuggestionProvider` adapter, while keeping manual Proposed text import available.
- Add friendly UI error handling for failed uploads, moves, and invalid folder operations.
- Add upload size limits in the local server.
- Add direct PDF page input, fit-to-width, SyncTeX, and compile-log line navigation.
- Add project/file rename, delete, remove-from-list, and project compile-entry editing.
- Build the future Tauri shell by reusing the existing React UI, core algorithms, and platform interfaces.
