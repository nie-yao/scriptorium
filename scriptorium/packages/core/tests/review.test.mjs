import assert from "node:assert/strict";
import {
  acceptHunk,
  createReviewSession,
  diffInlineChanges,
  keepEditedHunk,
  refreshReviewSession,
  rejectHunk,
  summarizeReview,
  undoHunkAction
} from "../dist/index.js";

const original = "\\section{Intro}\nThis is a draft.\nMore text.\n";
const proposed = "\\section{Introduction}\nThis is a stronger draft.\nMore text.\n";

const session = createReviewSession({
  filePath: "main.tex",
  originalText: original,
  proposedText: proposed,
  sessionId: "test-session",
  createdAt: "2026-01-01T00:00:00.000Z"
});

assert.equal(session.hunks.length, 2);
assert.equal(session.hunks[0].originalText, "\\section{Intro}\n");
assert.equal(session.hunks[0].proposedText, "\\section{Introduction}\n");
assert.equal(session.hunks[1].originalText, "This is a draft.\n");
assert.equal(session.hunks[1].proposedText, "This is a stronger draft.\n");
assert.equal(session.workingText, proposed);
assert.deepEqual(summarizeReview(session), {
  pending: 2,
  accepted: 0,
  rejected: 0,
  edited: 0,
  conflict: 0
});

const rejected = rejectHunk(session, "hunk-1");
assert.equal(rejected.workingText, "\\section{Intro}\nThis is a stronger draft.\nMore text.\n");
assert.equal(rejected.hunks[0].status, "rejected");
assert.equal(rejected.hunks[0].undo?.status, "pending");
assert.equal(rejected.hunks[1].status, "pending");

const undoRejected = undoHunkAction(rejected, "hunk-1");
assert.equal(undoRejected.workingText, proposed);
assert.equal(undoRejected.hunks[0].status, "pending");
assert.equal(undoRejected.hunks[0].undo, undefined);

const editedAfterReject = refreshReviewSession(rejected, rejected.workingText.replace("stronger", "clearer"));
assert.equal(editedAfterReject.hunks[0].status, "rejected");
assert.equal(editedAfterReject.hunks[1].status, "pending");

const accepted = acceptHunk(session, "hunk-1");
assert.equal(accepted.workingText, proposed);
assert.equal(accepted.hunks[0].status, "accepted");
assert.equal(accepted.hunks[0].undo?.status, "pending");
assert.equal(accepted.hunks[1].status, "pending");

const undoAccepted = undoHunkAction(accepted, "hunk-1");
assert.equal(undoAccepted.workingText, proposed);
assert.equal(undoAccepted.hunks[0].status, "pending");
assert.equal(undoAccepted.hunks[0].undo, undefined);

const editedAfterAccept = refreshReviewSession(accepted, accepted.workingText.replace("stronger", "clearer"));
assert.equal(editedAfterAccept.hunks[0].status, "accepted");
assert.equal(editedAfterAccept.hunks[1].status, "pending");

const manual = proposed.replace("stronger", "clearer");
const refreshed = refreshReviewSession(session, manual);
assert.equal(refreshed.hunks[0].status, "pending");
assert.equal(refreshed.hunks[1].status, "pending");

const restored = refreshReviewSession(refreshed, proposed);
assert.equal(restored.hunks[0].status, "pending");
assert.equal(restored.hunks[1].status, "pending");

const kept = keepEditedHunk(refreshed, "hunk-2");
assert.equal(kept.workingText, manual);
assert.equal(kept.hunks[1].status, "edited");
assert.equal(kept.hunks[1].undo?.status, "pending");
assert.deepEqual(summarizeReview(kept), {
  pending: 1,
  accepted: 0,
  rejected: 0,
  edited: 1,
  conflict: 0
});

const undoKept = undoHunkAction(kept, "hunk-2");
assert.equal(undoKept.workingText, manual);
assert.equal(undoKept.hunks[1].status, "pending");
assert.equal(undoKept.hunks[1].undo, undefined);

