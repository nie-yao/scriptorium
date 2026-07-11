# Resizable Document Pane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users drag the divider above the left-side Document pane to change its height.

**Architecture:** Keep the resize state in `ProjectWorkspace`, where the sidebar owns both the file tree and Document pane. A pointer-driven divider computes a constrained pixel height for `DocumentNavigation`; CSS makes the two panes shrink and scroll cleanly within the fixed-height sidebar.

**Tech Stack:** React 18, TypeScript, CSS, Vite

## Global Constraints

- Preserve the existing 110px minimum usable height for the Document pane.
- Retain a 120px minimum usable height for the file tree.
- Do not introduce dependencies or persist a layout preference.

---

### Task 1: Add pointer-based sidebar divider

**Files:**
- Modify: `scriptorium/apps/web/src/views/ProjectWorkspace.tsx`
- Modify: `scriptorium/apps/web/src/styles.css`
- Test: `npm run build`

**Interfaces:**
- Consumes: the sidebar element's `getBoundingClientRect()` and `PointerEvent.clientY`.
- Produces: `documentPaneHeight: number | null` and an accessible `sidebarResizeHandle` that updates it during a pointer drag.

- [ ] **Step 1: Add the failing interaction acceptance check**

Open the workspace and verify that the boundary between the file tree and Document is not draggable: dragging at the current border leaves both pane heights unchanged.

- [ ] **Step 2: Implement the minimal interaction state and calculation**

In `scriptorium/apps/web/src/views/ProjectWorkspace.tsx`, import `useRef` and `useState`, attach `sidebarRef` to the sidebar, and add this state and handler:

```tsx
const [documentPaneHeight, setDocumentPaneHeight] = useState<number | null>(null);
const sidebarRef = useRef<HTMLElement | null>(null);

function resizeDocumentPane(clientY: number) {
  const sidebar = sidebarRef.current;
  if (!sidebar) return;
  const sidebarBounds = sidebar.getBoundingClientRect();
  const reservedHeight = 68 + 42 + 52 + 8;
  const availableHeight = sidebarBounds.height - reservedHeight;
  setDocumentPaneHeight(Math.min(Math.max(sidebarBounds.bottom - clientY, 110), availableHeight - 120));
}
```

Render a `button` with `className="sidebarResizeHandle"`, `aria-label="Resize Document pane"`, and an `onPointerDown` handler that calls `event.currentTarget.setPointerCapture(event.pointerId)`, calls `resizeDocumentPane(event.clientY)`, and registers `onPointerMove={event => resizeDocumentPane(event.clientY)}`. Place it between `FileTree` and `DocumentNavigation`, and pass `style={documentPaneHeight ? { height: documentPaneHeight } : undefined}` to `DocumentNavigation` by adding a `style?: CSSProperties` prop to that component.

- [ ] **Step 3: Make the divider and resized panes lay out correctly**

In `scriptorium/apps/web/src/styles.css`, change `.fileTree` from a percentage flex basis to `flex: 1 1 auto;`, change `.documentNavigation` to `flex: 0 0 auto; height: 45%;`, and add:

```css
.sidebarResizeHandle {
  background: transparent;
  border: 0;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  cursor: row-resize;
  flex: 0 0 8px;
  min-height: 8px;
  padding: 0;
  touch-action: none;
  width: 100%;
}

.sidebarResizeHandle:hover,
.sidebarResizeHandle:focus-visible {
  background: #79aaa5;
  outline: 0;
}
```

- [ ] **Step 4: Verify the implementation**

Run: `npm run build`

Expected: the TypeScript and Vite builds complete successfully.

Then open the app, drag the divider upward and downward, and verify that the Document pane changes height, the file tree takes the remaining space, neither pane falls below its minimum height, and each pane retains independent scrolling.

- [ ] **Step 5: Commit**

```bash
git add scriptorium/apps/web/src/views/ProjectWorkspace.tsx scriptorium/apps/web/src/components/DocumentNavigation.tsx scriptorium/apps/web/src/styles.css docs/superpowers/plans/2026-07-11-resizable-document-pane.md
git commit -m "feat: make document pane resizable"
```
