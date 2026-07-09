import type { TextRange } from "./review.js";

export interface InlineDiffSpan {
  range: TextRange;
  text: string;
}

export interface InlineInsertionPoint {
  position: number;
  text: string;
}

export interface InlineDiffResult {
  originalSpans: InlineDiffSpan[];
  originalInsertionPoints: InlineInsertionPoint[];
  proposedSpans: InlineDiffSpan[];
}

interface InlineToken {
  kind: "command" | "word" | "space" | "punct";
  value: string;
  start: number;
  end: number;
}

interface DiffOp {
  kind: "equal" | "delete" | "insert";
  token: InlineToken;
}

const MAX_INLINE_DIFF_CELLS = 1_000_000;

export function diffInlineChanges(originalText: string, proposedText: string): InlineDiffResult {
  if (originalText === proposedText) {
    return { originalSpans: [], originalInsertionPoints: [], proposedSpans: [] };
  }

  const originalTokens = tokenizeInlineText(originalText);
  const proposedTokens = tokenizeInlineText(proposedText);

  if (originalTokens.length * proposedTokens.length > MAX_INLINE_DIFF_CELLS) {
    return diffBySharedEdges(originalText, proposedText, originalTokens, proposedTokens);
  }

  return spansFromOps(diffTokens(originalTokens, proposedTokens), originalText, proposedText);
}

function diffTokens(originalTokens: InlineToken[], proposedTokens: InlineToken[]): DiffOp[] {
  const originalLength = originalTokens.length;
  const proposedLength = proposedTokens.length;
  const dp = Array.from({ length: originalLength + 1 }, () => new Uint32Array(proposedLength + 1));

  for (let originalIndex = originalLength - 1; originalIndex >= 0; originalIndex -= 1) {
    for (let proposedIndex = proposedLength - 1; proposedIndex >= 0; proposedIndex -= 1) {
      dp[originalIndex][proposedIndex] =
        tokensEqual(originalTokens[originalIndex], proposedTokens[proposedIndex])
          ? dp[originalIndex + 1][proposedIndex + 1] + 1
          : Math.max(dp[originalIndex + 1][proposedIndex], dp[originalIndex][proposedIndex + 1]);
    }
  }

  const ops: DiffOp[] = [];
  let originalIndex = 0;
  let proposedIndex = 0;

  while (originalIndex < originalLength && proposedIndex < proposedLength) {
    if (tokensEqual(originalTokens[originalIndex], proposedTokens[proposedIndex])) {
      ops.push({ kind: "equal", token: originalTokens[originalIndex] });
      originalIndex += 1;
      proposedIndex += 1;
    } else if (dp[originalIndex + 1][proposedIndex] >= dp[originalIndex][proposedIndex + 1]) {
      ops.push({ kind: "delete", token: originalTokens[originalIndex] });
      originalIndex += 1;
    } else {
      ops.push({ kind: "insert", token: proposedTokens[proposedIndex] });
      proposedIndex += 1;
    }
  }

  while (originalIndex < originalLength) {
    ops.push({ kind: "delete", token: originalTokens[originalIndex] });
    originalIndex += 1;
  }

  while (proposedIndex < proposedLength) {
    ops.push({ kind: "insert", token: proposedTokens[proposedIndex] });
    proposedIndex += 1;
  }

  return ops;
}

function tokensEqual(originalToken: InlineToken, proposedToken: InlineToken): boolean {
  return originalToken.kind !== "space" && proposedToken.kind !== "space" && originalToken.value === proposedToken.value;
}

function spansFromOps(ops: DiffOp[], originalText: string, proposedText: string): InlineDiffResult {
  const originalSpans: InlineDiffSpan[] = [];
  const originalInsertionPoints: InlineInsertionPoint[] = [];
  const proposedSpans: InlineDiffSpan[] = [];
  let originalCursor = 0;

  for (let index = 0; index < ops.length; index += 1) {
    const op = ops[index];
    if (op.kind === "equal") {
      originalCursor = op.token.end;
      continue;
    }

    const insertionPosition = originalCursor;
    const deletedTokens: InlineToken[] = [];
    const insertedTokens: InlineToken[] = [];

    while (index < ops.length && ops[index].kind !== "equal") {
      const editOp = ops[index];
      if (editOp.kind === "delete") {
        deletedTokens.push(editOp.token);
        originalCursor = editOp.token.end;
      } else if (editOp.kind === "insert") {
        insertedTokens.push(editOp.token);
      }
      index += 1;
    }

    if (isSingleWordReplacement(deletedTokens, insertedTokens)) {
      const replacement = diffSingleWordReplacement(deletedTokens[0], insertedTokens[0], originalText, proposedText);
      for (const span of replacement.originalSpans) {
        appendSpan(originalSpans, originalText, span.range);
      }
      for (const span of replacement.proposedSpans) {
        appendSpan(proposedSpans, proposedText, span.range);
      }
    } else {
      appendTokenRange(originalSpans, originalText, deletedTokens);
      if (tokensContainNonSpace(insertedTokens) || !tokensContainNonSpace(deletedTokens)) {
        appendTokenRange(proposedSpans, proposedText, insertedTokens);
      }
    }

    if (deletedTokens.length === 0 && insertedTokens.length > 0) {
      appendInsertionPoint(originalInsertionPoints, insertionPosition, textForTokens(proposedText, insertedTokens));
    }
    index -= 1;
  }

  return {
    originalSpans: removeWhitespaceOnlySpans(mergeSpansAcrossWhitespace(originalText, trimBoundaryWhitespace(originalSpans))),
    originalInsertionPoints,
    proposedSpans: removeWhitespaceOnlySpansWhenMixed(mergeSpansAcrossWhitespace(proposedText, trimBoundaryWhitespace(proposedSpans)))
  };
}

