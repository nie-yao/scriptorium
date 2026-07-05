import { locateHunk, type HunkStatus, type ReviewSession } from "@scriptorium/core";
import { basicSetup } from "codemirror";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { StreamLanguage } from "@codemirror/language";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { searchKeymap } from "@codemirror/search";
import { Compartment, EditorState } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, keymap, WidgetType } from "@codemirror/view";
import { useEffect, useRef } from "react";

interface LatexEditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  reviewSession?: ReviewSession | null;
}

export function LatexEditor({ value, onChange, disabled = false, reviewSession = null }: LatexEditorProps) {
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
          reviewDecorationsRef.current.of(EditorView.decorations.of(buildHunkDecorations(valueRef.current, reviewSession))),
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
        EditorView.decorations.of(buildHunkDecorations(view.state.doc.toString(), reviewSession))
      )
    });
  }, [reviewSession]);

  return <div className="editorSurface" ref={containerRef} />;
}

class RemovedTextWidget extends WidgetType {
  constructor(
    private readonly hunkId: string,
    private readonly text: string,
    private readonly status: HunkStatus
  ) {
    super();
  }

  eq(other: RemovedTextWidget): boolean {
    return other.hunkId === this.hunkId && other.text === this.text && other.status === this.status;
  }

  toDOM(): HTMLElement {
    const element = document.createElement("pre");
    element.className = `cm-hunkRemovedWidget ${this.status}`;
    element.textContent = this.text || "(empty)";
    element.dataset.hunk = this.hunkId;
    return element;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function buildHunkDecorations(text: string, session: ReviewSession | null): DecorationSet {
  if (!session) {
    return Decoration.none;
  }

  const ranges = session.hunks.flatMap((hunk) => {
    if (hunk.status === "accepted" || hunk.status === "rejected" || hunk.status === "conflict") {
      return [];
    }

    const located = locateHunk(text, hunk);
    if (!located) {
      return [];
    }

    const decorations = [];
    if (located.range[1] > located.range[0]) {
      const className = hunk.status === "edited" ? "cm-hunkLineAdded cm-hunkLineEdited" : "cm-hunkLineAdded";
      for (const position of lineStartsInRange(text, located.range)) {
        decorations.push(Decoration.line({ class: className }).range(position));
      }
    }
    if (hunk.originalText.length > 0) {
      decorations.push(
        Decoration.widget({
          widget: new RemovedTextWidget(hunk.id, hunk.originalText, hunk.status),
          block: true,
          side: -1
        }).range(lineStart(text, located.range[0]))
      );
    }
    return decorations;
  });

  return Decoration.set(ranges, true);
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
