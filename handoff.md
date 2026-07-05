# Handoff: LaTeX Review Web App

## Context

The goal is to build a local LaTeX paper editing and review app. The app should feel like a lightweight Overleaf, but its key feature is AI-change review: after AI proposes edits to a `.tex` file, the user can accept or reject each change while still freely editing the document, then save the final version.

The detailed requirements are in:

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
core/
  diff, hunk, anchor, review session, LaTeX project logic

ui/
  React components, CodeMirror integration, review panel, PDF viewer

platform/
  FileSystemProvider
  LatexCompilerProvider
  AiSuggestionProvider

apps/
  web-local-server
  desktop-tauri
```

The UI should not directly access Node.js, Tauri, Electron, the filesystem, `latexmk`, or AI APIs. It should call platform adapters instead.

## MVP Focus

Start small and solid:

1. Open a local LaTeX project directory.
2. Show a file tree.
3. Edit `.tex` files in CodeMirror 6.
4. Create a review session from `Original`, `Proposed`, and `Working` text.
5. Show per-hunk Accept / Reject / Keep Edit controls.
6. Allow manual editing during review.
7. Save final `Working` text back to disk.
8. Compile with `latexmk`.
9. Preview PDF with PDF.js.
10. Show compile logs.

## Important Constraint

The user wants the review behavior to be algorithmic and reproducible. Do not rely on AI to decide whether a hunk is accepted, rejected, conflicted, or where it belongs after manual edits.

## Suggested Next Step

In the new project directory, initialize the Web MVP scaffold and implement the architecture skeleton before building features:

- workspace/package structure
- shared TypeScript types
- platform interfaces
- basic local-server provider
- React layout shell
- CodeMirror editor placeholder
- PDF preview placeholder
- review-session model and tests
