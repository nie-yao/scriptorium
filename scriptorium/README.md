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

The dev script builds `packages/core`, starts the Rust local API on `http://127.0.0.1:4317/`, and starts Vite on `http://127.0.0.1:5173/`. The API is bound to localhost and limits project paths to the workspace root; `sample-project/` is seeded into the project list on first run. To use other local ports, set `SCRIPTORIUM_API_PORT` and `SCRIPTORIUM_WEB_PORT`, for example `SCRIPTORIUM_API_PORT=4318 SCRIPTORIUM_WEB_PORT=5174 npm run dev`.

The Rust backend requires a local Rust toolchain:

```bash
rustup --version
cargo --version
```

## Current Flow

1. Create an account or sign in, then create a project in your private workspace.
2. Select a project row to enter the editing workspace.
3. Use the file tree to open `.tex`, `.bib`, `.cls`, `.sty`, or `.bst` files, or select a PDF for preview.
4. Upload supported files, create folders, drag external files into the tree, or drag project entries to move them.
5. Edit text in the CodeMirror editor and save changes back to disk.
6. Edit the Proposed text in the Review tab, then click `Create Review`.
7. Review red/green hunk decorations in the editor, focus hunks from the Review panel, and use `Accept`, `Reject`, `Keep Edit`, `Use AI`, or hunk-level `Undo`.
8. Finish every pending hunk before saving the final Working text; then click `Compile` to run `latexmk`, preview the PDF with PDF.js, or inspect compile logs.

## Reference formatting

Open the **References** tab for a project `.bib` file to format entries into a reviewable `thebibliography` block. Scriptorium reads the selected `.bib` file and scans visible project `.tex` files to detect citations, protect against unsafe deduplication, and optionally remove uncited entries. The result targets `references.generated.tex` beside the source `.bib` by default, but no project file changes until the generated text is staged, reviewed, and saved.

This workflow is intended for manual `thebibliography` projects. It does not rewrite `.bib` source files or BibTeX/Biber workflows.

## Current Limits

- The web app creates new projects in the authenticated user's private workspace. Importing an arbitrary server folder is intentionally not available in the hosted web flow.
- AI generation is not wired to a provider yet. The app seeds a demo proposal and lets the user edit or paste proposed text manually.
- Upload conflicts use `keep-both` from the web UI. The API also supports `error` and `replace` policies.
- Active review sessions are kept in browser state. The local API can create/read session JSON, but the frontend does not persist review sessions yet.
- PDF preview supports refresh, previous/next page, and zoom. Direct page entry, fit-to-width, SyncTeX, and log line jumps are future work.

## Structure

```text
packages/core/             deterministic diff, inline diff, hunk, and review-session logic
packages/platform/         provider interfaces for projects, files, and LaTeX compilation
apps/web/                  React + TypeScript + Vite frontend
apps/local-server-rs/      Rust localhost HTTP API for projects, files, sessions, compile, logs, and PDFs
sample-project/            runnable LaTeX project seeded into the local project index
```

## Accounts and file storage

The web app now requires an email/password account. Passwords are stored as Argon2 hashes, while browser sessions use an opaque `HttpOnly`, `SameSite=Strict` cookie. Every API request for a project, file, review session, PDF, log, or compilation is authorized against that session.

By default, persistent account data is kept at `.scriptorium/data` beneath the server workspace. Each account has an isolated project directory:

```text
<data-root>/users/<user-id>/projects/
```

Set `SCRIPTORIUM_DATA_DIR` to a durable server volume before deployment, for example `SCRIPTORIUM_DATA_DIR=/var/lib/scriptorium`. Back up that directory independently of application releases; it contains account records, revocable sessions, project indexes, and uploaded files.

Serve the application over HTTPS in production and set `SCRIPTORIUM_COOKIE_SECURE=true` so the session cookie is sent only over HTTPS. This MVP permits new registrations; put registration behind invitations, SSO, or an approved signup policy before opening it to the public.
