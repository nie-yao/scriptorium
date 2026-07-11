export type LatexNavigationKind =
  | "part"
  | "chapter"
  | "section"
  | "subsection"
  | "subsubsection"
  | "paragraph"
  | "subparagraph"
  | "figure"
  | "table"
  | "algorithm"
  | "listing"
  | "theorem"
  | "lemma"
  | "proposition"
  | "corollary"
  | "remark"
  | "definition"
  | "assumption"
  | "label";

export interface LatexNavigationEntry {
  id: string;
  kind: LatexNavigationKind;
  title: string;
  line: number;
  level: number;
  label?: string;
}

type HeadingKind = Extract<
  LatexNavigationKind,
  "part" | "chapter" | "section" | "subsection" | "subsubsection" | "paragraph" | "subparagraph"
>;
type FloatKind = Extract<LatexNavigationKind, "figure" | "table" | "algorithm" | "listing">;
type TheoremKind = Extract<
  LatexNavigationKind,
  "theorem" | "lemma" | "proposition" | "corollary" | "remark" | "definition" | "assumption"
>;

const headingLevels: Record<HeadingKind, number> = {
  part: -1,
  chapter: 0,
  section: 1,
  subsection: 2,
  subsubsection: 3,
  paragraph: 4,
  subparagraph: 5
};
const mathEnvironmentPattern = /\\(begin|end)\s*\{(equation\*?|align\*?|gather\*?|multline\*?|math|displaymath)\}/g;
const floatBeginPattern = /\\begin\s*\{(figure|table|algorithm|listing)\}/;
const floatEndPattern = /\\end\s*\{(figure|table|algorithm|listing)\}/g;
const theoremBeginPattern = /\\begin\s*\{(theorem|lemma|proposition|corollary|remark|definition|assumption)\*?\}/;
const labelPattern = /\\label\s*\{/g;
const headingPattern = /\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?(?![A-Za-z@])/g;
const captionPattern = /\\caption\*?\s*/g;

interface PendingHeading {
  entry: LatexNavigationEntry;
}

interface ActiveFloat {
  entry: LatexNavigationEntry;
  kind: FloatKind;
  source: string;
}

interface ActiveTheorem {
  entry: LatexNavigationEntry;
  kind: TheoremKind;
}

interface ParsedArgument {
  value: string;
  end: number;
}

/** Scans editable LaTeX source for headings, floats, theorem-like environments, and explicit label anchors. */
export function scanLatexNavigation(text: string): LatexNavigationEntry[] {
  const entries: LatexNavigationEntry[] = [];
  let mathDepth = 0;
  let pendingHeading: PendingHeading | undefined;
  let activeFloat: ActiveFloat | undefined;
  let activeTheorem: ActiveTheorem | undefined;

  for (const [line, rawLine] of text.split(/\r?\n/).entries()) {
    const sourceLine = stripComment(rawLine);
    const mathTokens = [...sourceLine.matchAll(mathEnvironmentPattern)];
    if (mathDepth > 0 || mathTokens.length > 0) {
      for (const token of mathTokens) {
        mathDepth = token[1] === "begin" ? mathDepth + 1 : Math.max(0, mathDepth - 1);
      }
      continue;
    }

    const labels = findLabels(sourceLine);
    const consumedLabels = new Set<string>();

    if (pendingHeading) {
      if (containsOnlyLabels(sourceLine, labels)) {
        const label = labels[0];
        if (label) {
          pendingHeading.entry.label = label.value;
          consumedLabels.add(label.value);
        }
      }
      pendingHeading = undefined;
    }

    const heading = findHeading(sourceLine);
    if (heading) {
      const entry = createEntry(entries, heading.kind, heading.title, line, headingLevels[heading.kind]);
      entries.push(entry);
      const sameLineLabel = labels.find((label) => label.start >= heading.end);
      if (sameLineLabel) {
        entry.label = sameLineLabel.value;
        consumedLabels.add(sameLineLabel.value);
      } else {
        pendingHeading = { entry };
      }
    }

    const floatBegin = sourceLine.match(floatBeginPattern);
    if (floatBegin) {
      const kind = floatBegin[1] as FloatKind;
      const entry = createEntry(entries, kind, fallbackFloatTitle(kind), line, 0);
      entries.push(entry);
      activeFloat = { entry, kind, source: sourceLine };
    } else if (activeFloat) {
      activeFloat.source += `\n${sourceLine}`;
    }

    if (activeFloat) {
      const caption = findCaption(activeFloat.source);
      if (caption) {
        activeFloat.entry.title = caption;
      }
      const floatLabel = labels.find((label) => !consumedLabels.has(label.value));
      if (floatLabel) {
        activeFloat.entry.label = floatLabel.value;
        consumedLabels.add(floatLabel.value);
      }
    }

    const theoremBegin = findTheoremBegin(sourceLine);
    if (theoremBegin) {
      const entry = createEntry(entries, theoremBegin.kind, theoremBegin.title, line, 0);
      entries.push(entry);
      activeTheorem = { entry, kind: theoremBegin.kind };
    }

    const theoremEnd = activeTheorem ? findTheoremEnd(sourceLine, activeTheorem.kind) : undefined;
    if (activeTheorem && !activeTheorem.entry.label) {
      const theoremLabel = labels.find(
        (label) =>
          !consumedLabels.has(label.value) &&
          (!theoremBegin || label.start >= theoremBegin.end) &&
          (theoremEnd === undefined || label.start < theoremEnd)
      );
      if (theoremLabel) {
        activeTheorem.entry.label = theoremLabel.value;
        consumedLabels.add(theoremLabel.value);
      }
    }

    for (const label of labels) {
      if (!consumedLabels.has(label.value)) {
        entries.push(createEntry(entries, "label", label.value, line, 0, label.value));
      }
    }

    if (activeFloat && hasFloatEnd(sourceLine, activeFloat.kind)) {
      activeFloat = undefined;
    }
    if (activeTheorem && theoremEnd !== undefined) {
      activeTheorem = undefined;
    }
  }

  return entries;
}

function createEntry(
  entries: LatexNavigationEntry[],
  kind: LatexNavigationKind,
  title: string,
  line: number,
  level: number,
  label?: string
): LatexNavigationEntry {
  return { id: `${kind}:${line}:${entries.length}`, kind, title, line, level, label };
}

function stripComment(line: string): string {
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] !== "%") {
      continue;
    }
    let slashCount = 0;
    for (let cursor = index - 1; cursor >= 0 && line[cursor] === "\\"; cursor -= 1) {
      slashCount += 1;
    }
    if (slashCount % 2 === 0) {
      return line.slice(0, index);
    }
  }
  return line;
}

