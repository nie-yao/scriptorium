import { parseBibtex, type BibtexEntry } from "./bibtex.js";

export interface BibliographySourceText {
  path: string;
  content: string;
}

export interface BibliographyOptions {
  deduplicate: boolean;
  sort: boolean;
  removeUncited: boolean;
}

export interface BibliographyFormatInput {
  bibtex: string;
  texSources: BibliographySourceText[];
  options: BibliographyOptions;
}

export type BibliographyDiagnosticCode =
  | "parse-error"
  | "unsupported-value"
  | "missing-core-field"
  | "missing-container-field"
  | "invalid-author"
  | "duplicate-citation-key"
  | "deduplicate-cited-key";

export interface BibliographyDiagnostic {
  level: "error" | "warning";
  blocking: boolean;
  code: BibliographyDiagnosticCode;
  message: string;
  entryIndex?: number;
  entryKey?: string;
}

export interface BibliographyStats {
  loadedEntries: number;
  formattedEntries: number;
  removedDuplicates: number;
  removedUncited: number;
  finalEntries: number;
  errorCount: number;
  warningCount: number;
}

export interface BibliographyFormatResult {
  ok: boolean;
  outputText: string;
  stats: BibliographyStats;
  diagnostics: BibliographyDiagnostic[];
}

interface FormattedEntry {
  key: string;
  code: string;
  titleKey: string;
  authorSortKey: string;
  yearSortKey: number;
}

class EntryFormatError extends Error {
  constructor(
    readonly code: Extract<
      BibliographyDiagnosticCode,
      "missing-core-field" | "missing-container-field" | "invalid-author"
    >,
    message: string
  ) {
    super(message);
  }
}

const properNouns = ["Kalman", "Markov", "Bayesian", "Gaussian", "DoS", "IoT", "5G", "6G"];
const organizationNames = ["IEEE", "ACM", "CAA", "MIT"];
const acronymPattern = /[A-Z]{2,}/;
const mathPattern = /\$(?:[^$]|\{[^{}]+\})+\$/;
const titleMathReplacements: ReadonlyArray<readonly [string, string]> = [
  ["H∞", "$H_\\infty$"],
  ["H1", "$H_1$"],
  ["H2", "$H_2$"],
  ["$ H\\_$\\backslash$infty $", "$H_\\infty$"],
  ["$H\\_$\\backslash$infty$", "$H_\\infty$"]
];
const lowerCaseTitleWords = new Set(["a", "an", "and", "as", "at", "but", "by", "en", "for", "if", "in", "of", "on", "or", "the", "to", "v", "via", "vs"]);
const citationPattern = /\\cite[a-zA-Z*]*\s*(?:\[[^\]]*\]\s*)*\{([^}]*)\}/g;

/** Formats a BibTeX document into a reviewable LaTeX thebibliography block. */
export function formatBibliography(input: BibliographyFormatInput): BibliographyFormatResult {
  const parsed = parseBibtex(input.bibtex);
  const diagnostics: BibliographyDiagnostic[] = parsed.diagnostics.map((diagnostic) => ({
    level: "error",
    blocking: false,
    code: diagnostic.code,
    message: diagnostic.message,
    entryIndex: diagnostic.entryIndex
  }));
  const formatted: FormattedEntry[] = [];

  for (const entry of parsed.entries) {
    try {
      formatted.push(formatEntry(entry));
    } catch (error) {
      if (error instanceof EntryFormatError) {
        diagnostics.push({
          level: "error",
          blocking: false,
          code: error.code,
          message: error.message,
          entryIndex: entry.index,
          entryKey: entry.key
        });
      } else {
        diagnostics.push({
          level: "error",
          blocking: false,
          code: "parse-error",
          message: String(error),
          entryIndex: entry.index,
          entryKey: entry.key
        });
      }
    }
  }

  const citedKeys = collectCitationKeys(input.texSources);
  let entries = formatted;
  let removedDuplicates = 0;
  let removedUncited = 0;

  if (input.options.deduplicate) {
    const seenTitles = new Set<string>();
    const uniqueEntries: FormattedEntry[] = [];
    for (const entry of entries) {
      if (!seenTitles.has(entry.titleKey)) {
        seenTitles.add(entry.titleKey);
        uniqueEntries.push(entry);
        continue;
      }
      if (citedKeys.has(entry.key)) {
        diagnostics.push({
          level: "error",
          blocking: true,
          code: "deduplicate-cited-key",
          message: `Cannot remove cited duplicate '${entry.key}' while deduplicating.`,
          entryKey: entry.key
        });
        uniqueEntries.push(entry);
        continue;
      }
      removedDuplicates += 1;
    }
    entries = uniqueEntries;
  }

  if (input.options.sort) {
    entries = [...entries].sort(
      (left, right) =>
        left.authorSortKey.localeCompare(right.authorSortKey) || left.yearSortKey - right.yearSortKey || left.key.localeCompare(right.key)
    );
  }

  if (input.options.removeUncited) {
    const before = entries.length;
    entries = entries.filter((entry) => citedKeys.has(entry.key));
    removedUncited = before - entries.length;
  }

  addDuplicateKeyDiagnostics(entries, diagnostics);

  const stats: BibliographyStats = {
    loadedEntries: parsed.entries.length,
    formattedEntries: formatted.length,
    removedDuplicates,
    removedUncited,
    finalEntries: entries.length,
    errorCount: diagnostics.filter((diagnostic) => diagnostic.level === "error").length,
    warningCount: diagnostics.filter((diagnostic) => diagnostic.level === "warning").length
  };
  const blocked = diagnostics.some((diagnostic) => diagnostic.blocking);
  const ok = !blocked && entries.length > 0;

  return {
    ok,
    outputText: ok ? renderBibliography(entries) : "",
    stats,
    diagnostics
  };
}

