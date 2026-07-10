# Reference Formatter Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate `ref-format` as a project-aware bibliography workspace in Scriptorium that generates a reviewable `thebibliography` block from a project `.bib` file without silently modifying source citations.

**Architecture:** Port the deterministic bibliography domain logic into `@scriptorium/core`, where it accepts strings and returns formatted LaTeX, statistics, and structured diagnostics. The React application supplies the selected project `.bib` file plus all project `.tex` sources, presents the result in a References tab, and stages the generated text as a normal Scriptorium review on a chosen `.tex` target. No FastAPI server, Vue assets, Python runtime, temporary job directory, HTTP upload route, or download route is carried into the product.

**Tech Stack:** TypeScript, React 18, CodeMirror 6, existing Rust/Axum localhost API, Node `assert` tests, Rust unit tests.

## Global Constraints

- Keep `ref-format/` unchanged during the migration; it remains the behavioral reference until native fixtures pass.
- Do not add a second local web server, Python interpreter, `uv`, Vue, or an uploaded-file/job-directory workflow to Scriptorium.
- Place all pure parsing, formatting, citation scanning, diagnostics, and output rendering in `scriptorium/packages/core/`; it must not import React, browser APIs, or filesystem APIs.
- The formatter generates a `\\begin{thebibliography}{99}` block for a `.tex` target. It never rewrites a `.bib` file.
- Read project files through the existing platform providers. Do not call a remote service and do not auto-save generated output.
- A generated block becomes a normal review proposal. The only persistent mutation occurs when the user resolves the review and clicks Scriptorium’s existing Save action.
- Citation scanning covers every visible project `.tex` file and ignores commented LaTeX source. It supports `\\cite`, `\\citep`, `\\citet`, and other alphabetic `\\cite*` command suffixes, optional bracket arguments, and comma-separated keys.
- Do not silently rename citation keys. Duplicate entry keys and a deduplication choice that would remove a cited key are blocking diagnostics, because either behavior can leave `\\cite{...}` commands unresolved.
- Retain the current formatter’s author style, sentence-case title rules, title-cased container rules, page normalization, article/inproceedings/book validation, optional deduplication, optional sorting, and optional uncited-removal behavior.
- Preserve unrelated uncommitted work in the repository.

---

## File Structure

- Create `scriptorium/packages/core/src/bibtex.ts`: a dependency-free, brace-aware BibTeX parser and parser diagnostics.
- Create `scriptorium/packages/core/src/bibliography.ts`: formatting pipeline, citation collector, output renderer, public types, and safety diagnostics.
- Modify `scriptorium/packages/core/src/index.ts`: bibliography export.
- Create `scriptorium/packages/core/tests/bibliography.test.mjs`: golden behavior and error-path tests imported from the built core package.
- Modify `scriptorium/package.json`: run bibliography tests as part of `test:core`.
- Modify `scriptorium/apps/local-server-rs/src/server.rs`: validate a write path before a generated target can be created.
- Modify `scriptorium/apps/local-server-rs/src/project_files.rs`: add a regression test for reserved generated-target paths.
- Create `scriptorium/apps/web/src/components/ReferenceFormatPanel.tsx`: project-native source selection, options, result preview, diagnostics, and staging action.
- Modify `scriptorium/apps/web/src/app/projectFileHelpers.ts`: recursive tree-path collection and default generated-target helpers.
- Modify `scriptorium/apps/web/src/app/useScriptoriumApp.ts`: bibliography source discovery, generation state, and staging into the existing review session.
- Modify `scriptorium/apps/web/src/views/ProjectWorkspace.tsx`: References toolbar action, tab, and panel wiring.
- Modify `scriptorium/apps/web/src/styles.css`: compact Reference panel layout and error/warning/result styles.
- Modify `scriptorium/README.md`: describe the bibliography flow, output semantics, and supported citation scope.

### Task 1: Lock the native bibliography contract with executable fixtures

**Files:**

- Create: `scriptorium/packages/core/tests/bibliography.test.mjs`
- Modify: `scriptorium/package.json`

**Interfaces:**

- Consumes future `formatBibliography(input: BibliographyFormatInput): BibliographyFormatResult` from `@scriptorium/core`.
- Produces a stable golden fixture for porting the useful behavior from `ref-format/core/bibliography/formatter.py` and `ref-format/core/bibliography/manager.py`.

- [x] **Step 1: Write the failing golden-output test**

