export interface BibtexEntry {
  key: string;
  entryType: string;
  fields: Record<string, string>;
  index: number;
}

export interface BibtexParseDiagnostic {
  code: "parse-error" | "unsupported-value";
  message: string;
  entryIndex?: number;
}

export interface BibtexParseResult {
  entries: BibtexEntry[];
  diagnostics: BibtexParseDiagnostic[];
}

interface EnclosedBody {
  body: string;
  end: number;
}

/** Parses the BibTeX data-entry subset used by the local reference formatter. */
export function parseBibtex(source: string): BibtexParseResult {
  const entries: BibtexEntry[] = [];
  const diagnostics: BibtexParseDiagnostic[] = [];
  let cursor = 0;
  let entryIndex = 0;

  while (cursor < source.length) {
    const at = source.indexOf("@", cursor);
    if (at === -1) {
      break;
    }

    const typeStart = skipWhitespace(source, at + 1);
    const typeEnd = readIdentifierEnd(source, typeStart);
    const entryType = source.slice(typeStart, typeEnd).toLowerCase();
    const openingIndex = skipWhitespace(source, typeEnd);
    const opening = source[openingIndex];

    if (!entryType || (opening !== "{" && opening !== "(")) {
      cursor = at + 1;
      continue;
    }

    entryIndex += 1;
    const enclosed = readEnclosedBody(source, openingIndex, opening);
    if (!enclosed) {
      diagnostics.push({
        code: "parse-error",
        message: `Unterminated @${entryType} entry`,
        entryIndex
      });
      const nextAt = source.indexOf("@", at + 1);
      cursor = nextAt === -1 ? source.length : nextAt;
      continue;
    }
    cursor = enclosed.end;

    if (entryType === "comment" || entryType === "preamble" || entryType === "string") {
      continue;
    }

    const parsed = parseDataEntry(enclosed.body, entryType, entryIndex);
    if ("diagnostic" in parsed) {
      diagnostics.push(parsed.diagnostic);
      continue;
    }
    entries.push(parsed.entry);
  }

  return { entries, diagnostics };
}

function parseDataEntry(
  body: string,
  entryType: string,
  index: number
): { entry: BibtexEntry } | { diagnostic: BibtexParseDiagnostic } {
  const segments = splitTopLevel(body, ",");
  const key = (segments.shift() ?? "").trim();
  if (!key) {
    return {
      diagnostic: { code: "parse-error", message: `@${entryType} entry has no citation key`, entryIndex: index }
    };
  }

  const fields: Record<string, string> = {};
  for (const segment of segments) {
    if (!segment.trim()) {
      continue;
    }
    const equalIndex = findTopLevel(segment, "=");
    if (equalIndex === -1) {
      return {
        diagnostic: {
          code: "parse-error",
          message: `Entry '${key}' has a field without '='`,
          entryIndex: index
        }
      };
    }

    const fieldName = segment.slice(0, equalIndex).trim().toLowerCase();
    if (!fieldName) {
      return {
        diagnostic: { code: "parse-error", message: `Entry '${key}' has an unnamed field`, entryIndex: index }
      };
    }

    const value = decodeFieldValue(segment.slice(equalIndex + 1));
    if (!value.ok) {
      return {
        diagnostic: {
          code: value.code,
          message: `Entry '${key}' field '${fieldName}': ${value.message}`,
          entryIndex: index
        }
      };
    }
    fields[fieldName] = value.value;
  }

  return { entry: { key, entryType, fields, index } };
}

function decodeFieldValue(rawValue: string):
  | { ok: true; value: string }
  | { ok: false; code: "parse-error" | "unsupported-value"; message: string } {
  const value = rawValue.trim();
  if (!value) {
    return { ok: false, code: "parse-error", message: "value is empty" };
  }
  if (findTopLevel(value, "#") !== -1) {
    return { ok: false, code: "unsupported-value", message: "string concatenation is not supported" };
  }

  if (value[0] === "{") {
    const enclosed = readDelimitedValue(value, "{", "}");
    if (!enclosed || value.slice(enclosed.end).trim()) {
      return { ok: false, code: "parse-error", message: "braced value is not closed" };
    }
    return { ok: true, value: enclosed.value };
  }

  if (value[0] === '"') {
    const enclosed = readDelimitedValue(value, '"', '"');
    if (!enclosed || value.slice(enclosed.end).trim()) {
      return { ok: false, code: "parse-error", message: "quoted value is not closed" };
    }
    return { ok: true, value: enclosed.value };
  }

  return { ok: true, value };
}

