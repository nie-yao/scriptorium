# LaTeX Document Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a panel below the project file tree that lists recognized LaTeX document landmarks and jumps the CodeMirror editor to their source line.

**Architecture:** A deterministic parser in `@scriptorium/core` scans only the editable source text. The React workspace recalculates entries from `editorText`, renders them in the sidebar, and passes a source-line focus request to the existing CodeMirror component. No filesystem, compiler, platform, review, AI, or desktop code changes.

**Tech Stack:** TypeScript, React 18, CodeMirror 6, Lucide React, Node assert tests.

## Global Constraints

- Do not begin the desktop/Tauri migration.
- Detect navigation items deterministically and locally; do not call an AI provider.
- Do not list inline math, display math, or equation-like environments.
- Recognize `\\part`, `\\chapter`, `\\section`, `\\subsection`, `\\subsubsection`, `\\paragraph`, and `\\subparagraph`; `figure`, `table`, `algorithm`, and `listing`; and explicit `\\label{...}` anchors not already represented by a heading or float.
- Ignore comment tails but retain escaped percent signs (`\\%`).
- Derive entries from the current unsaved editor text and make navigation cursor/scroll-only.

---

## File Structure

- Create `scriptorium/packages/core/src/latexNavigation.ts`: parser types and scan function.
- Modify `scriptorium/packages/core/src/index.ts`: parser export.
- Create `scriptorium/packages/core/tests/latexNavigation.test.mjs`: parser tests.
- Modify `scriptorium/package.json`: include the parser test in `test:core`.
- Create `scriptorium/apps/web/src/components/DocumentNavigation.tsx`: accessible sidebar panel.
- Modify `scriptorium/apps/web/src/components/LatexEditor.tsx`: navigation focus request support.
- Modify `scriptorium/apps/web/src/app/useScriptoriumApp.ts`: live derived entries and selection state.
- Modify `scriptorium/apps/web/src/views/ProjectWorkspace.tsx`: panel placement and props.
- Modify `scriptorium/apps/web/src/styles.css`: separately scrollable tree/navigation regions.

### Task 1: Build and test the deterministic parser

**Files:**

- Create: `scriptorium/packages/core/src/latexNavigation.ts`
- Modify: `scriptorium/packages/core/src/index.ts`
- Create: `scriptorium/packages/core/tests/latexNavigation.test.mjs`
- Modify: `scriptorium/package.json`

**Interfaces:**

- Produces `LatexNavigationKind`, `LatexNavigationEntry`, and `scanLatexNavigation(text: string): LatexNavigationEntry[]`.

- [ ] **Step 1: Write the failing test**

Create the test with source containing a commented `\\section`, an escaped-percent heading, a chapter, a section with label, an unnumbered subsection, one captioned figure/table/algorithm, a standalone label, and an equation with label. Assert this projection:

```js
assert.deepEqual(scanLatexNavigation(source).map(({ kind, title, line, level }) => ({ kind, title, line, level })), [
  { kind: "chapter", title: "Methods", line: 1, level: 0 },
  { kind: "section", title: "Model % Setup", line: 2, level: 1 },
  { kind: "subsection", title: "Objective", line: 3, level: 2 },
  { kind: "figure", title: "System overview", line: 4, level: 0 },
  { kind: "table", title: "Results", line: 7, level: 0 },
  { kind: "algorithm", title: "Training", line: 8, level: 0 },
  { kind: "label", title: "appendix:extra", line: 9, level: 0 }
]);
```

- [ ] **Step 2: Confirm the test fails**

Run `cd scriptorium && npm run build:core && node packages/core/tests/latexNavigation.test.mjs`.

Expected: failure because `scanLatexNavigation` is absent.

- [ ] **Step 3: Implement the parser**

Create this public API:

```ts
export type LatexNavigationKind = "part" | "chapter" | "section" | "subsection" | "subsubsection" | "paragraph" | "subparagraph" | "figure" | "table" | "algorithm" | "listing" | "label";
export interface LatexNavigationEntry { id: string; kind: LatexNavigationKind; title: string; line: number; level: number; label?: string; }
export function scanLatexNavigation(text: string): LatexNavigationEntry[] { /* scan source lines */ }
```

Scan lines in order, removing the first percent character preceded by an even count of backslashes. Track begin/end depth for `equation`, `equation*`, `align`, `align*`, `gather`, `gather*`, `multline`, `multline*`, `math`, and `displaymath`; skip every match within those environments. Make IDs `${kind}:${line}:${ordinal}`. Support a trailing heading star and optional short heading title, using the long title. Set hierarchy levels to `part=-1`, `chapter=0`, `section=1`, `subsection=2`, `subsubsection=3`, `paragraph=4`, `subparagraph=5`. Make one float entry at `\\begin{figure|table|algorithm|listing}`, replace its fallback title with its first caption when found, associate its label, and omit that label as a standalone entry. Also associate an immediately following label with its heading. Export the file in `index.ts` using `export * from "./latexNavigation.js";`.

- [ ] **Step 4: Run focused tests**

Run `cd scriptorium && npm run build:core && node packages/core/tests/latexNavigation.test.mjs && node packages/core/tests/review.test.mjs`.

