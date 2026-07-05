export type HunkStatus = "pending" | "accepted" | "rejected" | "edited" | "conflict";

export type TextRange = [number, number];

export interface ReviewAnchor {
  contextBefore: string;
  contextAfter: string;
}

export interface ReviewHunk {
  id: string;
  originalRange: TextRange;
  proposedRange: TextRange;
  workingAnchor: ReviewAnchor;
  status: HunkStatus;
  originalText: string;
  proposedText: string;
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
  return updateHunk(session, hunkId, { status: "accepted" }, workingText);
}

export function keepEditedHunk(session: ReviewSession, hunkId: string, workingText = session.workingText): ReviewSession {
  return updateHunk(session, hunkId, { status: "edited" }, workingText);
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
  return updateHunk(session, hunkId, { status: "rejected" }, nextWorkingText);
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
  return updateHunk(session, hunkId, { status: "pending" }, nextWorkingText);
}

export function refreshReviewSession(session: ReviewSession, workingText: string): ReviewSession {
  const hunks = session.hunks.map((hunk) => {
    if (hunk.status === "accepted" || hunk.status === "rejected") {
      return hunk;
    }

    const located = locateHunk(workingText, hunk);
    if (!located) {
      return { ...hunk, status: "conflict" as HunkStatus };
    }

    if (located.currentText === hunk.proposedText && hunk.status !== "edited") {
      return { ...hunk, status: "pending" as HunkStatus };
    }

    return { ...hunk, status: "edited" as HunkStatus };
  });

  return { ...session, workingText, hunks };
}

export function locateHunk(workingText: string, hunk: ReviewHunk): LocateResult | null {
  const exactProposed = locateText(workingText, hunk.proposedText);
  if (exactProposed) {
    return exactProposed;
  }

  const { contextBefore, contextAfter } = hunk.workingAnchor;
  const anchoredRanges: TextRange[] = [];

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
      anchoredRanges.push([start, start + hunk.proposedText.length]);
    }
  } else if (contextAfter) {
    for (const afterIndex of findAllIndexes(workingText, contextAfter)) {
      const start = Math.max(0, afterIndex - hunk.proposedText.length);
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

export function summarizeReview(session: ReviewSession): Record<HunkStatus, number> {
  return session.hunks.reduce<Record<HunkStatus, number>>(
    (summary, hunk) => {
      summary[hunk.status] += 1;
      return summary;
    },
    { pending: 0, accepted: 0, rejected: 0, edited: 0, conflict: 0 }
  );
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

    const originalEndLine = pending.originalStart + pending.originalParts.length;
    const proposedEndLine = pending.proposedStart + pending.proposedParts.length;
    const originalTextChunk = pending.originalParts.join("");
    const proposedTextChunk = pending.proposedParts.join("");

    if (originalTextChunk !== proposedTextChunk) {
      hunks.push({
        id: `hunk-${hunks.length + 1}`,
        originalRange: [originalOffsets[pending.originalStart], originalOffsets[originalEndLine]],
        proposedRange: [proposedOffsets[pending.proposedStart], proposedOffsets[proposedEndLine]],
        workingAnchor: {
          contextBefore: proposedLines
            .slice(Math.max(0, pending.proposedStart - CONTEXT_LINES), pending.proposedStart)
            .join(""),
          contextAfter: proposedLines
            .slice(proposedEndLine, Math.min(proposedLines.length, proposedEndLine + CONTEXT_LINES))
            .join("")
        },
        status: "pending",
        originalText: originalTextChunk,
        proposedText: proposedTextChunk
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
