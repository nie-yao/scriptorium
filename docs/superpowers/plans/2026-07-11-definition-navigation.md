# Definition Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect LaTeX `definition` environments in document navigation and extract their optional titles and labels.

**Architecture:** Extend the existing deterministic theorem-like environment scanner so `\\begin{definition}` and its starred form create a navigation entry at the begin-command line. Reuse the current optional-title parsing, active-environment label association, and UI icon behavior.

**Tech Stack:** TypeScript, React, Node assert tests.

## Global Constraints

- Keep detection deterministic and local; do not change platform APIs.
- Continue excluding math environments and commented source.
- Recognize `definition` and `definition*`, with an optional bracketed display title.
- Recognize `assumption` and `assumption*`, with an optional bracketed display title.
- Associate labels inside the environment with the definition entry and avoid duplicate standalone label entries.

## File Structure

- Modify `scriptorium/packages/core/src/latexNavigation.ts` to add the `definition` kind and include it in theorem-like scanning.
- Modify `scriptorium/packages/core/src/latexNavigation.ts` to add the `assumption` kind and include it in theorem-like scanning.
- Modify `scriptorium/packages/core/tests/latexNavigation.test.mjs` to cover titled, untitled, starred, labeled, and math-filtered definitions.
- Modify `scriptorium/apps/web/src/components/DocumentNavigation.tsx` so definition entries share the existing `BookOpen` icon with theorem-like entries.

### Task 1: Add definition navigation coverage and implementation

**Files:**

- Modify: `scriptorium/packages/core/tests/latexNavigation.test.mjs`
- Modify: `scriptorium/packages/core/src/latexNavigation.ts`
- Modify: `scriptorium/apps/web/src/components/DocumentNavigation.tsx`

**Interfaces:**

- Extend `LatexNavigationKind` with `definition`.
- Retain `scanLatexNavigation(text: string): LatexNavigationEntry[]`.

- [x] **Step 1: Add the failing test**

Add definition environments before the equation and assert the projection includes `definition` entries with the optional title, fallback title `Definition`, and one-based source order represented by the existing zero-based line values. Assert the first definition's label is attached and not emitted as a separate label.

- [x] **Step 2: Run the focused test and confirm failure**

Run `cd scriptorium && npm run build:core && node packages/core/tests/latexNavigation.test.mjs`; expect the new definition assertions to fail before implementation.

- [x] **Step 3: Implement the smallest scanner extension**

Add `definition` to `LatexNavigationKind`, include it in `TheoremKind`, and extend the existing begin/end matching and fallback-title logic so the active-environment state handles `definition` exactly like the other theorem-like environments, including `definition*` and optional `[Title]`.

Also include `definition` in the existing `BookOpen` icon branch in `DocumentNavigation.tsx`.

Extend the same scanner family with `assumption` and include it in the same `BookOpen` icon branch.

- [x] **Step 4: Run focused and full verification**

Run `cd scriptorium && npm test && npm run build`; expect all core tests, Rust tests, and the web build to pass.

- [x] **Step 5: Review the diff**

Run `git diff --check` and inspect that only the core scanner/test files changed for this feature.

## Self-Review

- The plan covers detection, optional title extraction, fallback naming, label extraction, starred syntax, math exclusion, and regression verification.
- Definition entries reuse the existing theorem-like `BookOpen` presentation and do not require a new icon or UI contract.
- The scanner's public function and entry shape remain unchanged.
