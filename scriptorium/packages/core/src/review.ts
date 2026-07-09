export type HunkStatus = "pending" | "accepted" | "rejected" | "edited" | "conflict";

export type TextRange = [number, number];

export interface ReviewAnchor {
  contextBefore: string;
  contextAfter: string;
}

export interface ReviewHunkUndo {
  status: HunkStatus;
  workingAnchor: ReviewAnchor;
  text: string;
}

export interface ReviewHunk {
  id: string;
  originalRange: TextRange;
  proposedRange: TextRange;
  workingAnchor: ReviewAnchor;
  status: HunkStatus;
  originalText: string;
  proposedText: string;
  currentText?: string;
  undo?: ReviewHunkUndo;
}

export interface ReviewSession {
  sessionId: string;
  filePath: string;
  createdAt: string;
  originalText: string;
  proposedText: string;
  workingText: string;
  hunks: ReviewHunk[];
}

export interface CreateReviewSessionInput {
  filePath: string;
  originalText: string;
  proposedText: string;
  workingText?: string;
  sessionId?: string;
  createdAt?: string;
}

export interface LocateResult {
  kind: "exact" | "anchored";
  range: TextRange;
  currentText: string;
}

interface DiffOp {
  kind: "equal" | "delete" | "insert";
  text: string;
  originalLine: number;
  proposedLine: number;
}

const CONTEXT_LINES = 3;

export function createReviewSession(input: CreateReviewSessionInput): ReviewSession {
  const hunks = createLineHunks(input.originalText, input.proposedText);

  return {
    sessionId: input.sessionId ?? `session-${Date.now().toString(36)}`,
    filePath: input.filePath,
    createdAt: input.createdAt ?? new Date().toISOString(),
    originalText: input.originalText,
    proposedText: input.proposedText,
    workingText: input.workingText ?? input.proposedText,
    hunks
  };
}

export function acceptHunk(session: ReviewSession, hunkId: string, workingText = session.workingText): ReviewSession {
  const hunk = session.hunks.find((item) => item.id === hunkId);
  if (!hunk) {
    return session;
  }

  const located = locateHunk(workingText, hunk);
  if (!located) {
    return updateHunk(session, hunkId, { status: "conflict" }, workingText);
  }

  return updateHunk(
    session,
    hunkId,
    { status: "accepted", currentText: located.currentText, undo: createUndoState(hunk, workingText, located) },
    workingText
  );
}

export function keepEditedHunk(session: ReviewSession, hunkId: string, workingText = session.workingText): ReviewSession {
  const hunk = session.hunks.find((item) => item.id === hunkId);
  if (!hunk) {
    return session;
  }

  const located = locateHunk(workingText, hunk);
  if (!located) {
    return updateHunk(session, hunkId, { status: "conflict" }, workingText);
  }

  return updateHunk(
    session,
    hunkId,
    { status: "edited", currentText: located.currentText, undo: createUndoState(hunk, workingText, located) },
    workingText
  );
}

export function rejectHunk(session: ReviewSession, hunkId: string, workingText = session.workingText): ReviewSession {
  const hunk = session.hunks.find((item) => item.id === hunkId);
  if (!hunk) {
    return session;
  }

  const located = locateHunk(workingText, hunk);
  if (!located) {
    return updateHunk(session, hunkId, { status: "conflict" }, workingText);
  }

  const nextWorkingText = replaceRange(workingText, located.range, hunk.originalText);
  return updateHunk(
    session,
    hunkId,
    { status: "rejected", currentText: hunk.originalText, undo: createUndoState(hunk, workingText, located) },
    nextWorkingText
  );
}

export function useAiVersion(session: ReviewSession, hunkId: string, workingText = session.workingText): ReviewSession {
  const hunk = session.hunks.find((item) => item.id === hunkId);
  if (!hunk) {
    return session;
  }

  const located = locateHunk(workingText, hunk) ?? locateText(workingText, hunk.originalText);
  if (!located) {
    return updateHunk(session, hunkId, { status: "conflict" }, workingText);
  }

  const nextWorkingText = replaceRange(workingText, located.range, hunk.proposedText);
  return updateHunk(session, hunkId, { status: "pending", currentText: hunk.proposedText, undo: undefined }, nextWorkingText);
}

export function undoHunkAction(session: ReviewSession, hunkId: string, workingText = session.workingText): ReviewSession {
  const hunk = session.hunks.find((item) => item.id === hunkId);
  if (!hunk?.undo) {
    return session;
  }

  const located = locateHunk(workingText, hunk) ?? locateText(workingText, hunk.originalText);
  if (!located) {
    const hunks = session.hunks.map((item) => (item.id === hunkId ? { ...item, status: "conflict" as HunkStatus } : item));
    return { ...session, workingText, hunks };
  }

  const undo = hunk.undo;
  const nextWorkingText = replaceRange(workingText, located.range, undo.text);
  const hunks = session.hunks.map((item) =>
    item.id === hunkId
      ? {
          ...item,
          status: undo.status,
          workingAnchor: undo.workingAnchor,
          currentText: undo.text,
          undo: undefined
        }
      : item
  );
  return refreshReviewSession({ ...session, workingText: nextWorkingText, hunks }, nextWorkingText);
}