Create `scriptorium/packages/core/tests/bibliography.test.mjs` using Node `assert/strict`. Import `formatBibliography` from `../dist/index.js`. Use this input, which includes an acronym, brace-protected proper noun, two cited records, an uncited record, and a duplicate title under a different key:

```js
const bibtex = String.raw`@article{wang2025,
  author = {Wang, Wei and Li, Si},
  title = {A STUDY of {Kalman} FILTERS},
  journal = {IEEE transactions on CONTROL systems},
  volume = {12}, number = {2}, pages = {1 - 9}, year = {2025}
}
@inproceedings{chen2024,
  author = {Chen, Yu}, title = {Learning for IoT},
  booktitle = {ACM international conference on systems}, year = {2024}
}
@article{unused2023,
  author = {Zhang, San}, title = {Unused result}, journal = {Test journal}, year = {2023}
}
@article{duplicate2025,
  author = {Wang, Wei and Li, Si},
  title = {A STUDY of {Kalman} FILTERS}, journal = {IEEE transactions on CONTROL systems}, year = {2025}
}`;

const result = formatBibliography({
  bibtex,
  texSources: [{ path: "main.tex", content: "\\cite{wang2025, chen2024}\\n" }],
  options: { deduplicate: true, sort: true, removeUncited: true }
});

assert.equal(result.ok, true);
assert.deepEqual(result.stats, {
  loadedEntries: 4,
  formattedEntries: 4,
  removedDuplicates: 1,
  removedUncited: 1,
  finalEntries: 2,
  errorCount: 0,
  warningCount: 0
});
assert.equal(result.outputText, String.raw`\begin{thebibliography}{99}

\bibitem{chen2024}
Y.~Chen, Learning for IoT, \textit{ACM International Conference on Systems}, 2024.

\bibitem{wang2025}
W.~Wang and S.~Li, A STUDY of Kalman FILTERS, \textit{IEEE Transactions on CONTROL Systems}, vol.~12, no.~2, pp.~1--9, 2025.

\end{thebibliography}`);
```

Add a second test in the same file with a commented citation, a `\\citep[see][ch. 2]{kept}` citation, and an `\\input{section}` line. Pass both `main.tex` and `section.tex` as `texSources`; assert that only `kept` remains when `removeUncited` is enabled. Add a third test in which two different cited keys have the same normalized title and assert `ok === false`, a `deduplicate-cited-key` error code, and an empty `outputText`. Add a fourth test with duplicate BibTeX keys and assert `duplicate-citation-key` is blocking.

- [x] **Step 2: Confirm the new test fails**

Run:

```bash
cd scriptorium && npm run build:core && node packages/core/tests/bibliography.test.mjs
```

Expected: the build succeeds but the test fails because `formatBibliography` is not exported.

- [x] **Step 3: Add the normal-suite command without weakening existing tests**

Change the `test:core` script in `scriptorium/package.json` to:

```json
"test:core": "npm run build:core && node packages/core/tests/review.test.mjs && node packages/core/tests/latexNavigation.test.mjs && node packages/core/tests/bibliography.test.mjs"
```

Run `cd scriptorium && npm run test:core`; expected: the same missing-export failure confirms the runner is exercising the new fixture after the existing tests pass.

### Task 2: Implement the dependency-free BibTeX reader and formatter in core

**Files:**

- Create: `scriptorium/packages/core/src/bibtex.ts`
- Create: `scriptorium/packages/core/src/bibliography.ts`
- Modify: `scriptorium/packages/core/src/index.ts`
- Modify: `scriptorium/packages/core/tests/bibliography.test.mjs`

**Interfaces:**

- Produces `parseBibtex(source: string): BibtexParseResult` from `bibtex.ts`.
- Produces `formatBibliography(input: BibliographyFormatInput): BibliographyFormatResult` from `bibliography.ts`.
- `ReferenceFormatPanel` may depend only on these public types and function; it must not reimplement parsing or formatting.

- [x] **Step 1: Implement the parser types and brace-aware reader**

Create `scriptorium/packages/core/src/bibtex.ts` with these exported types and function:

```ts
export interface BibtexEntry {
  key: string;
  entryType: string;
  fields: Record<string, string>;
  index: number;
}

export interface BibtexParseDiagnostic {
  code: "parse-error" | "unsupported-value";
  message: string;
  entryIndex?: number;
}

export interface BibtexParseResult {
  entries: BibtexEntry[];
  diagnostics: BibtexParseDiagnostic[];
}

export function parseBibtex(source: string): BibtexParseResult;
```

