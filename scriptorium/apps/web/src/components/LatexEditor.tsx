import {
  diffInlineChanges,
  locateHunk,
  type HunkStatus,
  type InlineDiffSpan,
  type ReviewSession
} from "@scriptorium/core";
import { basicSetup } from "codemirror";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { StreamLanguage } from "@codemirror/language";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { searchKeymap } from "@codemirror/search";
import { Compartment, EditorState } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, keymap, WidgetType } from "@codemirror/view";
import { useEffect, useRef } from "react";

export type ReviewMarkMode = "short" | "marks";

export interface HunkFocusRequest {
  hunkId: string;
  requestId: number;
}

interface LatexEditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  reviewSession?: ReviewSession | null;
  reviewMarkMode?: ReviewMarkMode;
  onReviewMarkModeChange?: (mode: ReviewMarkMode) => void;
  focusHunkRequest?: HunkFocusRequest | null;
}

export function LatexEditor({
  value,
  onChange,
  disabled = false,
  reviewSession = null,
  reviewMarkMode = "marks",
  onReviewMarkModeChange,
  focusHunkRequest = null
}: LatexEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const reviewDecorationsRef = useRef(new Compartment());
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);

  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const view = new EditorView({
      parent: containerRef.current,
      state: EditorState.create({
        doc: valueRef.current,
        extensions: [
          basicSetup,
          history(),
          StreamLanguage.define(stex),
          keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap, ...searchKeymap]),
          EditorView.lineWrapping,
          EditorView.editable.of(!disabled),
          reviewDecorationsRef.current.of(
            EditorView.decorations.of(buildHunkDecorations(valueRef.current, reviewSession, reviewMarkMode))
          ),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              const nextValue = update.state.doc.toString();
              valueRef.current = nextValue;
              onChangeRef.current(nextValue);
            }
          })
        ]
      })
    });

    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || value === valueRef.current) {
      return;
    }

    valueRef.current = value;
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: value
      }
    });
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    view.dispatch({
      effects: reviewDecorationsRef.current.reconfigure(
        EditorView.decorations.of(buildHunkDecorations(view.state.doc.toString(), reviewSession, reviewMarkMode))
      )
    });
  }, [reviewMarkMode, reviewSession]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !reviewSession || !focusHunkRequest) {
      return;
    }

    focusHunkInEditor(view, reviewSession, focusHunkRequest.hunkId);
  }, [focusHunkRequest, reviewSession]);

  return (
    <div className="editorShell">
      <div className="editorActionBar">
        <select
          className="markModeSelect"
          value={reviewMarkMode}
          onChange={(event) => onReviewMarkModeChange?.(event.target.value as ReviewMarkMode)}
          aria-label="Review mark style"
          title="Choose inline change marker style"
        >
          <option value="short">Short lines</option>
          <option value="marks">Strike / Wave</option>
        </select>
      </div>
      <div className="editorSurface" ref={containerRef} />
    </div>
  );
}

class RemovedTextWidget extends WidgetType {
  constructor(
    private readonly hunkId: string,
    private readonly text: string,
    private readonly status: HunkStatus,
    private readonly changedSpans: InlineDiffSpan[],
    private readonly reviewMarkMode: ReviewMarkMode
  ) {
    super();
  }

  eq(other: RemovedTextWidget): boolean {
    return (
      other.hunkId === this.hunkId &&
      other.text === this.text &&
      other.status === this.status &&
      serializeSpans(other.changedSpans) === serializeSpans(this.changedSpans) &&
      other.reviewMarkMode === this.reviewMarkMode
    );
  }

