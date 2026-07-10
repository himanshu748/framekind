import { useLayoutEffect, useRef, useState } from "react";
import type { Detection } from "../types";

interface NaturalSize {
  width: number;
  height: number;
}

interface ImageWorkbenchProps {
  src: string;
  alt: string;
  detections: Detection[];
  naturalSize: NaturalSize;
  showBoxes: boolean;
  isProcessing: boolean;
  progress: { stage: string; progress?: number };
  imageKey: number;
  onImageLoad: (width: number, height: number) => void;
  onImageError: () => void;
  onToggleBoxes: () => void;
}

export function ImageWorkbench({
  src,
  alt,
  detections,
  naturalSize,
  showBoxes,
  isProcessing,
  progress,
  imageKey,
  onImageLoad,
  onImageError,
  onToggleBoxes,
}: ImageWorkbenchProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => {
      setStageSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const scale = naturalSize.width && naturalSize.height
    ? Math.max(stageSize.width / naturalSize.width, stageSize.height / naturalSize.height)
    : 1;
  const renderedWidth = naturalSize.width * scale;
  const renderedHeight = naturalSize.height * scale;
  const offsetX = (stageSize.width - renderedWidth) / 2;
  const offsetY = (stageSize.height - renderedHeight) / 2;

  return (
    <section className="image-workbench" aria-label="Image analysis canvas">
      <div className="canvas-toolbar">
        <button
          className={showBoxes ? "switch is-on" : "switch"}
          type="button"
          role="switch"
          aria-checked={showBoxes}
          onClick={onToggleBoxes}
        >
          <span>Show boxes</span>
          <span className="switch-track" aria-hidden="true"><span /></span>
        </button>
      </div>
      <div className="image-stage" ref={stageRef}>
        <img
          key={imageKey}
          src={src}
          alt={alt}
          onLoad={(event) => onImageLoad(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)}
          onError={onImageError}
        />
        {showBoxes && detections.map((detection, index) => {
          const rawLeft = detection.box.xmin * scale + offsetX;
          const rawTop = detection.box.ymin * scale + offsetY;
          const rawRight = detection.box.xmax * scale + offsetX;
          const rawBottom = detection.box.ymax * scale + offsetY;
          if (rawRight < 0 || rawBottom < 0 || rawLeft > stageSize.width || rawTop > stageSize.height) {
            return null;
          }
          const left = Math.max(0, rawLeft);
          const top = Math.max(0, rawTop);
          const width = Math.max(1, Math.min(stageSize.width, rawRight) - left);
          const height = Math.max(1, Math.min(stageSize.height, rawBottom) - top);
          const labelInside = rawTop < 28;
          return (
            <span
              className={labelInside ? "detection-box label-inside" : "detection-box"}
              key={`${detection.label}-${index}`}
              style={{ left, top, width, height }}
              aria-hidden="true"
            >
              <span>{detection.label}</span>
            </span>
          );
        })}
        {isProcessing && (
          <div className="processing-status" role="status" aria-live="polite">
            <span>{progress.stage}</span>
            <span className="progress-track" aria-hidden="true">
              <span style={{ width: `${progress.progress ?? 14}%` }} />
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