Scan the source by locating `@`, reading the entry type, and consuming one balanced `{...}` or `(...)` body. The balanced-body scanner must track nested braces, double-quoted text, and escaped quote/backslash characters; an unterminated entry adds `parse-error` with its one-based entry index and continues scanning after the next `@`. Ignore `@comment`, `@preamble`, and `@string` definitions. For data entries, split the body only on commas and equals signs at top level, use the first segment as the citation key, lowercase field names, and unwrap one outer quoted/braced value while preserving all inner LaTeX. A top-level `#` concatenation, an unclosed quoted value, or an empty key adds `unsupported-value`/`parse-error` and omits only that invalid entry. Do not convert case or mutate field values in this file.

- [x] **Step 2: Implement the public formatting pipeline**

Create `scriptorium/packages/core/src/bibliography.ts` with this exact public API:

```ts
import type { BibtexEntry } from "./bibtex.js";

export interface BibliographySourceText { path: string; content: string; }
export interface BibliographyOptions { deduplicate: boolean; sort: boolean; removeUncited: boolean; }
export interface BibliographyFormatInput {
  bibtex: string;
  texSources: BibliographySourceText[];
  options: BibliographyOptions;
}
export type BibliographyDiagnosticCode =
  | "parse-error" | "unsupported-value" | "missing-core-field" | "missing-container-field"
  | "invalid-author" | "duplicate-citation-key" | "deduplicate-cited-key";
export interface BibliographyDiagnostic {
  level: "error" | "warning";
  blocking: boolean;
  code: BibliographyDiagnosticCode;
  message: string;
  entryIndex?: number;
  entryKey?: string;
}
export interface BibliographyStats {
  loadedEntries: number; formattedEntries: number; removedDuplicates: number;
  removedUncited: number; finalEntries: number; errorCount: number; warningCount: number;
}
export interface BibliographyFormatResult {
  ok: boolean; outputText: string; stats: BibliographyStats; diagnostics: BibliographyDiagnostic[];
}
export function formatBibliography(input: BibliographyFormatInput): BibliographyFormatResult;
```

Have `formatBibliography` call `parseBibtex`, map its diagnostics to errors, and format every valid record independently so one invalid record is reported without hiding otherwise valid records. Require `author` and `title`; require `journal` for `article`, `booktitle` for `inproceedings`, and `publisher` for `book`. Format authors exactly as the legacy tool does: split on ` and `; accept `Last, First Middle`; replace hyphens in given names before initialising; join initials and surname with `~`; use `and` for two authors and the Oxford comma for three or more; pass a final `others` through as `et al.`. Invalid author forms are `invalid-author` errors for that record.

Implement the legacy title rules explicitly: replace the five `MATH_MAP` spellings from `ref-format/core/bibliography/formatter.py`; remove brace protection while retaining its case; retain `$...$`, all-cap acronyms, and `Kalman`, `Markov`, `Bayesian`, `Gaussian`, `DoS`, `IoT`, and `5G`; otherwise sentence-case words, capitalising the first word and the word after `:`, `?`, or `!`. Title-case journal/booktitle/publisher names while retaining all-caps acronyms, `IEEE`, `ACM`, `CAA`, and `MIT`, and spelling `arXiv` exactly. Normalise page hyphens with `/\\s*-+\\s*/g` to `--` and render `pp.~` for a range and `Art.~no.~` for a single page. Render each entry as:

```ts
`\\bibitem{${entry.key}}\n${authors}, ${title}, \\textit{${container}}, ${details.join(", ")}.`
```

where empty `details` produces the same trailing punctuation policy as the legacy output. Render a non-empty successful result as `\\begin{thebibliography}{99}\n\n${entries.join("\n\n")}\n\n\\end{thebibliography}`.

- [x] **Step 3: Implement citation safety and processing order**

In the same file, implement a local `collectCitationKeys(texSources)` that removes comment tails using the escaped-percent rule already used by LaTeX navigation, then applies `/\\cite[a-zA-Z*]*\\s*(?:\\[[^\\]]*\\]\\s*)*\\{([^}]*)\\}/g` to each uncommented line. Split captured content on commas and trim nonempty keys.

