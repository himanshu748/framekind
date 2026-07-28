import { Download, Info, Play, RotateCw } from "lucide-react";
import { AGREEMENT_FLOOR, bestEntry, speedupVersus } from "../lib/sweep";
import { formatBytes } from "../lib/weights";
import type { SweepEntry, SweepResult } from "../types";

interface BenchmarkPanelProps {
  result: SweepResult | null;
  isRunning: boolean;
  disabled: boolean;
  progress: { stage: string; progress?: number };
  onRun: () => void;
}

function formatMs(value?: number) {
  return value === undefined ? "n/a" : `${Math.round(value)} ms`;
}

function formatAgreement(entry: SweepEntry) {
  if (entry.error || entry.agreement === undefined) return "n/a";
  if (entry.isReference) return "reference";
  return `${Math.round(entry.agreement * 100)}%`;
}

function rowClass(entry: SweepEntry, bestId?: string) {
  if (entry.error) return "sweep-row is-failed";
  if (entry.isReference) return "sweep-row is-reference";
  if (entry.id === bestId) return "sweep-row is-best";
  return "sweep-row";
}

function exportSweep(result: SweepResult) {
  const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `framekind-sweep-${result.completedAt.replace(/[:.]/g, "-")}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function BenchmarkPanel({ result, isRunning, disabled, progress, onRun }: BenchmarkPanelProps) {
  const reference = result?.entries.find((entry) => entry.id === result.referenceId);
  const winner = result ? bestEntry(result.entries) : undefined;
  const speedup = speedupVersus(reference, winner);

  const status = isRunning
    ? progress.stage
    : result && winner
      ? `Fastest configuration holding at least ${Math.round(AGREEMENT_FLOOR * 100)}% agreement: ${winner.label}, ${speedup?.toFixed(2)}× the FP32 WASM reference on best-round times.`
      : result
        ? "No configuration met the agreement floor on this device."
        : "Run the sweep to measure every backend and precision this device supports.";

  return (
    <section className="benchmark-panel" id="benchmarks" aria-labelledby="benchmark-heading">
      <div className="benchmark-head">
        <div>
          <h2 id="benchmark-heading">Optimization sweep</h2>
          <p>
            Every configuration runs the same image, threshold, warm-up and run count, and is scored
            against the full-precision WASM reference so speed is never reported without a quality
            guardrail. Rounds are interleaved across configurations, so background load and thermal
            drift hit every row rather than whichever one held the slow window, and ranking uses each
            configuration's best round because noise only ever adds time. A wide gap between best and
            p95 means the machine was busy, not that the configuration is erratic. Agreement is
            measured on the image currently loaded, over a handful of boxes, so treat it as a pass or
            fail signal rather than a precise ranking.
          </p>
        </div>
        <div className="benchmark-actions">
          <button
            className="button button-primary"
            type="button"
            disabled={isRunning || disabled}
            onClick={onRun}
          >
            {isRunning ? <RotateCw className="spin" aria-hidden="true" /> : <Play aria-hidden="true" />}
            {isRunning ? "Sweeping" : "Run sweep"}
          </button>
          {result && (
            <button className="button" type="button" onClick={() => exportSweep(result)}>
              <Download aria-hidden="true" />
              Export JSON
            </button>
          )}
        </div>
      </div>

      {result && (
        <div className="sweep-table-scroll">
          <table className="sweep-table">
            <caption className="visually-hidden">
              Median inference latency and detection agreement per configuration
            </caption>
            <thead>
              <tr>
                <th scope="col">Configuration</th>
                <th scope="col">Weights</th>
                <th scope="col">Best</th>
                <th scope="col">Median</th>
                <th scope="col">p95</th>
                <th scope="col">Agreement</th>
              </tr>
            </thead>
            <tbody>
              {result.entries.map((entry) => (
                <tr key={entry.id} className={rowClass(entry, winner?.id)}>
                  <th scope="row">
                    {entry.label}
                    {entry.isReference && <span className="sweep-tag">reference</span>}
                    {entry.id === winner?.id && <span className="sweep-tag is-best">fastest</span>}
                  </th>
                  <td>{entry.error ? "n/a" : formatBytes(entry.weightBytes)}</td>
                  <td>{entry.error ? <span className="sweep-error">{entry.error}</span> : formatMs(entry.minMs)}</td>
                  <td>{entry.error ? "n/a" : formatMs(entry.medianMs)}</td>
                  <td>{entry.error ? "n/a" : formatMs(entry.p95Ms)}</td>
                  <td>{formatAgreement(entry)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
