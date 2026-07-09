---
name: git-submit
description: Standard Git submission workflow for this project. Use when the user asks Codex to submit, commit, merge, publish, push, or release changes from dev to main, especially when they want a guarded flow that checks the current branch, stages changes, generates an English "type: summary" commit message, merges dev into main, pushes origin/main, and requires user confirmation before committing.
---

# Git Submit

Use this skill to submit project changes through the `dev -> main -> origin/main` flow.

## Required Workflow

1. Confirm the working branch is `dev`.
   - Run `git branch --show-current`.
   - If the branch is not `dev`, stop and ask the user whether to switch.

2. Inspect the work before staging.
   - Run `git status --short --branch`.
   - Run `git diff --stat`.
   - Run `git diff --check`.
   - Optionally run targeted tests/builds when the changed files make that useful.

3. Stage changes.
   - Run `git add .` unless the user requested a narrower scope.
   - Run `git status --short`.
   - Run `git diff --cached --stat`.
   - Run `git diff --cached --check`.

4. Generate a commit message from the staged diff.
   - Inspect `git diff --cached`.
   - Write the message in English.
   - Use exactly the format `xxx: xxx`, such as `feat: add project upload flow`, `fix: handle hunk conflicts`, `docs: add git submission skill`, `chore: update build config`, or `test: cover review session refresh`.
   - Keep the summary concise and specific.

5. Stop before committing.
   - Show the user all command outputs that matter: branch, status, diff stats, validation results, and any test/build results.
   - Show the proposed commit message.
   - Ask for explicit confirmation before running `git commit`.
   - Do not commit if the user has not clearly approved.

6. After approval, commit.
   - Run `git commit -m "<generated message>"`.
   - Show the commit output.

7. Merge into `main`.
   - Run `git switch main`.
   - Ensure `main` tracks `origin/main`; if not, set it only after explaining the change.
   - Run `git merge dev`.
   - If conflicts occur, stop and ask the user how to proceed after showing conflict details.

8. Push `main`.
   - Run `git push origin main`.
   - Show the push output.

9. Return to `dev` when useful.
   - If the user normally works on `dev`, run `git switch dev` after a successful push.
   - Ensure `dev` does not track any remote branch if the project convention requires that.

## Safety Rules

- Never use `git reset --hard`, `git checkout --`, `git clean`, or force push unless the user explicitly requests it for the current task.
- Do not hide command failures. Show the relevant output and stop.
- Do not commit generated dependency folders, build outputs, local machine state, or LaTeX compilation artifacts unless the user explicitly requests them.
- If the worktree contains unrelated user changes, mention them and avoid bundling them into the commit unless the user confirms.
- If `git add .` stages unexpected files, unstage only after explaining the issue and getting permission when the unstage would affect user work.

## Output Style

Before the approval gate, present:

```text
Branch:
<output>

Pre-stage status:
<output>

Staged status:
<output>

Validation:
<output>

Proposed commit message:
xxx: xxx
```

Then ask one concise question: whether to proceed with `git commit`, merge into `main`, and push `origin/main`.
