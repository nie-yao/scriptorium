# Editor Long Text Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the workspace top bar visible when a long block of text is pasted into `main.tex`.

**Architecture:** The fixed-height workspace already assigns the editor area the remaining viewport space. Explicitly allow the editor column, as a nested grid item, to shrink below its content height so CodeMirror owns vertical overflow instead of expanding the workspace grid.

**Tech Stack:** React 18, TypeScript, CSS Grid, CodeMirror 6, Vite.

## Global Constraints

- Preserve the existing fixed viewport workspace and CodeMirror line wrapping.
- Do not change editor content, save behavior, or review behavior.
- Keep overflow inside the editor surface; the workspace header and footer remain in their assigned grid rows.

---

### Task 1: Constrain nested editor height

**Files:**
- Modify: `scriptorium/apps/web/src/styles.css:454-459`
- Test: `scriptorium` production build

**Interfaces:**
- Consumes: `.mainGrid` supplies the editor column with a `minmax(0, 1fr)` workspace row.
- Produces: `.editorColumn` can shrink to the row height and lets `.editorSurface` provide scrolling for long documents.

- [ ] **Step 1: Add the failing layout condition to the manual test procedure**

Open a project with `main.tex`, paste at least 500 lines of plain text into the editor, and observe that the workspace top bar scrolls out of view or is pushed above the viewport.

- [ ] **Step 2: Verify the failure before the change**

Run: `npm run dev`

Expected: with the long pasted document, the editor content can force the nested grid item beyond the available workspace row.

- [ ] **Step 3: Write the minimal implementation**

Add `min-height: 0;` to the existing `.editorColumn` rule:

```css
.editorColumn {
  background: #ffffff;
  border-right: 1px solid #d8dde2;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}
```

- [ ] **Step 4: Verify the layout and production build**

Run: `npm run build`

Expected: the build exits with code 0. Repeat the 500-line paste: the top bar remains visible, while the CodeMirror editor scrolls vertically.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/styles.css docs/superpowers/plans/2026-07-11-editor-long-text-layout.md
git commit -m "fix: constrain editor height for long documents"
```
