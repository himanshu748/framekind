/// <reference lib="webworker" />

import { env, pipeline } from "@huggingface/transformers";
import { detectionAgreement, percentile } from "./lib/benchmark";
import { NATIVE_SHORTEST_EDGE, detectCapabilities, preferredConfig } from "./lib/device";
import { sweepPlan } from "./lib/sweep";
import { measureWeightBytes } from "./lib/weights";
import type {
  Detection,
  DeviceCapabilities,
  RunConfig,
  SweepEntry,
  SweepResult,
  WorkerRequest,
  WorkerResponse,
} from "./types";

const MODEL_ID = "Xenova/yolos-tiny";
const MODEL_REVISION = "e2f9c7673f0fa61849efe2b56a0d7774779ebb9d";
const THRESHOLD = 0.5;

type Detector = {
  (imageUrl: string, options: { threshold: number }): Promise<Detection[]>;
  dispose: () => Promise<void> | void;
  processor?: { image_processor?: { size?: Record<string, number> } };
};

const workerScope = self as DedicatedWorkerGlobalScope;

env.allowLocalModels = false;
env.useBrowserCache = true;

let capabilities: DeviceCapabilities | null = null;
let activeConfig: RunConfig | null = null;
let activeDetector: Detector | null = null;
let activeLoadMs = 0;

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

async function ensureReady() {
  if (!capabilities || !activeConfig) {
    capabilities = await detectCapabilities();
    const wasmBackend = env.backends.onnx.wasm;
    if (wasmBackend) wasmBackend.numThreads = capabilities.wasmThreads;
    activeConfig = preferredConfig(capabilities);
    send({ type: "capabilities", capabilities, active: activeConfig });
  }
  return { capabilities, activeConfig };
}

async function loadDetector(config: RunConfig, requestId: string, prefix: string) {
  const startedAt = performance.now();
  const detector = (await pipeline("object-detection", MODEL_ID, {
    revision: MODEL_REVISION,
    dtype: config.dtype,
    device: config.device,
    progress_callback: progressReporter(requestId, prefix),
  })) as unknown as Detector;

  if (config.shortestEdge !== NATIVE_SHORTEST_EDGE) {
    const imageProcessor = detector.processor?.image_processor;
    if (!imageProcessor) throw new Error("This build cannot override the input resolution.");
    imageProcessor.size = {
      shortest_edge: config.shortestEdge,
      longest_edge: Math.round(config.shortestEdge * 2.6),
    };
  }

  return { detector, loadMs: performance.now() - startedAt };
}

async function getActiveDetector(requestId: string) {
  const { activeConfig: config } = await ensureReady();
  if (!activeDetector) {
    const loaded = await loadDetector(config, requestId, "Preparing on-device model");
    activeDetector = loaded.detector;
    activeLoadMs = loaded.loadMs;
  }
  return { detector: activeDetector, loadMs: activeLoadMs, config };
}

async function releaseActiveDetector() {
  if (!activeDetector) return;
  await activeDetector.dispose();
  activeDetector = null;
  activeLoadMs = 0;
}

async function runDetection(request: Extract<WorkerRequest, { type: "detect" }>) {
  const { detector, loadMs, config } = await getActiveDetector(request.requestId);

  send({ type: "progress", requestId: request.requestId, stage: "Running local inference" });
  const startedAt = performance.now();
  const detections = await detector(request.imageUrl, { threshold: THRESHOLD });
  const inferenceMs = performance.now() - startedAt;

  send({
    type: "detect-result",
    requestId: request.requestId,
    result: { detections, inferenceMs, modelLoadMs: loadMs, config },
  });
}

async function measureConfig(
  planned: ReturnType<typeof sweepPlan>[number],
  requestId: string,
  imageUrl: string,
  runs: number,
  reference: Detection[] | null,
): Promise<{ entry: SweepEntry; detections: Detection[] }> {
  const entry: SweepEntry = {
    id: planned.id,
    label: planned.label,
    device: planned.device,
    dtype: planned.dtype,
    shortestEdge: planned.shortestEdge,
    isReference: planned.isReference,
  };

  let detector: Detector | null = null;
  try {
    const loaded = await loadDetector(planned, requestId, `Starting ${planned.label}`);
    detector = loaded.detector;
    entry.loadMs = loaded.loadMs;
    entry.weightBytes = await measureWeightBytes(planned.dtype);

    send({ type: "progress", requestId, stage: `Warming up ${planned.label}` });
    await detector(imageUrl, { threshold: THRESHOLD });

    const runsMs: number[] = [];
    let detections: Detection[] = [];
    for (let index = 0; index < runs; index += 1) {
      send({
        type: "progress",
        requestId,
        stage: `${planned.label}: run ${index + 1} of ${runs}`,
        progress: ((index + 1) / runs) * 100,
      });
      const startedAt = performance.now();
      detections = await detector(imageUrl, { threshold: THRESHOLD });
      runsMs.push(performance.now() - startedAt);
    }

    entry.runsMs = runsMs;
    entry.medianMs = percentile(runsMs, 0.5);
    entry.p95Ms = percentile(runsMs, 0.95);
    entry.detectionCount = detections.length;
    entry.agreement = reference === null ? 1 : detectionAgreement(reference, detections);
    return { entry, detections };
  } catch (error) {
    entry.error = error instanceof Error ? error.message : "This configuration did not run.";
    return { entry, detections: [] };
  } finally {
    if (detector) await detector.dispose();
  }
}

async function runSweep(request: Extract<WorkerRequest, { type: "sweep" }>) {
  const { capabilities: caps } = await ensureReady();
  await releaseActiveDetector();

  const planned = sweepPlan(caps);
  const entries: SweepEntry[] = [];
  let reference: Detection[] | null = null;

  for (const config of planned) {
    const { entry, detections } = await measureConfig(
      config,
      request.requestId,
      request.imageUrl,
      request.runs,
      config.isReference ? null : reference,
    );
    if (config.isReference && !entry.error) reference = detections;
    entries.push(entry);
  }

  send({
    type: "sweep-result",
    requestId: request.requestId,
    result: {
      entries,
      referenceId: planned.find((config) => config.isReference)?.id ?? planned[0].id,
      capabilities: caps,
      userAgent: navigator.userAgent,
      imageWidth: request.imageWidth,
      imageHeight: request.imageHeight,
      runsPerConfig: request.runs,
      completedAt: new Date().toISOString(),
    } satisfies SweepResult,
  });
}

let taskQueue = Promise.resolve();

workerScope.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  taskQueue = taskQueue
    .then(() => (request.type === "detect" ? runDetection(request) : runSweep(request)))
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "The local model could not complete this request.";
      send({ type: "error", requestId: request.requestId, message });
    });
});

void ensureReady();

export {};