  toDOM(): HTMLElement {
    const element = document.createElement("pre");
    element.className = `cm-hunkRemovedWidget ${this.status}`;
    element.dataset.hunk = this.hunkId;
    if (this.text) {
      appendHighlightedText(element, this.text, this.changedSpans, this.reviewMarkMode);
    } else {
      element.textContent = "(empty)";
    }
    return element;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function buildHunkDecorations(
  text: string,
  session: ReviewSession | null,
  reviewMarkMode: ReviewMarkMode
): DecorationSet {
  if (!session) {
    return Decoration.none;
  }

  const ranges = session.hunks.flatMap((hunk) => {
    if (hunk.undo || hunk.status === "accepted" || hunk.status === "rejected" || hunk.status === "conflict") {
      return [];
    }

    const located = locateHunk(text, hunk);
    if (!located) {
      return [];
    }

    const decorations = [];
    const inlineDiff = diffInlineChanges(hunk.originalText, located.currentText);
    if (located.range[1] > located.range[0]) {
      for (const position of lineStartsInRange(text, located.range)) {
        decorations.push(Decoration.line({ class: "cm-hunkLineAdded" }).range(position));
      }
      for (const span of inlineDiff.proposedSpans) {
        const from = located.range[0] + span.range[0];
        const to = located.range[0] + span.range[1];
        if (from < to && to <= located.range[1]) {
          decorations.push(Decoration.mark({ class: inlineAddedClass(reviewMarkMode) }).range(from, to));
        }
      }
    }
    if (hunk.originalText.length > 0) {
      decorations.push(
        Decoration.widget({
          widget: new RemovedTextWidget(
            hunk.id,
            hunk.originalText,
            hunk.status,
            inlineDiff.originalSpans,
            reviewMarkMode
          ),
          block: true,
          side: -1
        }).range(lineStart(text, located.range[0]))
      );
    }
    return decorations;
  });

  return Decoration.set(ranges, true);
}

function appendHighlightedText(
  element: HTMLElement,
  text: string,
  changedSpans: InlineDiffSpan[],
  reviewMarkMode: ReviewMarkMode
): void {
  let position = 0;
  const spans = [...changedSpans].sort((left, right) => left.range[0] - right.range[0]);

  for (const span of spans) {
    const start = Math.max(position, Math.min(text.length, span.range[0]));
    const end = Math.max(start, Math.min(text.length, span.range[1]));
    if (start > position) {
      element.append(document.createTextNode(text.slice(position, start)));
    }

    if (end > start) {
      const changed = document.createElement("span");
      changed.className = inlineRemovedClass(reviewMarkMode);
      changed.textContent = text.slice(start, end);
      element.append(changed);
    }
    position = end;
  }

  if (position < text.length) {
    element.append(document.createTextNode(text.slice(position)));
  }
}

function serializeSpans(spans: InlineDiffSpan[]): string {
  return spans.map((span) => `${span.range[0]}:${span.range[1]}`).join(",");
}

function inlineAddedClass(reviewMarkMode: ReviewMarkMode): string {
  return reviewMarkMode === "marks" ? "cm-hunkInlineChangedAddedWavy" : "cm-hunkInlineChangedAddedShort";
}

function inlineRemovedClass(reviewMarkMode: ReviewMarkMode): string {
  return reviewMarkMode === "marks" ? "cm-hunkInlineChangedRemovedStrike" : "cm-hunkInlineChangedRemovedShort";
}

function focusHunkInEditor(view: EditorView, session: ReviewSession, hunkId: string): void {
  const hunk = session.hunks.find((item) => item.id === hunkId);
  if (!hunk) {
    return;
  }

  const text = view.state.doc.toString();
  const located = locateHunk(text, hunk);
  if (!located) {
    return;
  }

  const position = Math.max(0, Math.min(view.state.doc.length, lineStart(text, located.range[0])));
  view.dispatch({
    selection: { anchor: position },
    effects: EditorView.scrollIntoView(position, { y: "center", x: "nearest" })
  });
  view.focus();
}

function lineStart(text: string, position: number): number {
  const index = text.lastIndexOf("\n", Math.max(0, position - 1));
  return index === -1 ? 0 : index + 1;
}

function lineStartsInRange(text: string, range: [number, number]): number[] {
  const [start, end] = range;
  const starts = [lineStart(text, start)];
  let position = text.indexOf("\n", start);
  while (position !== -1 && position + 1 < end) {
    starts.push(position + 1);
    position = text.indexOf("\n", position + 1);
  }
  return [...new Set(starts)];
}
