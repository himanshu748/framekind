import { Info, Play, RotateCw } from "lucide-react";
import type { BenchmarkResult, ModelBenchmark } from "../types";

interface BenchmarkPanelProps {
  result: BenchmarkResult | null;
  isRunning: boolean;
  disabled: boolean;
  progress: { stage: string; progress?: number };
  onRun: () => void;
}

function formatMs(value?: number) {
  return value === undefined ? "—" : `${Math.round(value)} ms`;
}

function ModelColumn({
  label,
  meta,
  model,
  selected,
}: {
  label: string;
  meta: string;
  model?: ModelBenchmark;
  selected?: boolean;
}) {
  return (
    <div className="model-column">
      <span className={selected ? "radio-mark is-selected" : "radio-mark"} aria-hidden="true" />
      <div className="model-identity">
        <strong>{label}</strong>
        <span>{meta}</span>
      </div>
      <div className="metric">
        <span>Inference</span>
        <strong>{formatMs(model?.medianMs)}</strong>
      </div>
      <div className="metric">
        <span>Model load</span>
        <strong>{formatMs(model?.loadMs)}</strong>
      </div>
    </div>
  );
}

export function BenchmarkPanel({ result, isRunning, disabled, progress, onRun }: BenchmarkPanelProps) {
  const speedup = result ? result.fp32.medianMs / Math.max(0.001, result.uint8.medianMs) : null;
  const status = isRunning
    ? progress.stage
    : result
      ? `${speedup?.toFixed(2)}× median speed ratio · ${Math.round(result.labelAgreement * 100)}% detection agreement`
      : "Latency results appear here after the benchmark completes.";

  return (
    <section className="benchmark-panel" id="benchmarks" aria-labelledby="benchmark-heading">
      <h2 id="benchmark-heading">On-device benchmark</h2>
      <div className="benchmark-grid">
        <ModelColumn label="Full precision" meta="FP32 · 26.2 MB" model={result?.fp32} />
        <ModelColumn label="Optimized" meta="UINT8 · 9.5 MB" model={result?.uint8} selected />
        <button className="button button-primary benchmark-button" type="button" disabled={isRunning || disabled} onClick={onRun}>
          {isRunning ? <RotateCw className="spin" aria-hidden="true" /> : <Play aria-hidden="true" />}
          {isRunning ? "Benchmarking" : "Run benchmark"}
        </button>
      </div>
      <div className="benchmark-status" role="status" aria-live="polite">
        <Info aria-hidden="true" />
        <span>{status}</span>
        {isRunning && (
          <span className="benchmark-progress" aria-hidden="true">
            <span style={{ width: `${progress.progress ?? 12}%` }} />
          </span>
        )}
      </div>
    </section>
  );
}