const adjacentOriginal = "first old\nsecond old\nthird old\nstable tail\n";
const adjacentProposed = "first new\nsecond new\nthird new\nstable tail\n";
const adjacentSession = createReviewSession({
  filePath: "main.tex",
  originalText: adjacentOriginal,
  proposedText: adjacentProposed,
  sessionId: "adjacent-session",
  createdAt: "2026-01-01T00:00:00.000Z"
});
assert.equal(adjacentSession.hunks.length, 3);

let adjacentFlow = acceptHunk(adjacentSession, "hunk-1");
adjacentFlow = rejectHunk(adjacentFlow, "hunk-2");
adjacentFlow = refreshReviewSession(adjacentFlow, adjacentFlow.workingText.replace("third new", "third manual"));
assert.equal(adjacentFlow.hunks[2].status, "pending");
adjacentFlow = keepEditedHunk(adjacentFlow, "hunk-3");
assert.equal(adjacentFlow.hunks[2].status, "edited");

adjacentFlow = undoHunkAction(adjacentFlow, "hunk-1");
adjacentFlow = undoHunkAction(adjacentFlow, "hunk-2");
assert.equal(adjacentFlow.workingText, "first new\nsecond new\nthird manual\nstable tail\n");
assert.deepEqual(summarizeReview(adjacentFlow), {
  pending: 2,
  accepted: 0,
  rejected: 0,
  edited: 1,
  conflict: 0
});
assert.equal(adjacentFlow.hunks[2].status, "edited");

adjacentFlow = undoHunkAction(adjacentFlow, "hunk-3");
assert.equal(adjacentFlow.workingText, "first new\nsecond new\nthird manual\nstable tail\n");
assert.deepEqual(summarizeReview(adjacentFlow), {
  pending: 3,
  accepted: 0,
  rejected: 0,
  edited: 0,
  conflict: 0
});

const insertedPhrase = diffInlineChanges("This is a draft.", "This is a stronger draft.");
assert.deepEqual(spanTexts(insertedPhrase.originalSpans), []);
assert.deepEqual(spanTexts(insertedPhrase.proposedSpans), ["stronger"]);

const insertedPunctuatedPhrase = diffInlineChanges("A compact local demo", "A compact, reproducible local demo");
assert.deepEqual(spanTexts(insertedPunctuatedPhrase.originalSpans), []);
assert.deepEqual(spanTexts(insertedPunctuatedPhrase.proposedSpans), [", reproducible"]);

const replacedPhrase = diffInlineChanges(
  "The editor should review AI edits one hunk at a time while preserving manual changes.",
  "The editor should review AI edits one deterministic hunk at a test to preserving manual changes."
);
assert.deepEqual(spanTexts(replacedPhrase.originalSpans), ["time while"]);
assert.deepEqual(spanTexts(replacedPhrase.proposedSpans), ["deterministic", "test to"]);

const expandedWord = diffInlineChanges("\\section{Intro}", "\\section{Introduction}");
assert.deepEqual(spanTexts(expandedWord.originalSpans), []);
assert.deepEqual(spanTexts(expandedWord.proposedSpans), ["duction"]);

const formulaReplacement = diffInlineChanges(
  "s_{\\mathrm{draft}} = \\alpha x + \\beta",
  "s_{\\mathrm{polished}} = \\alpha x + \\beta + \\gamma"
);
assert.deepEqual(spanTexts(formulaReplacement.originalSpans), ["draft"]);
assert.deepEqual(spanTexts(formulaReplacement.proposedSpans), ["polished", "+ \\gamma"]);

const replacedWord = diffInlineChanges("old method", "new method");
assert.deepEqual(spanTexts(replacedWord.originalSpans), ["old"]);
assert.deepEqual(spanTexts(replacedWord.proposedSpans), ["new"]);

const deletedPhrase = diffInlineChanges("remove fragile wording", "remove wording");
assert.deepEqual(spanTexts(deletedPhrase.originalSpans), ["fragile"]);
assert.deepEqual(spanTexts(deletedPhrase.proposedSpans), []);

const whitespaceOnlyInsertion = diffInlineChanges("left right", "left  right");
assert.deepEqual(spanTexts(whitespaceOnlyInsertion.originalSpans), []);
assert.deepEqual(spanTexts(whitespaceOnlyInsertion.proposedSpans), ["  "]);

console.log("core review tests passed");

function spanTexts(spans) {
  return spans.map((span) => span.text);
}
