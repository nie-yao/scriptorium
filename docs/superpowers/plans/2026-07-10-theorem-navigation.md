# Theorem Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** List theorem-like LaTeX environments in the document-navigation panel and jump to their `\\begin` source line.

**Architecture:** Extend the existing deterministic `scanLatexNavigation` source scanner with a theorem-environment family. Each `\\begin{theorem|lemma|proposition|corollary|remark}` creates a navigation entry; an optional `\\begin{...}[Title]` supplies its title, otherwise a human-readable fallback title is used. The existing React navigation panel receives the new kinds through its current entry interface.

**Tech Stack:** TypeScript, React 18, Lucide React, Node assert tests.

## Global Constraints

- Do not begin desktop/Tauri migration or alter platform APIs.
- Keep detection deterministic and local; do not use AI.
- Continue excluding inline/display formulas and equation-like environments.
- Recognize exactly `theorem`, `lemma`, `proposition`, `corollary`, and `remark`, including optional starred environment names and optional bracketed titles.
- Associate a label inside a theorem-like environment with that item and do not also list it as a standalone label.

---

## File Structure

- Modify `scriptorium/packages/core/src/latexNavigation.ts`: add theorem-like kinds, scanner state, and entry display titles.
- Modify `scriptorium/packages/core/tests/latexNavigation.test.mjs`: prove all five environments appear while an equation does not.
- Modify `scriptorium/apps/web/src/components/DocumentNavigation.tsx`: give theorem-like entries a distinct book icon.

### Task 1: Extend deterministic navigation scanning and presentation

**Files:**

- Modify: `scriptorium/packages/core/src/latexNavigation.ts`
- Modify: `scriptorium/packages/core/tests/latexNavigation.test.mjs`
- Modify: `scriptorium/apps/web/src/components/DocumentNavigation.tsx`

**Interfaces:**

- Extends `LatexNavigationKind` with `theorem | lemma | proposition | corollary | remark`.
- Retains `scanLatexNavigation(text: string): LatexNavigationEntry[]`; no React or platform interface changes.

- [ ] **Step 1: Write a failing scanner test**

Add this source after the existing standalone label and before the equation, then extend the expected projection:

```js
\\begin{theorem}[Compactness]\\label{thm:compact}Every finite cover has a subcover.\\end{theorem}
\\begin{lemma}A helper result.\\end{lemma}
\\begin{proposition}A stated claim.\\end{proposition}
\\begin{corollary}An immediate consequence.\\end{corollary}
\\begin{remark}A useful observation.\\end{remark}
```

Expected entries are `{ kind: "theorem", title: "Compactness", line: 10, level: 0 }`, then `lemma`, `proposition`, `corollary`, and `remark` with fallback titles `Lemma`, `Proposition`, `Corollary`, and `Remark`; no standalone `thm:compact` label and no equation label.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd scriptorium && npm run build:core && node packages/core/tests/latexNavigation.test.mjs`

Expected: failure because theorem-like environments are not recognized.

- [ ] **Step 3: Implement parser support**

Add the five kind literals to `LatexNavigationKind`, define a `TheoremKind` extraction, and add a `theoremBeginPattern` matching `\\begin{(theorem|lemma|proposition|corollary|remark)\\*?}`. At each non-math source line, create an entry at the begin command using the optional bracket argument as `displayTitle`, otherwise `Theorem`, `Lemma`, `Proposition`, `Corollary`, or `Remark`. Track the active theorem environment until its matching `\\end`, associate its first unconsumed label with the entry, and consume that label. This matches the existing float-label behavior and does not change formula filtering.

- [ ] **Step 4: Add a presentation icon**

Import `BookOpen` from `lucide-react` and return it from `navigationIcon` when `entry.kind` is any of the five theorem-like kinds. Existing figure, table, label, and heading icons remain unchanged.

- [ ] **Step 5: Verify and commit**

Run: `cd scriptorium && npm test && npm run build`

Expected: core review/navigation tests, 7 Rust server tests, and Vite build exit 0. Verify manually in the local app that all five entries occur under Document, formulas do not occur, and clicking an entry focuses the matching `\\begin` line.

```bash
git add packages/core/src/latexNavigation.ts packages/core/tests/latexNavigation.test.mjs apps/web/src/components/DocumentNavigation.tsx
git commit -m "feat: add theorem navigation entries"
```

## Self-Review

1. The single task covers each requested environment, optional titles, labels, UI display, formula exclusion, and regression checks.
2. Every code/test change and command is named; no placeholder work remains.
3. The existing `LatexNavigationEntry` contract is preserved, so scanner output remains directly consumable by the current navigation panel.