function formatEntry(entry: BibtexEntry): FormattedEntry {
  const author = requireField(entry, "author", "missing-core-field");
  const title = requireField(entry, "title", "missing-core-field");
  const container = formatContainer(entry);
  const authors = formatAuthors(author);
  const formattedTitle = formatTitle(title);
  const details = formatDetails(entry.fields);

  return {
    key: entry.key,
    code: `\\bibitem{${entry.key}}\n${authors}, ${formattedTitle}, \\textit{${container}}, ${details.join(", ")}.`,
    titleKey: normalizeTitle(title),
    authorSortKey: firstAuthorSortKey(author),
    yearSortKey: yearSortKey(entry.fields.year)
  };
}

function requireField(
  entry: BibtexEntry,
  field: string,
  code: Extract<BibliographyDiagnosticCode, "missing-core-field" | "missing-container-field">
): string {
  const value = entry.fields[field]?.trim();
  if (!value) {
    throw new EntryFormatError(code, `Entry '${entry.key}' is missing required '${field}' field.`);
  }
  return value;
}

function formatContainer(entry: BibtexEntry): string {
  const fields = entry.fields;
  if (entry.entryType === "article") {
    return titleCaseContainer(requireField(entry, "journal", "missing-container-field"));
  }
  if (entry.entryType === "inproceedings") {
    return titleCaseContainer(requireField(entry, "booktitle", "missing-container-field"));
  }
  if (entry.entryType === "book") {
    return titleCaseContainer(requireField(entry, "publisher", "missing-container-field"));
  }
  const candidate = fields.journal ?? fields.booktitle ?? fields.publisher ?? "";
  return candidate ? titleCaseContainer(candidate) : "";
}

function formatAuthors(value: string): string {
  const authors = value.split(" and ").map((author) => author.trim()).filter(Boolean);
  if (authors.length === 0) {
    throw new EntryFormatError("invalid-author", "Author field is empty.");
  }

  const formatted = authors.map((author) => {
    if (author === "others") {
      return "et al.";
    }
    const parts = author.split(",").map((part) => part.trim());
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new EntryFormatError("invalid-author", `Invalid author format '${author}'; expected 'Last, First'.`);
    }
    const initials = parts[1]
      .replace(/-/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .map((name) => `${name[0]?.toUpperCase() ?? ""}.`);
    if (initials.length === 0) {
      throw new EntryFormatError("invalid-author", `Invalid author format '${author}'; given name is empty.`);
    }
    return [...initials, formatSurname(parts[0])].join("~");
  });

  if (formatted.at(-1) === "et al.") {
    return formatted.join(", ");
  }
  if (formatted.length === 1) {
    return formatted[0] ?? "";
  }
  if (formatted.length === 2) {
    return `${formatted[0]} and ${formatted[1]}`;
  }
  return `${formatted.slice(0, -1).join(", ")}, and ${formatted.at(-1)}`;
}