export function refreshReviewSession(session: ReviewSession, workingText: string): ReviewSession {
  const hunks = session.hunks.map((hunk) => {
    if (isResolvedHunk(hunk)) {
      return hunk;
    }

    const located = locateHunk(workingText, hunk);
    if (!located) {
      return { ...hunk, status: "conflict" as HunkStatus };
    }

    const refreshedHunk = {
      ...hunk,
      currentText: located.currentText,
      workingAnchor: createWorkingAnchor(workingText, located.range)
    };

    if (located.currentText === hunk.proposedText) {
      return { ...refreshedHunk, status: "pending" as HunkStatus };
    }

    return { ...refreshedHunk, status: "pending" as HunkStatus };
  });

  return { ...session, workingText, hunks };
}

export function locateHunk(workingText: string, hunk: ReviewHunk): LocateResult | null {
  for (const text of currentTextCandidates(hunk)) {
    const exact = locateText(workingText, text);
    if (exact) {
      return exact;
    }
  }

  const { contextBefore, contextAfter } = hunk.workingAnchor;
  const anchoredRanges: TextRange[] = [];
  const expectedText = currentTextCandidates(hunk)[0] ?? hunk.proposedText;

  if (contextBefore && contextAfter) {
    const beforeIndexes = findAllIndexes(workingText, contextBefore);
    for (const beforeIndex of beforeIndexes) {
      const start = beforeIndex + contextBefore.length;
      const afterIndex = workingText.indexOf(contextAfter, start);
      if (afterIndex >= start) {
        anchoredRanges.push([start, afterIndex]);
      }
    }
  } else if (contextBefore) {
    for (const beforeIndex of findAllIndexes(workingText, contextBefore)) {
      const start = beforeIndex + contextBefore.length;
      anchoredRanges.push([start, start + expectedText.length]);
    }
  } else if (contextAfter) {
    for (const afterIndex of findAllIndexes(workingText, contextAfter)) {
      const start = Math.max(0, afterIndex - expectedText.length);
      anchoredRanges.push([start, afterIndex]);
    }
  }

  const validRanges = anchoredRanges.filter(([start, end]) => start >= 0 && end >= start && end <= workingText.length);
  if (validRanges.length !== 1) {
    return null;
  }

  const range = validRanges[0];
  return {
    kind: "anchored",
    range,
    currentText: workingText.slice(range[0], range[1])
  };
}

function createWorkingAnchor(text: string, range: TextRange): ReviewAnchor {
  const lines = splitLinesPreserve(text);
  const offsets = buildOffsets(lines);
  const startLine = lineIndexContainingOffset(offsets, range[0]);
  const endLine = lineIndexAfterOffset(offsets, range[1]);

  return {
    contextBefore: lines.slice(Math.max(0, startLine - CONTEXT_LINES), startLine).join(""),
    contextAfter: lines.slice(endLine, Math.min(lines.length, endLine + CONTEXT_LINES)).join("")
  };
}

export function summarizeReview(session: ReviewSession): Record<HunkStatus, number> {
  return session.hunks.reduce<Record<HunkStatus, number>>(
    (summary, hunk) => {
      summary[hunk.status] += 1;
      return summary;
    },
    { pending: 0, accepted: 0, rejected: 0, edited: 0, conflict: 0 }
  );
}

function isResolvedHunk(hunk: ReviewHunk): boolean {
  return hunk.status === "accepted" || hunk.status === "rejected" || (hunk.status === "edited" && Boolean(hunk.undo));
}

function currentTextCandidates(hunk: ReviewHunk): string[] {
  const candidates = [
    hunk.currentText,
    hunk.status === "rejected" ? hunk.originalText : undefined,
    hunk.status === "accepted" ? hunk.proposedText : undefined,
    hunk.status === "edited" ? hunk.undo?.text : undefined,
    hunk.proposedText
  ];
  return [...new Set(candidates.filter((text): text is string => Boolean(text)))];
}

function updateHunk(
  session: ReviewSession,
  hunkId: string,
  patch: Partial<ReviewHunk>,
  workingText: string
): ReviewSession {
  const hunks = session.hunks.map((hunk) => (hunk.id === hunkId ? { ...hunk, ...patch } : hunk));
  return refreshReviewSession({ ...session, workingText, hunks }, workingText);
}

function createUndoState(hunk: ReviewHunk, workingText: string, located: LocateResult): ReviewHunkUndo {
  return {
    status: hunk.status,
    workingAnchor: createWorkingAnchor(workingText, located.range),
    text: located.currentText
  };
}

