# Remove Legacy Node Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the retired Node.js localhost API fallback while preserving the Rust-backed development, test, and production web build workflows.

**Architecture:** Node remains necessary for Vite, TypeScript, npm, and frontend tests. This work deletes only the duplicate Node HTTP backend, then makes the development launcher unconditionally start its Rust replacement.

**Tech Stack:** Rust/Cargo, React, TypeScript, Vite, npm.

## Global Constraints

- Retain Node.js tooling required by Vite, TypeScript, npm, and the frontend test runner.
- Remove only the legacy Node localhost API and references that advertise it as supported.
- Preserve the default Rust backend command, ports, and existing test/build commands.
- Do not modify or discard pre-existing uncommitted user changes.

---

## File Structure

- Delete `scriptorium/apps/web-local-server/`: retired Node HTTP API and dedicated test.
- Modify `scriptorium/scripts/dev.mjs`: remove `SCRIPTORIUM_BACKEND` selection and always start Rust.
- Modify `scriptorium/package.json`: remove the retired Node-server test script.
- Modify `scriptorium/README.md`, `scriptorium/handoff.md`, and `scriptorium/latex-review-webapp-requirements.md`: remove migration-window instructions and update the active-backend description.

### Task 1: Delete the retired Node HTTP API

**Files:**
- Delete: `scriptorium/apps/web-local-server/server.mjs`
- Delete: `scriptorium/apps/web-local-server/src/config.mjs`
- Delete: `scriptorium/apps/web-local-server/src/http.mjs`
- Delete: `scriptorium/apps/web-local-server/src/latexCompiler.mjs`
- Delete: `scriptorium/apps/web-local-server/src/projectFiles.mjs`
- Delete: `scriptorium/apps/web-local-server/src/projectIndex.mjs`
- Delete: `scriptorium/apps/web-local-server/src/reviewSessions.mjs`
- Delete: `scriptorium/apps/web-local-server/src/server.mjs`
- Delete: `scriptorium/apps/web-local-server/tests/projectFiles.test.mjs`

**Interfaces:**
- Consumes: the supported Rust HTTP API in `apps/local-server-rs/`.
- Produces: no Node HTTP API files remain.

- [ ] **Step 1: Verify Rust coverage first**

Run: `cd scriptorium && cargo test -p scriptorium-local-server`

Expected: exit code `0`.

- [ ] **Step 2: Delete the nine listed files and their empty directory tree**

Remove the retired implementation, entry point, and Node-only test exactly as listed above.

- [ ] **Step 3: Check that the directory is gone**

Run: `cd scriptorium && test ! -e apps/web-local-server`

Expected: exit code `0`.

### Task 2: Remove selectable-backend code and documentation

**Files:**
- Modify: `scriptorium/scripts/dev.mjs`
- Modify: `scriptorium/package.json`
- Modify: `scriptorium/README.md`
- Modify: `scriptorium/handoff.md`
- Modify: `scriptorium/latex-review-webapp-requirements.md`

**Interfaces:**
- Consumes: `cargo run -p scriptorium-local-server -- --root sample-project --port <port>`.
- Produces: `npm run dev` always starts Rust; no documented fallback remains.

- [ ] **Step 1: Simplify `scripts/dev.mjs`**

Delete the environment switch, conditional cargo check, and Node-server ternary. Keep this single server declaration:

```js
assertCommand("cargo", "Rust backend selected, but cargo was not found. Install Rust from https://rustup.rs/ and retry.");
const server = run("cargo", ["run", "-p", "scriptorium-local-server", "--", "--root", "sample-project", "--port", apiPort]);
```

- [ ] **Step 2: Remove the retired script**

Delete this `package.json` entry, retaining all remaining scripts:

```json
"test:server:node": "node apps/web-local-server/tests/projectFiles.test.mjs",
```

- [ ] **Step 3: Remove migration-window prose**

Delete the `SCRIPTORIUM_BACKEND=node` example and legacy directory entry from `README.md`; delete Node-comparison guidance from `handoff.md`; amend requirements prose so the active local API is Rust while retaining platform-boundary principles.

- [ ] **Step 4: Confirm retired references are absent**

Run: `cd scriptorium && rg -n "web-local-server|SCRIPTORIUM_BACKEND|test:server:node" . --glob '!package-lock.json'`

Expected: exit code `1` with no matches.

### Task 3: Validate retained workflows

**Files:**
- Test: `scriptorium/packages/core/tests/*.test.mjs`
- Test: Rust tests in `scriptorium/apps/local-server-rs/src/`

**Interfaces:**
- Consumes: `npm run test` and `npm run build`.
- Produces: evidence that the supported Rust backend and frontend still work.

- [ ] **Step 1: Run tests**

Run: `cd scriptorium && npm run test`

Expected: core JavaScript tests and Rust server tests exit successfully.

- [ ] **Step 2: Build the frontend**

Run: `cd scriptorium && npm run build`

Expected: TypeScript core compilation and Vite production build exit successfully.

- [ ] **Step 3: Inspect the final diff**

Run: `git -C /Users/ynie/Documents/Work/项目/Scriptorium diff --check`

Expected: exit code `0`.

- [ ] **Step 4: Commit only if requested**

Run: `git add scriptorium/apps/web-local-server scriptorium/scripts/dev.mjs scriptorium/package.json scriptorium/README.md scriptorium/handoff.md scriptorium/latex-review-webapp-requirements.md && git commit -m "chore: remove legacy node server"`

Expected: a commit after explicit user approval.
