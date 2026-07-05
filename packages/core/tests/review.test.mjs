import assert from "node:assert/strict";
import {
  acceptHunk,
  createReviewSession,
  keepEditedHunk,
  refreshReviewSession,
  rejectHunk,
  summarizeReview
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

assert.equal(session.hunks.length, 1);
assert.equal(session.workingText, proposed);
assert.deepEqual(summarizeReview(session), {
  pending: 1,
  accepted: 0,
  rejected: 0,
  edited: 0,
  conflict: 0
});

const rejected = rejectHunk(session, "hunk-1");
assert.equal(rejected.workingText, original);
assert.equal(rejected.hunks[0].status, "rejected");

const accepted = acceptHunk(session, "hunk-1");
assert.equal(accepted.workingText, proposed);
assert.equal(accepted.hunks[0].status, "accepted");

const manual = proposed.replace("stronger", "clearer");
const refreshed = refreshReviewSession(session, manual);
assert.equal(refreshed.hunks[0].status, "edited");

const kept = keepEditedHunk(refreshed, "hunk-1");
assert.equal(kept.hunks[0].status, "edited");

console.log("core review tests passed");
