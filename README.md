# Scriptorium

Local LaTeX editing and AI-change review demo.

## Run

```bash
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:5173/
```

The local API listens on `http://127.0.0.1:4317/` and is scoped to `sample-project/`.

## Demo Flow

1. Open `main.tex` from the file tree.
2. Edit the LaTeX source in the CodeMirror editor.
3. Click `Create Review` to compare the original file with the seeded proposed text.
4. Accept, reject, keep, or restore each hunk from the Review tab.
5. Click `Save` to write the current working text to disk.
6. Click `Compile` to run `latexmk` and preview `main.pdf` through PDF.js.

## Structure

```text
packages/core/          deterministic diff, hunk, and review-session logic
packages/platform/      provider interfaces for files, LaTeX compilation, and AI suggestions
apps/web/               React + TypeScript + Vite frontend
apps/web-local-server/  localhost Node API for files, sessions, compile, logs, and PDFs
sample-project/         runnable LaTeX project for the demo
```