function readEnclosedBody(source: string, start: number, opening: "{" | "("): EnclosedBody | undefined {
  const closing = opening === "{" ? "}" : ")";
  let outerDepth = 1;
  let braceDepth = opening === "{" ? 1 : 0;
  let quoted = false;
  let escaped = false;

  for (let cursor = start + 1; cursor < source.length; cursor += 1) {
    const character = source[cursor];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"') {
      quoted = !quoted;
      continue;
    }
    if (quoted) {
      continue;
    }

    if (opening === "{") {
      if (character === "{") {
        braceDepth += 1;
      } else if (character === "}") {
        braceDepth -= 1;
        if (braceDepth === 0) {
          return { body: source.slice(start + 1, cursor), end: cursor + 1 };
        }
      }
      continue;
    }

    if (character === "{") {
      braceDepth += 1;
    } else if (character === "}" && braceDepth > 0) {
      braceDepth -= 1;
    } else if (braceDepth === 0 && character === "(") {
      outerDepth += 1;
    } else if (braceDepth === 0 && character === closing) {
      outerDepth -= 1;
      if (outerDepth === 0) {
        return { body: source.slice(start + 1, cursor), end: cursor + 1 };
      }
    }
  }

  return undefined;
}

function readDelimitedValue(source: string, opening: "{" | '"', closing: "}" | '"'):
  | { value: string; end: number }
  | undefined {
  let depth = opening === "{" ? 1 : 0;
  let escaped = false;

  for (let cursor = 1; cursor < source.length; cursor += 1) {
    const character = source[cursor];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (opening === "{") {
      if (character === "{") {
        depth += 1;
      } else if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          return { value: source.slice(1, cursor), end: cursor + 1 };
        }
      }
    } else if (character === closing) {
      return { value: source.slice(1, cursor), end: cursor + 1 };
    }
  }

  return undefined;
}

function splitTopLevel(source: string, delimiter: string): string[] {
  const segments: string[] = [];
  let start = 0;
  let braceDepth = 0;
  let quoteDepth = false;
  let escaped = false;

  for (let cursor = 0; cursor < source.length; cursor += 1) {
    const character = source[cursor];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"') {
      quoteDepth = !quoteDepth;
      continue;
    }
    if (quoteDepth) {
      continue;
    }
    if (character === "{") {
      braceDepth += 1;
    } else if (character === "}" && braceDepth > 0) {
      braceDepth -= 1;
    } else if (braceDepth === 0 && character === delimiter) {
      segments.push(source.slice(start, cursor));
      start = cursor + 1;
    }
  }
  segments.push(source.slice(start));
  return segments;
}

function findTopLevel(source: string, target: string): number {
  let braceDepth = 0;
  let quoted = false;
  let escaped = false;

  for (let cursor = 0; cursor < source.length; cursor += 1) {
    const character = source[cursor];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"') {
      quoted = !quoted;
      continue;
    }
    if (quoted) {
      continue;
    }
    if (character === "{") {
      braceDepth += 1;
    } else if (character === "}" && braceDepth > 0) {
      braceDepth -= 1;
    } else if (braceDepth === 0 && character === target) {
      return cursor;
    }
  }
  return -1;
}

function skipWhitespace(source: string, start: number): number {
  let cursor = start;
  while (cursor < source.length && /\s/.test(source[cursor] ?? "")) {
    cursor += 1;
  }
  return cursor;
}

function readIdentifierEnd(source: string, start: number): number {
  let cursor = start;
  while (cursor < source.length && /[A-Za-z]/.test(source[cursor] ?? "")) {
    cursor += 1;
  }
  return cursor;
}