function findHeading(source: string): { kind: HeadingKind; title: string; end: number } | undefined {
  const match = headingPattern.exec(source);
  headingPattern.lastIndex = 0;
  if (!match) {
    return undefined;
  }
  let cursor = skipWhitespace(source, match.index + match[0].length);
  if (source[cursor] === "[") {
    const shortTitle = readBalanced(source, cursor, "[", "]");
    if (!shortTitle) {
      return undefined;
    }
    cursor = skipWhitespace(source, shortTitle.end);
  }
  const longTitle = readBalanced(source, cursor, "{", "}");
  if (!longTitle) {
    return undefined;
  }
  return { kind: match[1] as HeadingKind, title: displayTitle(longTitle.value), end: longTitle.end };
}

function findTheoremBegin(source: string): { kind: TheoremKind; title: string; end: number } | undefined {
  const match = source.match(theoremBeginPattern);
  if (!match) {
    return undefined;
  }
  const kind = match[1] as TheoremKind;
  const cursor = skipWhitespace(source, (match.index ?? 0) + match[0].length);
  const optionalTitle = source[cursor] === "[" ? readBalanced(source, cursor, "[", "]") : undefined;
  return {
    kind,
    title: optionalTitle ? displayTitle(optionalTitle.value) : fallbackTheoremTitle(kind),
    end: optionalTitle?.end ?? (match.index ?? 0) + match[0].length
  };
}

function findLabels(source: string): Array<{ value: string; start: number }> {
  const labels: Array<{ value: string; start: number }> = [];
  labelPattern.lastIndex = 0;
  for (const match of source.matchAll(labelPattern)) {
    const index = match.index ?? 0;
    const argument = readBalanced(source, index + match[0].length - 1, "{", "}");
    if (argument?.value.trim()) {
      labels.push({ value: argument.value.trim(), start: index });
    }
  }
  labelPattern.lastIndex = 0;
  return labels;
}

function containsOnlyLabels(source: string, labels: Array<{ value: string; start: number }>): boolean {
  return labels.length > 0 && source.replace(/\\label\s*\{(?:[^{}]|\{[^{}]*\})*\}/g, "").trim().length === 0;
}

function findCaption(source: string): string | undefined {
  captionPattern.lastIndex = 0;
  for (const match of source.matchAll(captionPattern)) {
    let cursor = skipWhitespace(source, (match.index ?? 0) + match[0].length);
    if (source[cursor] === "[") {
      const shortCaption = readBalanced(source, cursor, "[", "]");
      if (!shortCaption) {
        continue;
      }
      cursor = skipWhitespace(source, shortCaption.end);
    }
    const caption = readBalanced(source, cursor, "{", "}");
    if (caption) {
      captionPattern.lastIndex = 0;
      return displayTitle(caption.value);
    }
  }
  captionPattern.lastIndex = 0;
  return undefined;
}

function readBalanced(source: string, start: number, open: string, close: string): ParsedArgument | undefined {
  if (source[start] !== open) {
    return undefined;
  }
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (isEscaped(source, index)) {
      continue;
    }
    if (source[index] === open) {
      depth += 1;
    } else if (source[index] === close && --depth === 0) {
      return { value: source.slice(start + 1, index), end: index + 1 };
    }
  }
  return undefined;
}

function isEscaped(source: string, index: number): boolean {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function skipWhitespace(source: string, index: number): number {
  while (index < source.length && /\s/.test(source[index] ?? "")) {
    index += 1;
  }
  return index;
}

function displayTitle(value: string): string {
  return value.replace(/\\%/g, "%").replace(/\s+/g, " ").trim();
}

function fallbackFloatTitle(kind: FloatKind): string {
  return kind[0].toUpperCase() + kind.slice(1);
}

function fallbackTheoremTitle(kind: TheoremKind): string {
  return kind[0].toUpperCase() + kind.slice(1);
}

function hasFloatEnd(source: string, kind: FloatKind): boolean {
  floatEndPattern.lastIndex = 0;
  for (const match of source.matchAll(floatEndPattern)) {
    if (match[1] === kind) {
      floatEndPattern.lastIndex = 0;
      return true;
    }
  }
  floatEndPattern.lastIndex = 0;
  return false;
}

function findTheoremEnd(source: string, kind: TheoremKind): number | undefined {
  const match = new RegExp(`\\\\end\\s*\\{${kind}\\*?\\}`).exec(source);
  return match?.index;
}
