import type { LatexNavigationEntry } from "@scriptorium/core";
import { BookOpen, ChevronDown, ChevronRight, Image, Table2 } from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";

interface DocumentNavigationProps {
  entries: LatexNavigationEntry[];
  selectedEntryId?: string | null;
  onSelectEntry: (entry: LatexNavigationEntry) => void;
  onCollapsedChange?: (collapsed: boolean) => void;
  style?: CSSProperties;
}

export function DocumentNavigation({ entries, selectedEntryId = null, onSelectEntry, onCollapsedChange, style }: DocumentNavigationProps) {
  const [documentCollapsed, setDocumentCollapsed] = useState(false);
  const [collapsedEntryIds, setCollapsedEntryIds] = useState<Set<string>>(() => new Set());
  const visibleEntries = useMemo(() => visibleNavigationEntries(entries, collapsedEntryIds), [collapsedEntryIds, entries]);

  return (
    <section className={`documentNavigation${documentCollapsed ? " collapsed" : ""}`} aria-label="Document navigation" style={documentCollapsed ? undefined : style}>
      <button
        className="documentNavigationTitle"
        type="button"
        aria-expanded={!documentCollapsed}
        onClick={() =>
          setDocumentCollapsed((current) => {
            const next = !current;
            onCollapsedChange?.(next);
            return next;
          })
        }
      >
        {documentCollapsed ? <ChevronRight aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
        <strong>Document</strong>
      </button>
      {!documentCollapsed && <div className="navigationEntries">
        {entries.length === 0 ? (
          <p className="navigationEmpty">Open a LaTeX file to browse its sections, figures, tables, and labels.</p>
        ) : (
          visibleEntries.map((entry) => {
            const Icon = navigationIcon(entry);
            const selected = entry.id === selectedEntryId;
            const collapsible = isNavigationHeading(entry);
            const collapsed = collapsedEntryIds.has(entry.id);

            return (
              <div
                className={`navigationRow${selected ? " selected" : ""}`}
                key={entry.id}
                style={{ paddingLeft: 12 + Math.max(0, entry.level) * 24 }}
              >
                {entry.guideLevels.map((level) => (
                  <span
                    className="navigationGuide"
                    key={level}
                    style={{ left: 12 + Math.max(0, level) * 24 + 9 }}
                    aria-hidden="true"
                  />
                ))}
                {collapsible && entry.hasChildren ? (
                  <button
                    className="navigationToggle"
                    type="button"
                    aria-label={`${collapsed ? "Expand" : "Collapse"} ${entry.title}`}
                    aria-expanded={!collapsed}
                    onClick={() =>
                      setCollapsedEntryIds((current) => {
                        const next = new Set(current);
                        if (next.has(entry.id)) {
                          next.delete(entry.id);
                        } else {
                          next.add(entry.id);
                        }
                        return next;
                      })
                    }
                  >
                    {collapsed ? <ChevronRight aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
                  </button>
                ) : (
                  <span className="navigationTogglePlaceholder" aria-hidden="true" />
                )}
                <button
                  className={`navigationRowButton${Icon ? "" : " withoutIcon"}`}
                  type="button"
                  title={`Go to line ${entry.line + 1}`}
                  aria-current={selected ? "location" : undefined}
                  onClick={() => onSelectEntry(entry)}
                >
                  {Icon && <Icon className="navigationIcon" aria-hidden="true" />}
                  <span>{entry.title}</span>
                </button>
              </div>
            );
          })
        )}
      </div>}
    </section>
  );
}

interface NavigationRowEntry extends LatexNavigationEntry {
  guideLevels: number[];
  hasChildren: boolean;
}

function visibleNavigationEntries(entries: LatexNavigationEntry[], collapsedEntryIds: Set<string>): NavigationRowEntry[] {
  const ancestors: Array<{ level: number; collapsed: boolean }> = [];

  return entries.flatMap((entry, index) => {
    while (ancestors.at(-1) && entry.level <= ancestors.at(-1)!.level) {
      ancestors.pop();
    }
    const hidden = ancestors.some((ancestor) => ancestor.collapsed);
    const hasChildren = hasNavigationChildren(entries, index);
    const guideLevels = ancestors.filter((ancestor) => !ancestor.collapsed).map((ancestor) => ancestor.level);
    if (isNavigationHeading(entry) && hasChildren) {
      ancestors.push({ level: entry.level, collapsed: collapsedEntryIds.has(entry.id) });
    }
    return hidden ? [] : [{ ...entry, guideLevels, hasChildren }];
  });
}

function hasNavigationChildren(entries: LatexNavigationEntry[], index: number): boolean {
  const entry = entries[index];
  const nextEntry = entries[index + 1];
  return Boolean(entry && nextEntry && nextEntry.level > entry.level);
}

function isNavigationHeading(entry: LatexNavigationEntry): boolean {
  return ["part", "chapter", "section", "subsection", "subsubsection", "paragraph", "subparagraph"].includes(entry.kind);
}

function navigationIcon(entry: LatexNavigationEntry) {
  if (entry.kind === "figure") {
    return Image;
  }
  if (entry.kind === "table") {
    return Table2;
  }
  if (
    entry.kind === "theorem" ||
    entry.kind === "lemma" ||
    entry.kind === "proposition" ||
    entry.kind === "corollary" ||
    entry.kind === "remark" ||
    entry.kind === "definition" ||
    entry.kind === "assumption"
  ) {
    return BookOpen;
  }
  return undefined;
}
