import { describe, expect, it } from "vitest";
import { bestEntry, speedupVersus, sweepPlan } from "./sweep";
import type { DeviceCapabilities, SweepEntry } from "../types";

function capabilities(overrides: Partial<DeviceCapabilities> = {}): DeviceCapabilities {
  return {
    webgpu: false,
    shaderF16: false,
    crossOriginIsolated: true,
    hardwareConcurrency: 10,
    wasmThreads: 4,
    ...overrides,
  };
}

function entry(overrides: Partial<SweepEntry> & { id: string }): SweepEntry {
  return {
    label: overrides.id,
    device: "wasm",
    dtype: "uint8",
    shortestEdge: 512,
    isReference: false,
    ...overrides,
  };
}

describe("sweepPlan", () => {
  it("keeps the full-precision WASM run as the only reference", () => {
    const plan = sweepPlan(capabilities());
    expect(plan.filter((config) => config.isReference)).toHaveLength(1);
    expect(plan[0].id).toBe("wasm-fp32-512");
  });

  it("omits WebGPU rows when the device has no adapter", () => {
    expect(sweepPlan(capabilities()).some((config) => config.device === "webgpu")).toBe(false);
  });

  it("adds fp16 only when the adapter reports shader-f16", () => {
    const withoutF16 = sweepPlan(capabilities({ webgpu: true }));
    expect(withoutF16.some((config) => config.dtype === "fp16")).toBe(false);

    const withF16 = sweepPlan(capabilities({ webgpu: true, shaderF16: true }));
    expect(withF16.some((config) => config.device === "webgpu" && config.dtype === "fp16")).toBe(true);
  });
});

describe("bestEntry", () => {
  it("ignores configurations below the agreement floor", () => {
    const winner = bestEntry([
      entry({ id: "reference", isReference: true, medianMs: 3000, agreement: 1 }),
      entry({ id: "fast-but-wrong", medianMs: 100, agreement: 0.4 }),
      entry({ id: "honest", medianMs: 700, agreement: 0.9 }),
    ]);
    expect(winner?.id).toBe("honest");
  });

  it("never returns the reference row", () => {
    const winner = bestEntry([entry({ id: "reference", isReference: true, medianMs: 10, agreement: 1 })]);
    expect(winner).toBeUndefined();
  });

  it("skips configurations that failed to run", () => {
    const winner = bestEntry([
      entry({ id: "broken", medianMs: 50, agreement: 1, error: "no adapter" }),
      entry({ id: "works", medianMs: 900, agreement: 0.95 }),
    ]);
    expect(winner?.id).toBe("works");
  });
});

describe("speedupVersus", () => {
  it("expresses the winner as a ratio of the reference", () => {
    const reference = entry({ id: "reference", isReference: true, medianMs: 2966 });
    const winner = entry({ id: "winner", medianMs: 701 });
    expect(speedupVersus(reference, winner)).toBeCloseTo(4.23, 2);
  });

  it("returns undefined when either side is missing a median", () => {
    expect(speedupVersus(entry({ id: "a" }), entry({ id: "b", medianMs: 10 }))).toBeUndefined();
  });
});