function diffBySharedEdges(
  originalText: string,
  proposedText: string,
  originalTokens: InlineToken[],
  proposedTokens: InlineToken[]
): InlineDiffResult {
  let start = 0;
  while (
    start < originalTokens.length &&
    start < proposedTokens.length &&
    originalTokens[start].value === proposedTokens[start].value
  ) {
    start += 1;
  }

  let originalEnd = originalTokens.length;
  let proposedEnd = proposedTokens.length;
  while (
    originalEnd > start &&
    proposedEnd > start &&
    originalTokens[originalEnd - 1].value === proposedTokens[proposedEnd - 1].value
  ) {
    originalEnd -= 1;
    proposedEnd -= 1;
  }

  const originalSpans = spanBetween(originalText, originalTokens, start, originalEnd);
  const proposedSpans = spanBetween(proposedText, proposedTokens, start, proposedEnd);
  const insertionPosition = start < originalTokens.length ? originalTokens[start].start : originalText.length;

  return {
    originalSpans: removeWhitespaceOnlySpans(mergeSpansAcrossWhitespace(originalText, trimBoundaryWhitespace(originalSpans))),
    originalInsertionPoints:
      originalSpans.length === 0 && proposedSpans.length > 0
        ? [{ position: insertionPosition, text: proposedSpans.map((span) => span.text).join("") }]
        : [],
    proposedSpans: removeWhitespaceOnlySpansWhenMixed(mergeSpansAcrossWhitespace(proposedText, trimBoundaryWhitespace(proposedSpans)))
  };
}

function removeWhitespaceOnlySpans(spans: InlineDiffSpan[]): InlineDiffSpan[] {
  return spans.filter((span) => /\S/u.test(span.text));
}

function removeWhitespaceOnlySpansWhenMixed(spans: InlineDiffSpan[]): InlineDiffSpan[] {
  return spans.some((span) => /\S/u.test(span.text)) ? removeWhitespaceOnlySpans(spans) : spans;
}

function mergeSpansAcrossWhitespace(sourceText: string, spans: InlineDiffSpan[]): InlineDiffSpan[] {
  const merged: InlineDiffSpan[] = [];

  for (const span of spans) {
    const previous = merged[merged.length - 1];
    if (previous && /^\s*$/u.test(sourceText.slice(previous.range[1], span.range[0]))) {
      previous.range = [previous.range[0], span.range[1]];
      previous.text = sourceText.slice(previous.range[0], previous.range[1]);
      continue;
    }

    merged.push({ ...span });
  }

  return merged;
}

function trimBoundaryWhitespace(spans: InlineDiffSpan[]): InlineDiffSpan[] {
  return spans.flatMap((span) => {
    if (!/\S/u.test(span.text)) {
      return [span];
    }

    const leadingWhitespace = span.text.match(/^\s+/u)?.[0].length ?? 0;
    const trailingWhitespace = span.text.match(/\s+$/u)?.[0].length ?? 0;
    const start = span.range[0] + leadingWhitespace;
    const end = span.range[1] - trailingWhitespace;

    if (start >= end) {
      return [];
    }

    return [
      {
        range: [start, end],
        text: span.text.slice(leadingWhitespace, span.text.length - trailingWhitespace)
      }
    ];
  });
}

function spanBetween(text: string, tokens: InlineToken[], start: number, end: number): InlineDiffSpan[] {
  if (start >= end) {
    return [];
  }

  const range: TextRange = [tokens[start].start, tokens[end - 1].end];
  return [{ range, text: text.slice(range[0], range[1]) }];
}

function appendTokenRange(spans: InlineDiffSpan[], sourceText: string, tokens: InlineToken[]): void {
  if (tokens.length === 0) {
    return;
  }

  appendSpan(spans, sourceText, [tokens[0].start, tokens[tokens.length - 1].end]);
}

