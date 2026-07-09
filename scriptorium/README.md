# Scriptorium

Local LaTeX project editing and deterministic AI-change review demo.

## Run

```bash
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:5173/
```

The dev script builds `packages/core`, starts the local API on `http://127.0.0.1:4317/`, and starts Vite on `http://127.0.0.1:5173/`. The API is bound to localhost and limits project paths to the workspace root; `sample-project/` is seeded into the project list on first run.

## Current Flow

1. Start on the Projects page, then create a project or open an existing folder under the workspace root.
2. Select a project row to enter the editing workspace.
3. Use the file tree to open `.tex`, `.bib`, `.cls`, `.sty`, or `.bst` files, or select a PDF for preview.
4. Upload supported files, create folders, drag external files into the tree, or drag project entries to move them.
5. Edit text in the CodeMirror editor and save changes back to disk.
6. Edit the Proposed text in the Review tab, then click `Create Review`.
7. Review red/green hunk decorations in the editor, focus hunks from the Review panel, and use `Accept`, `Reject`, `Keep Edit`, `Use AI`, or hunk-level `Undo`.
8. Finish every pending hunk before saving the final Working text; then click `Compile` to run `latexmk`, preview the PDF with PDF.js, or inspect compile logs.

## Current Limits

- Project creation from the web UI asks for a project name and creates it under the workspace root. Opening an existing project also requires a path inside that root.
- AI generation is not wired to a provider yet. The app seeds a demo proposal and lets the user edit or paste proposed text manually.
- Upload conflicts use `keep-both` from the web UI. The API also supports `error` and `replace` policies.
- Active review sessions are kept in browser state. The local API can create/read session JSON, but the frontend does not persist review sessions yet.
- PDF preview supports refresh, previous/next page, and zoom. Direct page entry, fit-to-width, SyncTeX, and log line jumps are future work.

## Structure

```text
packages/core/          deterministic diff, inline diff, hunk, and review-session logic
packages/platform/      provider interfaces for projects, files, LaTeX compilation, and AI suggestions
apps/web/               React + TypeScript + Vite frontend
apps/web-local-server/  localhost Node API for projects, files, sessions, compile, logs, and PDFs
sample-project/         runnable LaTeX project seeded into the local project index
```