Process records in this order: parse; validate/format; collect citations; identify duplicate citation keys; optionally deduplicate by a title normalised with `/\\W+/g`; optionally sort by first-author surname then ascending four-digit year; optionally remove records whose key is absent from the citation set; then render. Before removing a same-title duplicate, if the key that would be removed is cited, add an `error` diagnostic with `blocking: true` and code `deduplicate-cited-key` rather than changing the output. If more than one surviving record has the same citation key, add one `error` diagnostic with `blocking: true` and code `duplicate-citation-key` for each colliding record rather than suffixing `a`, `b`, and so on. A result with one or more blocking diagnostics has `ok: false` and `outputText: ""`. Parse, required-field, and invalid-author failures are `error` diagnostics with `blocking: false`: skip only the malformed record, keep the valid records, and return `ok: true` when a non-empty output remains. `errorCount` counts every `error` diagnostic; `warningCount` counts parser recoveries that do not skip an entry.

- [x] **Step 4: Export and complete the focused tests**

Add `export * from "./bibtex.js";` and `export * from "./bibliography.js";` to `scriptorium/packages/core/src/index.ts`. Extend `bibliography.test.mjs` with a malformed `@article` followed by a valid record; assert that the valid record still appears, `stats.errorCount === 1`, and the diagnostic contains `parse-error`. Run:

```bash
cd scriptorium && npm run test:core
```

Expected: all existing core tests and the bibliography fixture print their success messages and exit 0.

- [ ] **Step 5: Commit the deterministic domain layer**

```bash
cd scriptorium && git add packages/core/src/bibtex.ts packages/core/src/bibliography.ts packages/core/src/index.ts packages/core/tests/bibliography.test.mjs package.json && git commit -m "feat: add deterministic bibliography formatter"
```

### Task 3: Preserve project write safety for newly generated targets

**Files:**

- Modify: `scriptorium/apps/local-server-rs/src/server.rs`
- Modify: `scriptorium/apps/local-server-rs/src/project_files.rs`

**Interfaces:**

- Existing `PUT /api/projects/:project_id/file?path=<relative .tex path>` continues to create parent directories and a `.bak` backup, but now rejects reserved/hidden destination path components before writing.
- The React formatter may therefore stage a new `references.generated.tex` path without a special backend route.

- [x] **Step 1: Write a Rust regression test for a safe generated file path**

Add this test to the existing `#[cfg(test)]` module in `scriptorium/apps/local-server-rs/src/project_files.rs`:

```rust
#[test]
fn generated_reference_target_must_be_a_visible_text_path() {
    assert!(ensure_user_entry_path("references.generated.tex").is_ok());
    assert!(ensure_user_entry_path("generated/references.generated.tex").is_ok());
    assert!(ensure_user_entry_path(".scriptorium/references.generated.tex").is_err());
    assert!(ensure_user_entry_path("../references.generated.tex").is_err());
}
```

The current `normalize_project_path` collapses `..`, so update the assertion only after the validation implementation retains an explicit escape rejection rather than normalising it away.

- [x] **Step 2: Validate the write path before resolving it**

In `write_text_file` in `scriptorium/apps/local-server-rs/src/server.rs`, preserve the original query path for validation, reject an absolute path, call `ensure_user_entry_path(&query.path)`, then call `resolve_inside_project`. Import `ensure_user_entry_path` beside the other `project_files` functions. Do not relax extensions: `ensure_text_file` must still reject non-text targets. This makes direct API writes follow the same reserved-name policy as uploads and moves.

- [x] **Step 3: Run the Rust regression suite**

Run:

```bash
cd scriptorium && cargo test -p scriptorium-local-server
```

Expected: the existing filesystem/server tests and the new generated-target test pass.

- [ ] **Step 4: Commit the write-safety regression**

```bash
cd scriptorium && git add apps/local-server-rs/src/server.rs apps/local-server-rs/src/project_files.rs && git commit -m "fix: validate generated LaTeX file targets"
```

### Task 4: Build the project-native References panel

**Files:**

- Create: `scriptorium/apps/web/src/components/ReferenceFormatPanel.tsx`
- Modify: `scriptorium/apps/web/src/styles.css`

**Interfaces:**

- `ReferenceFormatPanel` consumes source paths, user options, result, generation status, and `onGenerate`/`onStage` callbacks supplied by the application hook.
- It does not call `fetch`, read files, parse BibTeX, or write a file itself.

- [x] **Step 1: Create an accessible controlled panel**

Create `ReferenceFormatPanel.tsx` with these props:

```ts
import type { BibliographyFormatResult, BibliographyOptions } from "@scriptorium/core";

export interface ReferenceFormatPanelProps {
  bibPaths: string[];
  activeBibPath: string;
  targetPath: string;
  options: BibliographyOptions;
  result: BibliographyFormatResult | null;
  loading: boolean;
  onBibPathChange(path: string): void;
  onTargetPathChange(path: string): void;
  onOptionsChange(options: BibliographyOptions): void;
  onGenerate(): void;
  onStage(): void;
}
```

