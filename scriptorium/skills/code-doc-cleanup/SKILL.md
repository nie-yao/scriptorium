---
name: code-doc-cleanup
description: Audit repository changes, align documentation with implemented code, find obvious bugs, and remove clearly dead or duplicate files. Use when the user asks to check current or since-commit changes, update docs based on code, identify stale docs, clean deprecated code, remove duplicate/generated files, or perform repo maintenance without reverting user work.
---

# Code Doc Cleanup

## Workflow

1. Establish the change boundary with git.
   - Run `git status --short`, `git diff --stat`, and when relevant `git diff --cached --stat`.
   - Treat staged renames, dirty files, and untracked directories as user work until proven otherwise.
   - Do not revert, unstage, delete, or move user changes unless explicitly requested.

2. Let the code define reality.
   - Read entrypoints, core logic, UI, tests, scripts, and public APIs before editing docs.
   - Compare those behaviors against README, handoff, requirements, changelogs, and other docs.
   - Rewrite docs to distinguish: implemented, interface-only, manual workaround, known gap, and future work.

3. Look for high-confidence cleanup.
   - Remove only dead code, stale CSS, obsolete docs, duplicate files, or generated artifacts with clear evidence.
   - Prefer `rg` for references. A file or symbol is not dead just because it is untracked or unfamiliar.
   - Preserve useful user assets, examples, skills, notes, and data unless the user confirms deletion.

4. Check for obvious bugs while reading.
   - Focus on state transitions, save/undo paths, path moves, build/test commands, API routes, and docs that imply impossible behavior.
   - Fix small, well-scoped bugs discovered during the audit. Call out larger risks instead of expanding scope silently.

5. Validate and report.
   - Run the repo's relevant tests/builds plus `git diff --check` when available.
   - Report validation warnings separately from failures.
   - Summarize changes as: docs aligned, bugs fixed, dead/duplicate cleanup, left untouched, validation.

## Guardrails

- Use `apply_patch` for edits.
- Never assume a staged rename is accidental; ask or preserve it.
- Never use destructive git commands for cleanup.
- If the repo moved into a subdirectory, run project commands from the new project root.
- Keep final answers concise and include paths for important files.
