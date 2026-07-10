# Diff Review Test Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify every applicable case in `scriptorium/diff-review-test-checklist.md` and produce an evidence-based test report without changing product code.

**Architecture:** First run the repository's automated core, server, and production-build checks. Then exercise the local web interface against `sample-project/main.tex`, recording each checklist case as passed, failed, or blocked with the observed result.

**Tech Stack:** npm, Cargo, Vite, React, CodeMirror, in-app browser.

## Global Constraints

- Do not modify existing implementation files while testing.
- Preserve all pre-existing uncommitted workspace changes.
- Test the review workflow using `scriptorium/sample-project/main.tex`.
- Record failures with a concise reproduction sequence and observed state.

---

### Task 1: Automated Regression

**Files:**
- Test: `scriptorium/packages/core/tests/review.test.mjs`
- Test: `scriptorium/apps/web-local-server/tests/projectFiles.test.mjs`
- Test: `scriptorium/Cargo.toml`

**Interfaces:**
- Consumes: repository scripts `npm run test` and `npm run build`.
- Produces: pass/fail evidence for core diff logic, local server, and build output.

- [x] **Step 1: Run the automated suite**

```bash
cd /Users/ynie/Documents/Work/项目/Scriptorium/scriptorium
npm run test
```

Expected: exit code `0`, including the core review tests and Rust local-server tests.

- [x] **Step 2: Run the production build**

```bash
cd /Users/ynie/Documents/Work/项目/Scriptorium/scriptorium
npm run build
```

Expected: exit code `0` and a generated Vite production bundle.

### Task 2: Web Review Workflow

**Files:**
- Test: `scriptorium/diff-review-test-checklist.md`
- Test data: `scriptorium/sample-project/main.tex`

**Interfaces:**
- Consumes: local development UI and all TC-01 through TC-20 checklist expectations.
- Produces: observed status, button, save, jump, and visual-diff behavior.

- [x] **Step 1: Start the local application**

```bash
cd /Users/ynie/Documents/Work/项目/Scriptorium/scriptorium
npm run dev
```

Expected: a local URL that opens the Scriptorium application.

- [x] **Step 2: Create a review for the sample main.tex file**

In the UI, open `sample-project`, select `main.tex`, select the `Review` tab, and choose `Create Review`.

Expected: four independently actionable hunks for the section, two prose lines, and equation line.

- [x] **Step 3: Execute TC-01 through TC-20**

For each checklist case, perform its listed interaction and capture the exact observed state, including status counts and action buttons.

Expected: each test result is clearly classified as pass, fail, or blocked; visual-only criteria are inspected directly.

### Task 3: Report Results

**Files:**
- Reference: `scriptorium/diff-review-test-checklist.md`

**Interfaces:**
- Consumes: results from Tasks 1 and 2.
- Produces: concise user-facing test report with reproduction details for failures.

- [x] **Step 1: Compare observations against each checklist expectation**

Map each TC identifier to `PASS`, `FAIL`, or `BLOCKED` and retain the observed behavior.

- [x] **Step 2: Deliver the test report**

State automated command outcomes, UI results, any untestable cases, and the highest-priority failures.
