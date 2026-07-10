# Preserve Compound Surnames and Add 6G Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve hyphenated/compound surnames during bibliography formatting and keep `6G` capitalized as a protected professional term.

**Architecture:** Extend the core bibliography formatter's explicit proper-noun/term protection without changing the public `formatBibliography` interface. Add regression assertions to the existing core bibliography fixture so the behavior is exercised through rendered `\\bibitem` output.

**Tech Stack:** TypeScript, Node.js `node:assert/strict` tests, npm core build.

## Global Constraints

- Preserve the existing author initials, `~` spacing, and two-author/Oxford-comma rules.
- Preserve existing title sentence-case behavior for ordinary words.
- Keep all changes inside the core formatter and its existing test suite; do not change the `.bib` source.

---

### Task 1: Add regression tests for surname and terminology preservation

**Files:**
- Modify: `scriptorium/packages/core/tests/bibliography.test.mjs`

**Interfaces:**
- Consumes: existing `formatBibliography` test helper and the `test-ref.bib`-style BibTeX fields.
- Produces: failing assertions requiring `R.~Olfati-Saber`, `C.~Eddy-Dilek`, and title text containing `6G`.

- [x] **Step 1: Write the failing assertions**

Add a focused `formatBibliography` call containing `Olfati-Saber`, `Eddy-Dilek`, and a title with `6G`, then assert the rendered output contains the preserved spellings and does not contain `6g`.

- [x] **Step 2: Run the focused test to verify it fails**

Run: `cd scriptorium && npm run build:core && node packages/core/tests/bibliography.test.mjs`

Expected: FAIL because the current author formatter lowercases the second hyphenated surname segment and the title formatter lowercases `6G`.

### Task 2: Implement preservation with the smallest core change

**Files:**
- Modify: `scriptorium/packages/core/src/bibliography.ts`

**Interfaces:**
- Consumes: existing `formatAuthors`, `sentenceCapitalise`, `properNouns`, and `formatTitle` behavior.
- Produces: the same public `formatBibliography` result shape with compound surnames and `6G` preserved.

- [x] **Step 1: Add `6G` to the protected terminology list**

Extend `properNouns` with `"6G"`; the existing title path will preserve a word containing this term instead of applying lowercase sentence casing.

- [x] **Step 2: Preserve each hyphenated surname segment**

Replace the surname formatting expression in `formatAuthors` with a helper that applies `sentenceCapitalise` to each hyphen-separated surname segment and rejoins them with `-`, so `Olfati-Saber` and `Eddy-Dilek` remain title-cased while ordinary surnames keep current behavior.

- [x] **Step 3: Run the focused core test**

Run: `cd scriptorium && npm run build:core && node packages/core/tests/bibliography.test.mjs`

Expected: PASS, including the new regression assertions.

### Task 3: Run the complete verification suite

**Files:**
- No additional files.

**Interfaces:**
- Consumes: the updated core formatter and existing project tests.
- Produces: verified build/test status with no changes to `test-ref.bib`.

- [x] **Step 1: Run all core tests**

Run: `cd scriptorium && npm run test:core`

Expected: review, LaTeX navigation, and bibliography formatter tests all pass.

- [x] **Step 2: Build the web application**

Run: `cd scriptorium && npm run build`

Expected: TypeScript compilation and Vite production build complete successfully.

- [x] **Step 3: Review the final diff**

Run: `git diff -- scriptorium/packages/core/src/bibliography.ts scriptorium/packages/core/tests/bibliography.test.mjs`

Expected: only the explicit `6G` term, hyphenated surname helper, and their regression assertions are changed.