function createLineHunks(originalText: string, proposedText: string): ReviewHunk[] {
  const originalLines = splitLinesPreserve(originalText);
  const proposedLines = splitLinesPreserve(proposedText);
  const ops = diffLines(originalLines, proposedLines);
  const originalOffsets = buildOffsets(originalLines);
  const proposedOffsets = buildOffsets(proposedLines);
  const hunks: ReviewHunk[] = [];

  let pending: {
    originalStart: number;
    proposedStart: number;
    originalParts: string[];
    proposedParts: string[];
  } | null = null;

  const flush = () => {
    if (!pending) {
      return;
    }

    const hunkCount = Math.max(pending.originalParts.length, pending.proposedParts.length);
    for (let index = 0; index < hunkCount; index += 1) {
      const originalTextChunk = pending.originalParts[index] ?? "";
      const proposedTextChunk = pending.proposedParts[index] ?? "";
      if (originalTextChunk === proposedTextChunk) {
        continue;
      }

      const originalStartLine = pending.originalStart + Math.min(index, pending.originalParts.length);
      const originalEndLine = originalStartLine + (originalTextChunk ? 1 : 0);
      const proposedStartLine = pending.proposedStart + Math.min(index, pending.proposedParts.length);
      const proposedEndLine = proposedStartLine + (proposedTextChunk ? 1 : 0);

      hunks.push({
        id: `hunk-${hunks.length + 1}`,
        originalRange: [originalOffsets[originalStartLine], originalOffsets[originalEndLine]],
        proposedRange: [proposedOffsets[proposedStartLine], proposedOffsets[proposedEndLine]],
        workingAnchor: {
          contextBefore: proposedLines
            .slice(Math.max(0, proposedStartLine - CONTEXT_LINES), proposedStartLine)
            .join(""),
          contextAfter: proposedLines
            .slice(proposedEndLine, Math.min(proposedLines.length, proposedEndLine + CONTEXT_LINES))
            .join("")
        },
        status: "pending",
        originalText: originalTextChunk,
        proposedText: proposedTextChunk,
        currentText: proposedTextChunk
      });
    }

    pending = null;
  };

  for (const op of ops) {
    if (op.kind === "equal") {
      flush();
      continue;
    }

    if (!pending) {
      pending = {
        originalStart: op.originalLine,
        proposedStart: op.proposedLine,
        originalParts: [],
        proposedParts: []
      };
    }

    if (op.kind === "delete") {
      pending.originalParts.push(op.text);
    } else {
      pending.proposedParts.push(op.text);
    }
  }

  flush();
  return hunks;
}

function diffLines(originalLines: string[], proposedLines: string[]): DiffOp[] {
  const n = originalLines.length;
  const m = proposedLines.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));

  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = originalLines[i] === proposedLines[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;

  while (i < n && j < m) {
    if (originalLines[i] === proposedLines[j]) {
      ops.push({ kind: "equal", text: originalLines[i], originalLine: i, proposedLine: j });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ kind: "delete", text: originalLines[i], originalLine: i, proposedLine: j });
      i += 1;
    } else {
      ops.push({ kind: "insert", text: proposedLines[j], originalLine: i, proposedLine: j });
      j += 1;
    }
  }

  while (i < n) {
    ops.push({ kind: "delete", text: originalLines[i], originalLine: i, proposedLine: j });
    i += 1;
  }

  while (j < m) {
    ops.push({ kind: "insert", text: proposedLines[j], originalLine: i, proposedLine: j });
    j += 1;
  }

  return ops;
}

function splitLinesPreserve(text: string): string[] {
  if (!text) {
    return [];
  }
  const parts = text.match(/.*(?:\r\n|\n|\r|$)/g) ?? [];
  return parts.filter((part, index) => part.length > 0 || index < parts.length - 1);
}

function buildOffsets(lines: string[]): number[] {
  const offsets = [0];
  for (const line of lines) {
    offsets.push(offsets[offsets.length - 1] + line.length);
  }
  return offsets;
}

function lineIndexContainingOffset(offsets: number[], position: number): number {
  let index = 0;
  while (index + 1 < offsets.length && offsets[index + 1] <= position) {
    index += 1;
  }
  return Math.min(index, Math.max(0, offsets.length - 1));
}

function lineIndexAfterOffset(offsets: number[], position: number): number {
  let index = 0;
  while (index < offsets.length && offsets[index] < position) {
    index += 1;
  }
  return Math.min(index, Math.max(0, offsets.length - 1));
}

function locateText(workingText: string, needle: string): LocateResult | null {
  if (needle.length === 0) {
    return null;
  }

  const indexes = findAllIndexes(workingText, needle);
  if (indexes.length !== 1) {
    return null;
  }

  const start = indexes[0];
  return {
    kind: "exact",
    range: [start, start + needle.length],
    currentText: needle
  };
}

function findAllIndexes(text: string, needle: string): number[] {
  if (!needle) {
    return [];
  }

  const indexes: number[] = [];
  let start = 0;
  while (start <= text.length) {
    const index = text.indexOf(needle, start);
    if (index === -1) {
      break;
    }
    indexes.push(index);
    start = index + Math.max(needle.length, 1);
  }
  return indexes;
}

function replaceRange(text: string, range: TextRange, replacement: string): string {
  return `${text.slice(0, range[0])}${replacement}${text.slice(range[1])}`;
}
