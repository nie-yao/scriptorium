import type { LatexNavigationEntry } from "@scriptorium/core";
import { BookOpen, Braces, FileText, Image, ListTree, Table2 } from "lucide-react";

interface DocumentNavigationProps {
  entries: LatexNavigationEntry[];
  selectedEntryId?: string | null;
  onSelectEntry: (entry: LatexNavigationEntry) => void;
}

export function DocumentNavigation({ entries, selectedEntryId = null, onSelectEntry }: DocumentNavigationProps) {
  return (
    <section className="documentNavigation" aria-label="Document navigation">
      <div className="documentNavigationTitle">
        <ListTree size={15} />
        <strong>Document</strong>
      </div>
      <div className="navigationEntries">
        {entries.length === 0 ? (
          <p className="navigationEmpty">Open a LaTeX file to browse its sections, figures, tables, and labels.</p>
        ) : (
          entries.map((entry) => {
            const Icon = navigationIcon(entry);
            const selected = entry.id === selectedEntryId;

            return (
              <button
                className={`navigationRow${selected ? " selected" : ""}`}
                key={entry.id}
                type="button"
                title={`Go to line ${entry.line + 1}`}
                aria-current={selected ? "location" : undefined}
                style={{ paddingLeft: 12 + Math.max(0, entry.level) * 12 }}
                onClick={() => onSelectEntry(entry)}
              >
                <Icon size={15} />
                <span>{entry.title}</span>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}

function navigationIcon(entry: LatexNavigationEntry) {
  if (entry.kind === "figure") {
    return Image;
  }
  if (entry.kind === "table") {
    return Table2;
  }
  if (entry.kind === "label") {
    return Braces;
  }
  if (
    entry.kind === "theorem" ||
    entry.kind === "lemma" ||
    entry.kind === "proposition" ||
    entry.kind === "corollary" ||
    entry.kind === "remark"
  ) {
    return BookOpen;
  }
  return FileText;
}
