import { describe, expect, it } from "vitest";
import { describeConfig, preferredConfig, wasmThreadsFor } from "./device";
import type { DeviceCapabilities } from "../types";

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

describe("wasmThreadsFor", () => {
  it("falls back to one thread without cross-origin isolation", () => {
    expect(wasmThreadsFor(10, false)).toBe(1);
  });

  it("caps at four threads when isolated", () => {
    expect(wasmThreadsFor(16, true)).toBe(4);
    expect(wasmThreadsFor(2, true)).toBe(2);
  });
});

describe("preferredConfig", () => {
  it("keeps full precision on WebGPU so the default trades no detection quality", () => {
    expect(preferredConfig(capabilities({ webgpu: true, shaderF16: true }))).toEqual({
      device: "webgpu",
      dtype: "fp32",
      shortestEdge: 512,
    });
    expect(preferredConfig(capabilities({ webgpu: true }))).toEqual({
      device: "webgpu",
      dtype: "fp32",
      shortestEdge: 512,
    });
  });

  it("falls back to quantized WASM when WebGPU is unavailable", () => {
    expect(preferredConfig(capabilities())).toEqual({
      device: "wasm",
      dtype: "uint8",
      shortestEdge: 512,
    });
  });
});

describe("describeConfig", () => {
  it("omits the resolution when it is the model default", () => {
    expect(describeConfig({ device: "webgpu", dtype: "fp16", shortestEdge: 512 })).toBe("WebGPU · FP16");
  });

  it("names a reduced input resolution", () => {
    expect(describeConfig({ device: "wasm", dtype: "uint8", shortestEdge: 256 })).toBe("WASM · UINT8 @256px");
  });
});
