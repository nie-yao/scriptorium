import {
  acceptHunk,
  keepEditedHunk,
  locateHunk,
  rejectHunk,
  summarizeReview,
  undoHunkAction,
  useAiVersion,
  type ReviewHunk,
  type ReviewSession
} from "@scriptorium/core";
import { Check, RotateCcw, Sparkles, Undo2, Wand2 } from "lucide-react";

interface ReviewPanelProps {
  session: ReviewSession | null;
  selectedHunkId?: string | null;
  onSessionChange: (session: ReviewSession) => void;
  onSelectHunk?: (hunkId: string) => void;
}

export function ReviewPanel({ session, selectedHunkId = null, onSessionChange, onSelectHunk }: ReviewPanelProps) {
  if (!session) {
    return <div className="emptyState">Create a review session to inspect AI changes.</div>;
  }

  const summary = summarizeReview(session);

  return (
    <div className="reviewPanel">
      <div className="reviewSummary">
        <StatusPill label="Pending" value={summary.pending} tone="pending" />
        <StatusPill label="Accepted" value={summary.accepted} tone="accepted" />
        <StatusPill label="Rejected" value={summary.rejected} tone="rejected" />
        <StatusPill label="Edited" value={summary.edited} tone="edited" />
        <StatusPill label="Conflict" value={summary.conflict} tone="conflict" />
      </div>
      <div className="hunkList">
        {session.hunks.length === 0 ? (
          <div className="emptyState">No changes between original and proposed text.</div>
        ) : (
          session.hunks.map((hunk) => {
            const { currentText, isEdited } = currentHunkState(session, hunk);

            return (
              <article
                className={`hunkCard ${hunk.status}${selectedHunkId === hunk.id ? " selected" : ""}`}
                key={hunk.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectHunk?.(hunk.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectHunk?.(hunk.id);
                  }
                }}
              >
                <header>
                  <div>
                    <strong>{formatHunkTitle(hunk.id)}</strong>
                    <span className={`statusBadge ${hunk.status}`}>{hunk.status}</span>
                  </div>
                </header>
                <div className="diffBlock">
                  <pre className="removed">{hunk.originalText || "(empty)"}</pre>
                  <pre className="added">{currentText || "(empty)"}</pre>
                </div>
                {renderHunkActions(session, hunk, isEdited, onSessionChange)}
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}

function currentHunkState(session: ReviewSession, hunk: ReviewHunk): { currentText: string; isEdited: boolean } {
  const located = locateHunk(session.workingText, hunk);
  if (!located) {
    return { currentText: hunk.proposedText, isEdited: false };
  }
  return {
    currentText: located.currentText,
    isEdited: located.currentText !== hunk.proposedText
  };
}

function renderHunkActions(
  session: ReviewSession,
  hunk: ReviewHunk,
  isEdited: boolean,
  onSessionChange: (session: ReviewSession) => void
) {
  if (hunk.undo) {
    return (
      <div className="hunkActions" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
        <button type="button" onClick={() => onSessionChange(undoHunkAction(session, hunk.id))}>
          <Undo2 size={14} />
          Undo
        </button>
      </div>
    );
  }

  if (hunk.status === "accepted" || hunk.status === "rejected" || hunk.status === "conflict") {
    return null;
  }

  if (!isEdited) {
    return (
      <div className="hunkActions" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
        <button type="button" onClick={() => onSessionChange(acceptHunk(session, hunk.id))}>
          <Check size={14} />
          Accept
        </button>
        <button type="button" onClick={() => onSessionChange(rejectHunk(session, hunk.id))}>
          <RotateCcw size={14} />
          Reject
        </button>
      </div>
    );
  }

  return (
    <div className="hunkActions" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <button type="button" onClick={() => onSessionChange(keepEditedHunk(session, hunk.id))}>
        <Wand2 size={14} />
        Keep Edit
      </button>
      <button type="button" onClick={() => onSessionChange(useAiVersion(session, hunk.id))}>
        <Sparkles size={14} />
        Use AI
      </button>
      <button type="button" onClick={() => onSessionChange(rejectHunk(session, hunk.id))}>
        <RotateCcw size={14} />
        Reject
      </button>
    </div>
  );
}

function formatHunkTitle(id: string): string {
  const match = /^hunk-(\d+)$/i.exec(id);
  return match ? `Hunk ${match[1]}` : id;
}

function StatusPill({
  label,
  value,
  tone
}: {
  label: string;
  value: number;
  tone: "pending" | "accepted" | "rejected" | "edited" | "conflict";
}) {
  return (
    <div className={`statusPill ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
