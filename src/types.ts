export type ModelDType = "fp32" | "uint8";

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

export interface InferenceResult {
  detections: Detection[];
  inferenceMs: number;
  modelLoadMs: number;
  dtype: ModelDType;
}

export interface ModelBenchmark {
  dtype: ModelDType;
  weightMb: number;
  loadMs: number;
  runsMs: number[];
  medianMs: number;
  p95Ms: number;
  detections: Detection[];
}

export interface BenchmarkResult {
  fp32: ModelBenchmark;
  uint8: ModelBenchmark;
  labelAgreement: number;
  completedAt: string;
}

export type WorkerRequest =
  | {
      type: "detect";
      requestId: string;
      imageUrl: string;
      dtype: ModelDType;
    }
  | {
      type: "benchmark";
      requestId: string;
      imageUrl: string;
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
      type: "benchmark-result";
      requestId: string;
      result: BenchmarkResult;
    }
  | {
      type: "error";
      requestId: string;
      message: string;
    };
