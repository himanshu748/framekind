export type ModelDType = "fp32" | "fp16" | "uint8" | "q4";

export type Device = "wasm" | "webgpu";

export interface DetectionBox {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}

export interface Detection {
  label: string;
  score: number;
  box: DetectionBox;
}

export interface RunConfig {
  device: Device;
  dtype: ModelDType;
  shortestEdge: number;
}

export interface DeviceCapabilities {
  webgpu: boolean;
  shaderF16: boolean;
  crossOriginIsolated: boolean;
  hardwareConcurrency: number;
  wasmThreads: number;
  adapter?: string;
}

export interface InferenceResult {
  detections: Detection[];
  inferenceMs: number;
  modelLoadMs: number;
  config: RunConfig;
}

export interface SweepEntry extends RunConfig {
  id: string;
  label: string;
  isReference: boolean;
  weightBytes?: number;
  loadMs?: number;
  runsMs?: number[];
  medianMs?: number;
  p95Ms?: number;
  detectionCount?: number;
  agreement?: number;
  error?: string;
}

export interface SweepResult {
  entries: SweepEntry[];
  referenceId: string;
  capabilities: DeviceCapabilities;
  userAgent: string;
  imageWidth: number;
  imageHeight: number;
  runsPerConfig: number;
  completedAt: string;
}

export type WorkerRequest =
  | {
      type: "detect";
      requestId: string;
      imageUrl: string;
    }
  | {
      type: "sweep";
      requestId: string;
      imageUrl: string;
      imageWidth: number;
      imageHeight: number;
      runs: number;
    };

export type WorkerResponse =
  | {
      type: "progress";
      requestId: string;
      stage: string;
      progress?: number;
    }
  | {
      type: "detect-result";
      requestId: string;
      result: InferenceResult;
    }
  | {
      type: "sweep-result";
      requestId: string;
      result: SweepResult;
    }
  | {
      type: "capabilities";
      capabilities: DeviceCapabilities;
      active: RunConfig;
    }
  | {
      type: "error";
      requestId: string;
      message: string;
    };
