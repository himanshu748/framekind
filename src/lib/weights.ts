import type { ModelDType } from "../types";

const DTYPE_SUFFIX: Record<ModelDType, string> = {
  fp32: "",
  fp16: "_fp16",
  uint8: "_uint8",
  q4: "_q4",
};

export function weightFileName(dtype: ModelDType) {
  return `model${DTYPE_SUFFIX[dtype]}.onnx`;
}

function bytesFromResourceTiming(fileName: string) {
  if (typeof performance.getEntriesByType !== "function") return undefined;
  const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
  const match = entries.find((entry) => entry.name.endsWith(fileName));
  if (!match) return undefined;
  const size = match.encodedBodySize || match.transferSize || match.decodedBodySize;
  return size > 0 ? size : undefined;
}

async function bytesFromCache(fileName: string) {
  if (typeof caches === "undefined") return undefined;
  try {
    const cache = await caches.open("transformers-cache");
    const keys = await cache.keys();
    const request = keys.find((key) => key.url.endsWith(fileName));
    if (!request) return undefined;
    const response = await cache.match(request);
    if (!response) return undefined;
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > 0) return declared;
    return (await response.blob()).size;
  } catch {
    return undefined;
  }
}

/**
 * Reported weight sizes come from the bytes this device actually fetched, so the
 * size column stays honest if the upstream checkpoint is ever re-exported.
 */
export async function measureWeightBytes(dtype: ModelDType) {
  const fileName = weightFileName(dtype);
  return (await bytesFromCache(fileName)) ?? bytesFromResourceTiming(fileName);
}

export function formatBytes(bytes?: number) {
  if (bytes === undefined) return "not measured";
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
