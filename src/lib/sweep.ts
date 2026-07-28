import { NATIVE_SHORTEST_EDGE, describeConfig } from "./device";
import type { DeviceCapabilities, RunConfig, SweepEntry } from "../types";

export const AGREEMENT_FLOOR = 0.8;

export const REFERENCE_ID = "wasm-fp32-512";

type PlannedConfig = RunConfig & { id: string; label: string; isReference: boolean };

function configId(config: RunConfig) {
  return `${config.device}-${config.dtype}-${config.shortestEdge}`;
}

function plan(config: RunConfig, isReference = false): PlannedConfig {
  return { ...config, id: configId(config), label: describeConfig(config), isReference };
}

export function sweepPlan(capabilities: DeviceCapabilities): PlannedConfig[] {
  const configs: PlannedConfig[] = [
    plan({ device: "wasm", dtype: "fp32", shortestEdge: NATIVE_SHORTEST_EDGE }, true),
    plan({ device: "wasm", dtype: "uint8", shortestEdge: NATIVE_SHORTEST_EDGE }),
    plan({ device: "wasm", dtype: "uint8", shortestEdge: 384 }),
    plan({ device: "wasm", dtype: "uint8", shortestEdge: 256 }),
  ];

  if (capabilities.webgpu) {
    configs.push(plan({ device: "webgpu", dtype: "fp32", shortestEdge: NATIVE_SHORTEST_EDGE }));
    if (capabilities.shaderF16) {
      configs.push(plan({ device: "webgpu", dtype: "fp16", shortestEdge: NATIVE_SHORTEST_EDGE }));
    }
    configs.push(plan({ device: "webgpu", dtype: "uint8", shortestEdge: NATIVE_SHORTEST_EDGE }));
  }

  return configs;
}

export function completedEntries(entries: SweepEntry[]) {
  return entries.filter((entry) => !entry.error && entry.medianMs !== undefined);
}

export function bestEntry(entries: SweepEntry[], floor = AGREEMENT_FLOOR) {
  const eligible = completedEntries(entries).filter(
    (entry) => !entry.isReference && (entry.agreement ?? 0) >= floor,
  );
  if (eligible.length === 0) return undefined;
  return eligible.reduce((best, entry) =>
    (entry.medianMs ?? Infinity) < (best.medianMs ?? Infinity) ? entry : best,
  );
}

export function speedupVersus(reference: SweepEntry | undefined, entry: SweepEntry | undefined) {
  if (!reference?.medianMs || !entry?.medianMs) return undefined;
  return reference.medianMs / entry.medianMs;
}
