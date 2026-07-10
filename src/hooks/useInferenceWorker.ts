import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BenchmarkResult,
  InferenceResult,
  ModelDType,
  WorkerRequest,
  WorkerResponse,
} from "../types";

type PendingValue = InferenceResult | BenchmarkResult;

interface PendingRequest {
  resolve: (value: PendingValue) => void;
  reject: (reason: Error) => void;
}

interface WorkerProgress {
  stage: string;
  progress?: number;
}

export function useInferenceWorker() {
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef(new Map<string, PendingRequest>());
  const [progress, setProgress] = useState<WorkerProgress>({ stage: "Idle" });

  useEffect(() => {
    const worker = new Worker(new URL("../ai.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;

    worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (message.type === "progress") {
        setProgress({ stage: message.stage, progress: message.progress });
        return;
      }

      const pending = pendingRef.current.get(message.requestId);
      if (!pending) return;
      pendingRef.current.delete(message.requestId);

      if (message.type === "error") {
        pending.reject(new Error(message.message));
        return;
      }

      pending.resolve(message.result);
      setProgress({ stage: "Ready", progress: 100 });
    });

    return () => {
      for (const request of pendingRef.current.values()) {
        request.reject(new Error("The local inference worker was stopped."));
      }
      pendingRef.current.clear();
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const dispatch = useCallback((message: WorkerRequest) => {
    const worker = workerRef.current;
    if (!worker) {
      return Promise.reject(new Error("The local inference worker is still starting."));
    }

    return new Promise<PendingValue>((resolve, reject) => {
      pendingRef.current.set(message.requestId, { resolve, reject });
      worker.postMessage(message);
    });
  }, []);

  const detect = useCallback(
    async (imageUrl: string, dtype: ModelDType = "uint8") => {
      const requestId = crypto.randomUUID();
      const result = await dispatch({ type: "detect", requestId, imageUrl, dtype });
      return result as InferenceResult;
    },
    [dispatch],
  );

  const benchmark = useCallback(
    async (imageUrl: string, runs = 5) => {
      const requestId = crypto.randomUUID();
      const result = await dispatch({ type: "benchmark", requestId, imageUrl, runs });
      return result as BenchmarkResult;
    },
    [dispatch],
  );

  return { detect, benchmark, progress };
}
