import type { DeviceCapabilities, RunConfig } from "../types";

export const NATIVE_SHORTEST_EDGE = 512;

export function wasmThreadsFor(hardwareConcurrency: number, isolated: boolean) {
  if (!isolated) return 1;
  return Math.min(4, Math.max(2, Math.floor(hardwareConcurrency / 2)));
}

export async function detectCapabilities(): Promise<DeviceCapabilities> {
  const hardwareConcurrency = Math.max(1, navigator.hardwareConcurrency || 1);
  const capabilities: DeviceCapabilities = {
    webgpu: false,
    shaderF16: false,
    crossOriginIsolated,
    hardwareConcurrency,
    wasmThreads: wasmThreadsFor(hardwareConcurrency, crossOriginIsolated),
  };

  if (typeof navigator.gpu === "undefined") return capabilities;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return capabilities;
    capabilities.webgpu = true;
    capabilities.shaderF16 = adapter.features.has("shader-f16");
    capabilities.adapter = adapter.info?.description || adapter.info?.vendor || undefined;
  } catch {
    return capabilities;
  }
  return capabilities;
}

/**
 * Measured on Arm64: the backend is the lever, not the precision. WebGPU FP32
 * reproduces the reference detections exactly while beating threaded WASM, and
 * every reduced-precision variant loses agreement, so the default trades no
 * quality. Quantization stays the WASM fallback, where it is the only lever left.
 */
export function preferredConfig(capabilities: DeviceCapabilities): RunConfig {
  if (capabilities.webgpu) {
    return { device: "webgpu", dtype: "fp32", shortestEdge: NATIVE_SHORTEST_EDGE };
  }
  return { device: "wasm", dtype: "uint8", shortestEdge: NATIVE_SHORTEST_EDGE };
}

export function describeConfig(config: RunConfig) {
  const backend = config.device === "webgpu" ? "WebGPU" : "WASM";
  const edge = config.shortestEdge === NATIVE_SHORTEST_EDGE ? "" : ` @${config.shortestEdge}px`;
  return `${backend} · ${config.dtype.toUpperCase()}${edge}`;
}