function formatTitle(value: string): string {
  let title = value;
  for (const [badValue, replacement] of titleMathReplacements) {
    title = title.split(badValue).join(replacement);
  }
  const words = title.split(/\s+/).filter(Boolean);
  return words
    .map((word, index) => {
      if (/\{.*?\}/.test(word)) {
        return word.replace(/[{}]/g, "");
      }
      if (mathPattern.test(word)) {
        mathPattern.lastIndex = 0;
        return word;
      }
      mathPattern.lastIndex = 0;
      if (acronymPattern.test(word) || properNouns.some((noun) => word.includes(noun))) {
        acronymPattern.lastIndex = 0;
        return word;
      }
      acronymPattern.lastIndex = 0;
      const previous = words[index - 1] ?? "";
      return index === 0 || /[:?!]$/.test(previous) ? sentenceCapitalise(word) : word.toLowerCase();
    })
    .join(" ");
}

function titleCaseContainer(value: string): string {
  const wordCount = value.split(/\s+/).filter(Boolean).length;
  let wordPosition = 0;

  return value
    .split(/(\s+)/)
    .map((part) => {
      if (!part || /^\s+$/.test(part)) {
        return part;
      }
      const isFirstWord = wordPosition === 0;
      const isLastWord = wordPosition === wordCount - 1;
      wordPosition += 1;
      const normalized = part.replace(/[.,:;!?]+$/g, "");
      if (organizationNames.some((name) => normalized.toUpperCase().includes(name))) {
        return part.toUpperCase();
      }
      if (/arxiv/i.test(part)) {
        return part.replace(/arxiv/gi, "arXiv");
      }
      if (acronymPattern.test(part)) {
        acronymPattern.lastIndex = 0;
        return part;
      }
      acronymPattern.lastIndex = 0;
      if (!isFirstWord && !isLastWord && lowerCaseTitleWords.has(normalized.toLowerCase())) {
        return part.toLowerCase();
      }
      return sentenceCapitalise(part);
    })
    .join("");
}

function formatDetails(fields: Record<string, string>): string[] {
  const details: string[] = [];
  if (fields.volume) {
    details.push(`vol.~${fields.volume}`);
  }
  if (fields.number) {
    details.push(`no.~${fields.number}`);
  }
  if (fields.pages) {
    const pages = fields.pages.replace(/\s*-+\s*/g, "--");
    details.push(pages.includes("-") ? `pp.~${pages}` : `Art.~no.~${pages}`);
  }
  if (fields.year) {
    details.push(fields.year);
  }
  return details;
}

function collectCitationKeys(texSources: BibliographySourceText[]): Set<string> {
  const keys = new Set<string>();
  for (const source of texSources) {
    for (const line of source.content.split(/\r?\n/)) {
      citationPattern.lastIndex = 0;
      const uncommented = stripLatexComment(line);
      for (const match of uncommented.matchAll(citationPattern)) {
        for (const key of (match[1] ?? "").split(",")) {
          if (key.trim()) {
            keys.add(key.trim());
          }
        }
      }
      citationPattern.lastIndex = 0;
    }
  }
  return keys;
}

function stripLatexComment(line: string): string {
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

function addDuplicateKeyDiagnostics(entries: FormattedEntry[], diagnostics: BibliographyDiagnostic[]): void {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    counts.set(entry.key, (counts.get(entry.key) ?? 0) + 1);
  }
  for (const entry of entries) {
    if ((counts.get(entry.key) ?? 0) > 1) {
      diagnostics.push({
        level: "error",
        blocking: true,
        code: "duplicate-citation-key",
        message: `Citation key '${entry.key}' is used by more than one entry.`,
        entryKey: entry.key
      });
    }
  }
}

function renderBibliography(entries: FormattedEntry[]): string {
  return `\\begin{thebibliography}{99}\n\n${entries.map((entry) => entry.code).join("\n\n")}\n\n\\end{thebibliography}`;
}

function normalizeTitle(value: string): string {
  return value.replace(/\W+/g, "").toLowerCase();
}

function firstAuthorSortKey(value: string): string {
  const firstAuthor = value.split(" and ")[0]?.trim() ?? "";
  const parts = firstAuthor.split(",").map((part) => part.trim());
  return normalizeSortText(parts.length === 2 ? `${parts[0]} ${parts[1]}` : firstAuthor);
}

function normalizeSortText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function yearSortKey(value: string | undefined): number {
  const match = value?.match(/\d{4}/);
  return match ? Number(match[0]) : 9999;
}

function sentenceCapitalise(value: string): string {
  return value ? `${value[0]?.toUpperCase() ?? ""}${value.slice(1).toLowerCase()}` : value;
}

function formatSurname(value: string): string {
  return value.split("-").map((part) => sentenceCapitalise(part)).join("-");
}
