/// <reference lib="webworker" />

import { env, pipeline } from "@huggingface/transformers";
import { detectionAgreement, percentile } from "./lib/benchmark";
import type {
  BenchmarkResult,
  Detection,
  ModelBenchmark,
  ModelDType,
  WorkerRequest,
  WorkerResponse,
} from "./types";

const MODEL_ID = "Xenova/yolos-tiny";
const MODEL_REVISION = "e2f9c7673f0fa61849efe2b56a0d7774779ebb9d";
const MODEL_WEIGHT_MB: Record<ModelDType, number> = {
  fp32: 26.2,
  uint8: 9.51,
};

type Detector = {
  (imageUrl: string, options: { threshold: number }): Promise<Detection[]>;
  dispose: () => Promise<void> | void;
};

type LoadedDetector = {
  detector: Detector;
  loadMs: number;
};

const workerScope = self as DedicatedWorkerGlobalScope;

env.allowLocalModels = false;
env.useBrowserCache = true;

const availableThreads = Math.max(1, navigator.hardwareConcurrency || 1);
const wasmBackend = env.backends.onnx.wasm;
if (wasmBackend) {
  wasmBackend.numThreads = crossOriginIsolated
    ? Math.min(4, Math.max(2, Math.floor(availableThreads / 2)))
    : 1;
}

let optimizedDetector: Detector | null = null;
let optimizedLoadMs = 0;

function send(message: WorkerResponse) {
  workerScope.postMessage(message);
}

function progressReporter(requestId: string, prefix: string) {
  return (event: Record<string, unknown>) => {
    const status = typeof event.status === "string" ? event.status : "loading";
    const file = typeof event.file === "string" ? event.file.split("/").at(-1) : undefined;
    const rawProgress = typeof event.progress === "number" ? event.progress : undefined;
    const progress = rawProgress === undefined
      ? undefined
      : Math.max(0, Math.min(100, rawProgress > 1 ? rawProgress : rawProgress * 100));
    const stage = file ? `${prefix}: ${status} ${file}` : `${prefix}: ${status}`;
    send({ type: "progress", requestId, stage, progress });
  };
}

async function loadDetector(
  dtype: ModelDType,
  requestId: string,
  prefix: string,
): Promise<LoadedDetector> {
  const startedAt = performance.now();
  const created = await pipeline("object-detection", MODEL_ID, {
    revision: MODEL_REVISION,
    dtype,
    device: "wasm",
    progress_callback: progressReporter(requestId, prefix),
  });
  return {
    detector: created as unknown as Detector,
    loadMs: performance.now() - startedAt,
  };
}

async function getOptimizedDetector(requestId: string) {
  if (!optimizedDetector) {
    const loaded = await loadDetector("uint8", requestId, "Preparing optimized model");
    optimizedDetector = loaded.detector;
    optimizedLoadMs = loaded.loadMs;
  }
  return { detector: optimizedDetector, loadMs: optimizedLoadMs };
}

async function runDetection(request: Extract<WorkerRequest, { type: "detect" }>) {
  const loaded = request.dtype === "uint8"
    ? await getOptimizedDetector(request.requestId)
    : await loadDetector("fp32", request.requestId, "Preparing full-precision model");

  send({ type: "progress", requestId: request.requestId, stage: "Running local inference" });
  const startedAt = performance.now();
  const detections = await loaded.detector(request.imageUrl, { threshold: 0.5 });
  const inferenceMs = performance.now() - startedAt;

  if (request.dtype === "fp32") {
    await loaded.detector.dispose();
  }

  send({
    type: "detect-result",
    requestId: request.requestId,
    result: {
      detections,
      inferenceMs,
      modelLoadMs: loaded.loadMs,
      dtype: request.dtype,
    },
  });
}

async function disposeOptimizedDetector() {
  if (!optimizedDetector) return;
  await optimizedDetector.dispose();
  optimizedDetector = null;
  optimizedLoadMs = 0;
}

async function prepareWarmCache(dtype: ModelDType, requestId: string) {
  const loaded = await loadDetector(dtype, requestId, `Caching ${dtype.toUpperCase()} weights`);
  await loaded.detector.dispose();
}

async function measureModel(
  dtype: ModelDType,
  requestId: string,
  imageUrl: string,
  runs: number,
): Promise<ModelBenchmark> {
  const loaded = await loadDetector(dtype, requestId, `Starting ${dtype.toUpperCase()} session`);
  send({ type: "progress", requestId, stage: `Warming up ${dtype.toUpperCase()} inference` });
  await loaded.detector(imageUrl, { threshold: 0.5 });

  const runsMs: number[] = [];
  let detections: Detection[] = [];
  for (let index = 0; index < runs; index += 1) {
    send({
      type: "progress",
      requestId,
      stage: `${dtype.toUpperCase()} measured run ${index + 1} of ${runs}`,
      progress: ((index + 1) / runs) * 100,
    });
    const startedAt = performance.now();
    detections = await loaded.detector(imageUrl, { threshold: 0.5 });
    runsMs.push(performance.now() - startedAt);
  }

  if (dtype === "uint8") {
    optimizedDetector = loaded.detector;
    optimizedLoadMs = loaded.loadMs;
  } else {
    await loaded.detector.dispose();
  }

  return {
    dtype,
    weightMb: MODEL_WEIGHT_MB[dtype],
    loadMs: loaded.loadMs,
    runsMs,
    medianMs: percentile(runsMs, 0.5),
    p95Ms: percentile(runsMs, 0.95),
    detections,
  };
}

async function runBenchmark(request: Extract<WorkerRequest, { type: "benchmark" }>) {
  await disposeOptimizedDetector();

  send({
    type: "progress",
    requestId: request.requestId,
    stage: "Preparing a fair warm-cache comparison",
  });
  await prepareWarmCache("fp32", request.requestId);
  await prepareWarmCache("uint8", request.requestId);

  const fp32 = await measureModel(
    "fp32",
    request.requestId,
    request.imageUrl,
    request.runs,
  );
  const uint8 = await measureModel(
    "uint8",
    request.requestId,
    request.imageUrl,
    request.runs,
  );

  const result: BenchmarkResult = {
    fp32,
    uint8,
    labelAgreement: detectionAgreement(fp32.detections, uint8.detections),
    completedAt: new Date().toISOString(),
  };

  send({ type: "benchmark-result", requestId: request.requestId, result });
}

let taskQueue = Promise.resolve();

workerScope.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  taskQueue = taskQueue
    .then(() => (request.type === "detect" ? runDetection(request) : runBenchmark(request)))
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "The local model could not complete this request.";
      send({ type: "error", requestId: request.requestId, message });
    });
});

export {};
