import {
  acceptHunk,
  keepEditedHunk,
  rejectHunk,
  summarizeReview,
  useAiVersion,
  type ReviewSession
} from "@scriptorium/core";
import { Check, RotateCcw, Sparkles, Wand2 } from "lucide-react";

interface ReviewPanelProps {
  session: ReviewSession | null;
  onSessionChange: (session: ReviewSession) => void;
}

export function ReviewPanel({ session, onSessionChange }: ReviewPanelProps) {
  if (!session) {
    return <div className="emptyState">Create a review session to inspect AI changes.</div>;
  }

  const summary = summarizeReview(session);

  return (
    <div className="reviewPanel">
      <div className="reviewSummary">
        <StatusPill label="Pending" value={summary.pending} />
        <StatusPill label="Accepted" value={summary.accepted} />
        <StatusPill label="Edited" value={summary.edited} />
        <StatusPill label="Conflict" value={summary.conflict} tone="danger" />
      </div>
      <div className="hunkList">
        {session.hunks.length === 0 ? (
          <div className="emptyState">No changes between original and proposed text.</div>
        ) : (
          session.hunks.map((hunk) => (
            <article className={`hunkCard ${hunk.status}`} key={hunk.id}>
              <header>
                <div>
                  <strong>{hunk.id}</strong>
                  <span>{hunk.status}</span>
                </div>
              </header>
              <div className="diffBlock">
                <pre className="removed">{hunk.originalText || "(empty)"}</pre>
                <pre className="added">{hunk.proposedText || "(empty)"}</pre>
              </div>
              <div className="hunkActions">
                <button type="button" onClick={() => onSessionChange(acceptHunk(session, hunk.id))}>
                  <Check size={14} />
                  Accept
                </button>
                <button type="button" onClick={() => onSessionChange(rejectHunk(session, hunk.id))}>
                  <RotateCcw size={14} />
                  Reject
                </button>
                <button type="button" onClick={() => onSessionChange(keepEditedHunk(session, hunk.id))}>
                  <Wand2 size={14} />
                  Keep Edit
                </button>
                <button type="button" onClick={() => onSessionChange(useAiVersion(session, hunk.id))}>
                  <Sparkles size={14} />
                  Use AI
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}

function StatusPill({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "danger" }) {
  return (
    <div className={`statusPill ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
