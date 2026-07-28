import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DeviceCapabilities,
  InferenceResult,
  RunConfig,
  SweepResult,
  WorkerRequest,
  WorkerResponse,
} from "../types";

type PendingValue = InferenceResult | SweepResult;

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
  const [capabilities, setCapabilities] = useState<DeviceCapabilities | null>(null);
  const [activeConfig, setActiveConfig] = useState<RunConfig | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL("../ai.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;

    worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (message.type === "capabilities") {
        setCapabilities(message.capabilities);
        setActiveConfig(message.active);
        return;
      }
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
    async (imageUrl: string) => {
      const requestId = crypto.randomUUID();
      const result = await dispatch({ type: "detect", requestId, imageUrl });
      return result as InferenceResult;
    },
    [dispatch],
  );

  const sweep = useCallback(
    async (imageUrl: string, imageWidth: number, imageHeight: number, runs = 5) => {
      const requestId = crypto.randomUUID();
      const result = await dispatch({
        type: "sweep",
        requestId,
        imageUrl,
        imageWidth,
        imageHeight,
        runs,
      });
      return result as SweepResult;
    },
    [dispatch],
  );

  return { detect, sweep, progress, capabilities, activeConfig };
}
