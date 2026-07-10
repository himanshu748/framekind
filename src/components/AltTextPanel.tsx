import { CheckCircle2, Copy, Pencil } from "lucide-react";
import { useRef } from "react";
import type { Detection } from "../types";

interface AltTextPanelProps {
  draft: string;
  detections: Detection[];
  isProcessing: boolean;
  copied: boolean;
  error: string;
  onDraft: (value: string) => void;
  onCopy: () => void;
}

export function AltTextPanel({
  draft,
  detections,
  isProcessing,
  copied,
  error,
  onDraft,
  onCopy,
}: AltTextPanelProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const visibleDetections = detections.slice(0, 5);

  return (
    <aside className="alt-panel" aria-labelledby="draft-heading">
      <h2 id="draft-heading">Alt-text draft</h2>
      <textarea
        ref={textareaRef}
        value={draft}
        disabled={isProcessing && !draft}
        aria-label="Editable alt-text draft"
        onChange={(event) => onDraft(event.target.value)}
      />
      <div className="draft-actions">
        <button className="button button-primary" type="button" disabled={!draft} onClick={onCopy}>
          <Copy aria-hidden="true" />
          Copy draft
        </button>
        <button className="button button-secondary" type="button" onClick={() => textareaRef.current?.focus()}>
          <Pencil aria-hidden="true" />
          Edit
        </button>
      </div>
      <div className="copy-status" role="status" aria-live="polite">
        {copied && <><CheckCircle2 aria-hidden="true" /> Copied to clipboard</>}
        {error && <span className="error-message">{error}</span>}
      </div>
      <div className="details-heading">
        <h3>Detected details</h3>
        <span>{visibleDetections.length ? `${visibleDetections.length} shown` : "Waiting"}</span>
      </div>
      <div className="detection-list" aria-live="polite">
        {visibleDetections.map((detection, index) => (
          <div className="detection-row" key={`${detection.label}-${index}`}>
            <span className="detection-key" aria-hidden="true" />
            <span className="detection-label">{detection.label}</span>
            <span className="confidence-track" aria-hidden="true">
              <span style={{ width: `${Math.round(detection.score * 100)}%` }} />
            </span>
            <span className="confidence-value">{detection.score.toFixed(2)}</span>
          </div>
        ))}
        {!visibleDetections.length && (
          <p className="empty-details">The local model will list confident objects here.</p>
        )}
      </div>
    </aside>
  );
}