Render a `<section className="referencePanel" aria-label="Reference formatter">` with a `.bib` `<select>`, an editable `.tex` target `<input>`, checkboxes for Deduplicate, Sort by first author/year, and Remove uncited entries, a Generate button, and a Review output button. Disable generation when there is no `.bib` file, the target is empty or does not end in `.tex`, or generation is running. Disable staging unless `result?.ok` and `result.outputText` are present. Explain directly below the target field: “No files are changed until you review and save the result.”

Render stats from `result.stats` as named values; render error diagnostics in an `aria-live="assertive"` list and warning diagnostics in an `aria-live="polite"` list; render successful output in a read-only `<pre>`. Do not include legacy upload/paste source modes, browser download links, job identifiers, language switcher, changelog, cat animation, or standalone-page navigation.

- [x] **Step 2: Add focused visual styles**

Add styles in `scriptorium/apps/web/src/styles.css` for `.referencePanel`, `.referenceFields`, `.referenceOptions`, `.referenceStats`, `.referenceDiagnostic`, `.referenceDiagnostic.error`, `.referenceDiagnostic.warning`, `.referenceOutput`, and `.referenceEmpty`. Use the existing right-pane controls, borders, muted text, button, and status colours; cap the output preview with `max-height` and `overflow: auto` so a long bibliography does not expand the whole workspace. Ensure the panel remains usable at the current narrow right-pane width without horizontal clipping.

- [x] **Step 3: Build the frontend before wiring state**

Run:

```bash
cd scriptorium && npm run build
```

Expected: Vite reports a successful production build; the unreferenced presentational component type-checks without adding a temporary route or mock callbacks.

- [ ] **Step 4: Commit the presentational component**

```bash
cd scriptorium && git add apps/web/src/components/ReferenceFormatPanel.tsx apps/web/src/styles.css && git commit -m "feat: add reference formatter panel"
```

### Task 5: Wire project files, generation, review staging, and save visibility

**Files:**

- Modify: `scriptorium/apps/web/src/app/projectFileHelpers.ts`
- Modify: `scriptorium/apps/web/src/app/useScriptoriumApp.ts`
- Modify: `scriptorium/apps/web/src/views/ProjectWorkspace.tsx`
- Modify: `scriptorium/apps/web/src/styles.css`

**Interfaces:**

- `useScriptoriumApp` produces `referenceFormatState` and actions for the view; it calls `formatBibliography` only after reading files through `FileSystemProvider`.
- The existing editor/review mechanism receives the target’s actual current text as `originalText` and generated bibliography text as `proposedText`.
- `saveFile` reloads the tree after a successful write so a newly created target becomes visible immediately.

- [x] **Step 1: Add tree and target helpers**

In `projectFileHelpers.ts`, export:

```ts
export function collectPaths(node: ProjectTreeNode | null, predicate: (path: string) => boolean): string[];
export function defaultReferenceTargetPath(bibPath: string): string;
```

`collectPaths` must recursively visit children and return sorted matching file paths. `defaultReferenceTargetPath` must return `references.generated.tex` at the `.bib` file’s directory, for example `sources/library.bib` becomes `sources/references.generated.tex`. It must never produce an absolute path, a `..` component, or an empty filename.

- [x] **Step 2: Add reference formatter state and source reading to the hook**

In `useScriptoriumApp.ts`, import `formatBibliography`, `BibliographyFormatResult`, and `BibliographyOptions` from `@scriptorium/core`, plus `collectPaths`, `defaultReferenceTargetPath`, and `findNode` from the helper module. Extend `RightTab` to include `"references"`. Derive `bibPaths` and `texPaths` from `tree` with case-insensitive `.bib` and `.tex` predicates.

Add state for `activeBibPath`, `referenceTargetPath`, `referenceOptions` initialised to `{ deduplicate: true, sort: true, removeUncited: false }`, `referenceResult`, and `referenceLoading`. When the selected project file is a `.bib`, set it as the active source and calculate its default target. When a project is opened/reset, choose the first sorted `.bib` path and its default target; clear the result when the project, source, target, or options change.

Implement `generateReferences` as an async function. It reads the active `.bib` and every `.tex` source through `fileSystem.readTextFile`; if the currently edited path matches a source path, use `editorText` instead so the formatter sees unsaved edits. Call `formatBibliography`, put the returned result into state, switch to the References tab, and set a user-facing notice that distinguishes generated output, blocking errors, and parser warnings. Always clear `referenceLoading` in `finally`.