function appendSpan(spans: InlineDiffSpan[], sourceText: string, range: TextRange): void {
  const previous = spans[spans.length - 1];
  if (previous && previous.range[1] === range[0]) {
    previous.range = [previous.range[0], range[1]];
    previous.text = sourceText.slice(previous.range[0], previous.range[1]);
    return;
  }

  spans.push({ range, text: sourceText.slice(range[0], range[1]) });
}

function appendInsertionPoint(points: InlineInsertionPoint[], position: number, text: string): void {
  const previous = points[points.length - 1];
  if (previous && previous.position === position) {
    previous.text += text;
    return;
  }

  points.push({ position, text });
}

function diffSingleWordReplacement(
  originalToken: InlineToken,
  proposedToken: InlineToken,
  originalText: string,
  proposedText: string
): InlineDiffResult {
  const originalChars = tokenizeChars(originalToken.value);
  const proposedChars = tokenizeChars(proposedToken.value);
  const ops = diffTokens(originalChars, proposedChars);
  const originalSpans: InlineDiffSpan[] = [];
  const proposedSpans: InlineDiffSpan[] = [];

  for (const op of ops) {
    if (op.kind === "delete") {
      appendSpan(originalSpans, originalText, [originalToken.start + op.token.start, originalToken.start + op.token.end]);
    } else if (op.kind === "insert") {
      appendSpan(proposedSpans, proposedText, [proposedToken.start + op.token.start, proposedToken.start + op.token.end]);
    }
  }

  return {
    originalSpans: trimBoundaryWhitespace(originalSpans),
    originalInsertionPoints: [],
    proposedSpans: trimBoundaryWhitespace(proposedSpans)
  };
}

function isSingleWordReplacement(deletedTokens: InlineToken[], insertedTokens: InlineToken[]): boolean {
  return (
    deletedTokens.length === 1 &&
    insertedTokens.length === 1 &&
    deletedTokens[0].kind === "word" &&
    insertedTokens[0].kind === "word" &&
    shouldUseCharacterDiffForWordReplacement(deletedTokens[0].value, insertedTokens[0].value)
  );
}

function shouldUseCharacterDiffForWordReplacement(originalValue: string, proposedValue: string): boolean {
  if (originalValue === proposedValue) {
    return false;
  }

  const shorterLength = Math.min(originalValue.length, proposedValue.length);
  if (shorterLength < 3) {
    return false;
  }

  if (originalValue.startsWith(proposedValue) || proposedValue.startsWith(originalValue)) {
    return true;
  }

  if (originalValue.endsWith(proposedValue) || proposedValue.endsWith(originalValue)) {
    return true;
  }

  return commonPrefixLength(originalValue, proposedValue) >= 3 || commonSuffixLength(originalValue, proposedValue) >= 3;
}

function commonPrefixLength(left: string, right: string): number {
  let length = 0;
  while (length < left.length && length < right.length && left[length] === right[length]) {
    length += 1;
  }
  return length;
}

function commonSuffixLength(left: string, right: string): number {
  let length = 0;
  while (
    length < left.length &&
    length < right.length &&
    left[left.length - length - 1] === right[right.length - length - 1]
  ) {
    length += 1;
  }
  return length;
}

function tokensContainNonSpace(tokens: InlineToken[]): boolean {
  return tokens.some((token) => token.kind !== "space");
}

function textForTokens(sourceText: string, tokens: InlineToken[]): string {
  if (tokens.length === 0) {
    return "";
  }

  return sourceText.slice(tokens[0].start, tokens[tokens.length - 1].end);
}

function tokenizeInlineText(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let start = 0;

  while (start < text.length) {
    const rest = text.slice(start);
    const whitespace = /^\s+/u.exec(rest);
    if (whitespace) {
      tokens.push({ kind: "space", value: whitespace[0], start, end: start + whitespace[0].length });
      start += whitespace[0].length;
      continue;
    }

    const command = /^\\[A-Za-z]+/u.exec(rest);
    if (command) {
      tokens.push({ kind: "command", value: command[0], start, end: start + command[0].length });
      start += command[0].length;
      continue;
    }

    const word = /^[\p{L}\p{N}_]+/u.exec(rest);
    if (word) {
      tokens.push({ kind: "word", value: word[0], start, end: start + word[0].length });
      start += word[0].length;
      continue;
    }

    const codePoint = text.codePointAt(start);
    if (codePoint === undefined) {
      break;
    }

    const value = String.fromCodePoint(codePoint);
    tokens.push({ kind: "punct", value, start, end: start + value.length });
    start += value.length;
  }

  return tokens;
}

function tokenizeChars(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let start = 0;

  while (start < text.length) {
    const codePoint = text.codePointAt(start);
    if (codePoint === undefined) {
      break;
    }

    const value = String.fromCodePoint(codePoint);
    const end = start + value.length;
    tokens.push({ kind: "word", value, start, end });
    start = end;
  }

  return tokens;
}
