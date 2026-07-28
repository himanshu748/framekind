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

type Candidate = {
  entry: SweepEntry;
  detector: Detector | null;
  runsMs: number[];
  detections: Detection[];
};

function candidateFor(planned: ReturnType<typeof sweepPlan>[number]): Candidate {
  return {
    entry: {
      id: planned.id,
      label: planned.label,
      device: planned.device,
      dtype: planned.dtype,
      shortestEdge: planned.shortestEdge,
      isReference: planned.isReference,
    },
    detector: null,
    runsMs: [],
    detections: [],
  };
}

/**
 * Rounds are interleaved rather than run as one block per configuration. A laptop
 * drifts under thermal and background load over the minutes a sweep takes, and a
 * block layout charges all of that drift to whichever configuration happened to
 * hold the slow window. Interleaving spreads it across every configuration, and
 * the per-config minimum then survives as the least contaminated estimate.
 *
 * Exactly one session is resident at a time. Holding all of them open would
 * interleave without reloading, but that is roughly 105 MB of weights plus seven
 * runtime arenas, which a 16 GB laptop feels and a phone cannot survive. Paying a
 * cached reload and a warm-up per measurement is the cost of bounding the sweep
 * to the memory the product itself uses.
 */
async function runSweep(request: Extract<WorkerRequest, { type: "sweep" }>) {
  const { capabilities: caps } = await ensureReady();
  await releaseActiveDetector();

  const planned = sweepPlan(caps);
  const candidates = planned.map(candidateFor);
  const byId = new Map(candidates.map((candidate) => [candidate.entry.id, candidate]));
  const totalSteps = Math.max(1, request.runs * planned.length);
  let step = 0;

  for (let round = 0; round < request.runs; round += 1) {
    for (const config of planned) {
      const candidate = byId.get(config.id)!;
      step += 1;
      if (candidate.entry.error) continue;

      send({
        type: "progress",
        requestId: request.requestId,
        stage: `Round ${round + 1} of ${request.runs}: ${config.label}`,
        progress: (step / totalSteps) * 100,
      });

      let detector: Detector | null = null;
      try {
        const loaded = await loadDetector(config, request.requestId, config.label);
        detector = loaded.detector;
        if (round === 0) {
          candidate.entry.loadMs = loaded.loadMs;
          candidate.entry.weightBytes = await measureWeightBytes(config.dtype);
        }
        await detector(request.imageUrl, { threshold: THRESHOLD });
        const startedAt = performance.now();
        candidate.detections = await detector(request.imageUrl, { threshold: THRESHOLD });
        candidate.runsMs.push(performance.now() - startedAt);
      } catch (error) {
        candidate.entry.error =
          error instanceof Error ? error.message : "This configuration did not run.";
      } finally {
        if (detector) await detector.dispose();
      }
    }
  }

  const reference = candidates.find((candidate) => candidate.entry.isReference);
  const entries: SweepEntry[] = candidates.map((candidate) => {
    if (candidate.entry.error) return candidate.entry;
    if (candidate.runsMs.length === 0) {
      candidate.entry.error = "This configuration produced no timed runs.";
      return candidate.entry;
    }
    candidate.entry.runsMs = candidate.runsMs;
    candidate.entry.minMs = Math.min(...candidate.runsMs);
    candidate.entry.medianMs = percentile(candidate.runsMs, 0.5);
    candidate.entry.p95Ms = percentile(candidate.runsMs, 0.95);
    candidate.entry.detectionCount = candidate.detections.length;
    candidate.entry.agreement =
      !reference || reference.entry.error || candidate.entry.isReference
        ? 1
        : detectionAgreement(reference.detections, candidate.detections);
    return candidate.entry;
  });

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
      interleaved: true,
      threshold: THRESHOLD,
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