- [x] **Step 3: Stage generated output through the existing review flow**

Implement `stageReferenceOutput` in `useScriptoriumApp.ts`. Reject empty/non-`.tex` targets with a notice. If the current editor is dirty and its path is not the same target, require `window.confirm` before replacing the editor context. Use `findNode(tree, targetPath)` to determine whether the target exists; read it only when it is an existing file, otherwise use `""` as `originalText`. Create a normal `ReviewSession` with:

```ts
const nextSession = createReviewSession({
  filePath: targetPath,
  originalText: targetText,
  proposedText: referenceResult.outputText
});
```

Set `selectedPath` and `editorPath` to the target, set `originalText` to `targetText`, set `editorText` to `nextSession.workingText`, set `proposedText` to the generated output, set `session` to `nextSession`, set `dirty` to `true`, clear the selected hunk, switch to the Review tab, and announce that the bibliography is ready for review. Do not call `writeTextFile` here.

Update `saveFile` so a successful `writeTextFile` is followed by `await reloadTree(activeProject.projectId)`; this makes a newly reviewed `references.generated.tex` appear in the file tree. Keep the existing backup behavior and pending-hunk block unchanged.

- [x] **Step 4: Expose the panel through the workspace**

Add a `BookOpenCheck` References button to the `ProjectWorkspace` toolbar, disabled when no project `.bib` source exists, that sets `rightTab` to `"references"`. Add `"references"` as a right-pane tab beside PDF, Review, and Logs. Render `ReferenceFormatPanel` when it is selected, pass all derived paths/state/callbacks from `ScriptoriumAppState`, and include every new property in the view’s `Pick` union and destructuring. Keep PDF, Review, and Logs behavior unchanged.

- [ ] **Step 5: Verify source-to-save behavior and regressions**

Run:

```bash
cd scriptorium && npm test && npm run build
```

Expected: core fixtures, Rust tests, and Vite build pass. Then start `npm run dev` and verify this user flow manually:

1. Open a project containing a `.bib` and at least two `.tex` files.
2. Open the `.bib`, choose References, and confirm it is selected automatically with `references.generated.tex` beside it.
3. Enable Remove uncited, generate, and confirm project-wide citations retain entries cited only from a secondary `.tex` source while commented citations do not retain an entry.
4. Confirm duplicate cited keys and cited duplicate-title removal produce visible blocking diagnostics and do not enable Review output.
5. Stage a successful result, reject or accept at least one hunk, save only after resolving all hunks, and confirm the target opens in the file tree with a `.bak` backup beside it on disk.
6. Compile the project and confirm no target file was written before the final save action.

- [x] **Step 6: Document the integration**

Add a “Reference formatting” subsection to `scriptorium/README.md` after Current Flow. State that References reads a project `.bib`, scans all project `.tex` files only when uncited removal is enabled, generates a reviewable `thebibliography` block, and stages `references.generated.tex` by default without changing files until Save. State that the module is for manual `thebibliography` projects and does not rewrite BibTeX/Biber workflows.

- [ ] **Step 7: Commit the integration**

```bash
cd scriptorium && git add apps/web/src/app/projectFileHelpers.ts apps/web/src/app/useScriptoriumApp.ts apps/web/src/views/ProjectWorkspace.tsx apps/web/src/components/ReferenceFormatPanel.tsx apps/web/src/styles.css README.md && git commit -m "feat: integrate project bibliography formatting"
```

## Self-Review

1. The plan assigns the native formatter, parser, citation scan, duplicate-key safety, project source reading, review staging, destination validation, UI, documentation, and both automated/manual verification to explicit tasks.
2. The destination is a generated `.tex` bibliography block, not a modified `.bib` file; this matches `ref-format`’s actual output and Scriptorium’s existing review/save model.
3. Core interfaces are consistent: `formatBibliography` returns `BibliographyFormatResult`; the hook owns I/O and passes this result to `ReferenceFormatPanel`; `stageReferenceOutput` turns its `outputText` into an existing `ReviewSession`; Save remains the only write action.
4. The plan intentionally does not port legacy `uniquify_labels`: changing cite keys without updating every `\\cite{...}` creates broken LaTeX references. Blocking diagnostics retain user control and citation integrity.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-10-reference-formatter-integration.md`. Two execution options:

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration.

2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