Expected: both files print their success messages and exit 0.

- [ ] **Step 5: Add the test to the normal suite and commit**

Set `test:core` to `npm run build:core && node packages/core/tests/review.test.mjs && node packages/core/tests/latexNavigation.test.mjs`, run `cd scriptorium && npm run test:core`, then commit:

```bash
git add packages/core/src/latexNavigation.ts packages/core/src/index.ts packages/core/tests/latexNavigation.test.mjs package.json
git commit -m "feat: scan LaTeX document navigation entries"
```

### Task 2: Add the sidebar panel and CodeMirror focus interface

**Files:**

- Create: `scriptorium/apps/web/src/components/DocumentNavigation.tsx`
- Modify: `scriptorium/apps/web/src/components/LatexEditor.tsx`
- Modify: `scriptorium/apps/web/src/styles.css`

**Interfaces:**

- Consumes `LatexNavigationEntry[]`; exposes `onSelectEntry(entry: LatexNavigationEntry): void`.
- Adds `NavigationFocusRequest { line: number; requestId: number }` to `LatexEditor`.

- [ ] **Step 1: Implement the panel**

Use a `<section aria-label="Document navigation">`, a `Document` title with `ListTree`, an empty message, and a button per entry. Show `Image` for figures, `Table2` for tables, `Braces` for labels, and `FileText` otherwise. Each button must use `entry.id`, call `onSelectEntry(entry)`, set `title` to `Go to line ${entry.line + 1}`, apply `navigationRow`, and indent by `12 + Math.max(0, entry.level) * 12` pixels.

- [ ] **Step 2: Focus a selected source line**

Export `NavigationFocusRequest` beside `HunkFocusRequest`, add optional `navigationFocusRequest` props, and add an effect that runs for every new `requestId`:

```ts
const targetLine = Math.max(1, Math.min(view.state.doc.lines, navigationFocusRequest.line + 1));
const line = view.state.doc.line(targetLine);
view.dispatch({ selection: { anchor: line.from }, scrollIntoView: true });
view.focus();
```

- [ ] **Step 3: Style independent scroll areas and build**

Make `.fileTree` `flex: 1 1 55%`, `min-height: 120px`, and `overflow: auto`. Add a `.documentNavigation` region with a top border, `flex: 0 1 45%`, `min-height: 110px`, and a scrolling `.navigationEntries`. Add dark-sidebar styles for title, rows, selected state, truncation, and empty state. Run `cd scriptorium && npm run build`; expected: successful Vite build.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/DocumentNavigation.tsx apps/web/src/components/LatexEditor.tsx apps/web/src/styles.css
git commit -m "feat: add document navigation panel components"
```

### Task 3: Wire live editor text into the workspace

**Files:**

- Modify: `scriptorium/apps/web/src/app/useScriptoriumApp.ts`
- Modify: `scriptorium/apps/web/src/views/ProjectWorkspace.tsx`

**Interfaces:**

- Produces `navigationEntries`, `selectedNavigationEntryId`, `navigationFocusRequest`, and `focusNavigationEntry(entry: LatexNavigationEntry)` through `ScriptoriumAppState`.

- [ ] **Step 1: Add live navigation state**

Import `scanLatexNavigation` and its entry type from `@scriptorium/core`, plus `NavigationFocusRequest` from `LatexEditor`. Add `navigationFocusRequest` and `selectedNavigationEntryId` state. Derive entries with:

```ts
const navigationEntries = useMemo(() => editorPath?.toLowerCase().endsWith(".tex") ? scanLatexNavigation(editorText) : [], [editorPath, editorText]);
```

Add:

```ts
function focusNavigationEntry(entry: LatexNavigationEntry) {
  setSelectedNavigationEntryId(entry.id);
  setNavigationFocusRequest((current) => ({ line: entry.line, requestId: (current?.requestId ?? 0) + 1 }));
}
```

Clear both selection states in `resetWorkspaceState` and `openTextFile`. In `updateEditorText`, clear the selected id when the fresh entry list does not contain it. Return all four values.

- [ ] **Step 2: Render and connect**

Import `DocumentNavigation` in `ProjectWorkspace`, include all four new values in its picked props/destructuring, render it directly after `FileTree`, and pass `navigationFocusRequest` to `LatexEditor`.

- [ ] **Step 3: Verify regression and the user flow**

Run `cd scriptorium && npm test && npm run build`; expected: core parser/review tests, Rust backend tests, and Vite production build exit 0. Start `npm run dev`, open a `.tex` file, and confirm that navigation appears below the file tree, formulas/equations do not appear, clicks move the caret without text changes, and typing a new heading/caption/label refreshes the list immediately.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/useScriptoriumApp.ts apps/web/src/views/ProjectWorkspace.tsx
git commit -m "feat: wire LaTeX navigation into workspace"
```

## Self-Review

1. Parser, UI, focus, live updates, formula exclusion, and regression checks each have an owning task.
2. No placeholder implementation or test instructions remain.
3. `LatexNavigationEntry` flows consistently from `scanLatexNavigation`, through `DocumentNavigation`, to `focusNavigationEntry`, then as `NavigationFocusRequest` to CodeMirror.

