import { useCallback, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { AltTextPanel } from "./components/AltTextPanel";
import { AppHeader } from "./components/AppHeader";
import { BenchmarkPanel } from "./components/BenchmarkPanel";
import { Hero } from "./components/Hero";
import { ImageWorkbench } from "./components/ImageWorkbench";
import { MethodSection } from "./components/MethodSection";
import { StatusBar } from "./components/StatusBar";
import { useInferenceWorker } from "./hooks/useInferenceWorker";
import { generateAltText } from "./lib/caption";
import type { BenchmarkResult, Detection } from "./types";

const SAMPLE_IMAGE = `${import.meta.env.BASE_URL}sample-street.png`;
const MAX_FILE_BYTES = 15 * 1024 * 1024;

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(new Error("That image could not be read.")));
    reader.readAsDataURL(file);
  });
}

export default function App() {
  const inputRef = useRef<HTMLInputElement>(null);
  const processedRef = useRef("");
  const copyTimerRef = useRef<number | null>(null);
  const analysisGenerationRef = useRef(0);
  const { detect, benchmark, progress } = useInferenceWorker();
  const [imageUrl, setImageUrl] = useState(SAMPLE_IMAGE);
  const [imageKey, setImageKey] = useState(0);
  const [naturalSize, setNaturalSize] = useState({ width: 1448, height: 1086 });
  const [detections, setDetections] = useState<Detection[]>([]);
  const [draft, setDraft] = useState("");
  const [showBoxes, setShowBoxes] = useState(true);
  const [isProcessing, setIsProcessing] = useState(true);
  const [isBenchmarking, setIsBenchmarking] = useState(false);
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [modelReady, setModelReady] = useState(false);

  const resetForImage = useCallback((nextUrl: string) => {
    analysisGenerationRef.current += 1;
    processedRef.current = "";
    setImageUrl(nextUrl);
    setImageKey((value) => value + 1);
    setDetections([]);
    setDraft("");
    setBenchmarkResult(null);
    setError("");
    setIsProcessing(true);
  }, []);

  const analyzeImage = useCallback(async (url: string, width: number, generation: number) => {
    if (generation !== analysisGenerationRef.current) return;
    setIsProcessing(true);
    setError("");
    try {
      const result = await detect(url, "uint8");
      if (generation !== analysisGenerationRef.current) return;
      const sorted = [...result.detections].sort((a, b) => b.score - a.score);
      setDetections(sorted);
      setDraft(generateAltText(sorted, width));
      setModelReady(true);
    } catch (reason) {
      if (generation !== analysisGenerationRef.current) return;
      const message = reason instanceof Error ? reason.message : "Local inference did not finish.";
      setError(message);
      setDraft("");
    } finally {
      if (generation === analysisGenerationRef.current) setIsProcessing(false);
    }
  }, [detect]);

  const handleImageLoad = useCallback((width: number, height: number) => {
    setNaturalSize({ width, height });
    const fingerprint = `${imageKey}:${imageUrl.length}:${imageUrl.slice(-48)}`;
    if (processedRef.current === fingerprint) return;
    processedRef.current = fingerprint;
    void analyzeImage(imageUrl, width, analysisGenerationRef.current);
  }, [analyzeImage, imageKey, imageUrl]);

  const handleImageError = useCallback(() => {
    analysisGenerationRef.current += 1;
    processedRef.current = "";
    setDetections([]);
    setDraft("");
    setError("That image could not be decoded. Choose a valid PNG, JPEG, or WebP file.");
    setIsProcessing(false);
  }, []);

  const handleFile = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    if (isProcessing || isBenchmarking) return;
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose a PNG, JPEG, or WebP image.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("Choose an image smaller than 15 MB.");
      return;
    }
    try {
      resetForImage(await readFileAsDataUrl(file));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "That image could not be read.");
    }
  }, [isBenchmarking, isProcessing, resetForImage]);

  const handleCopy = useCallback(async () => {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setError("Clipboard access is unavailable. Select the draft and copy it manually.");
    }
  }, [draft]);

  const handleBenchmark = useCallback(async () => {
    if (isProcessing || isBenchmarking) return;
    const generation = analysisGenerationRef.current;
    setIsBenchmarking(true);
    setError("");
    try {
      const result = await benchmark(imageUrl, 5);
      if (generation !== analysisGenerationRef.current) return;
      setBenchmarkResult(result);
      setModelReady(true);
    } catch (reason) {
      if (generation !== analysisGenerationRef.current) return;
      setError(reason instanceof Error ? reason.message : "The benchmark did not finish.");
    } finally {
      if (generation === analysisGenerationRef.current) setIsBenchmarking(false);
    }
  }, [benchmark, imageUrl, isBenchmarking, isProcessing]);

  return (
    <div className="app-shell">
      <AppHeader />
      <main id="workbench">
        <Hero
          inputRef={inputRef}
          disabled={isProcessing || isBenchmarking}
          onFile={handleFile}
          onSample={() => resetForImage(SAMPLE_IMAGE)}
        />
        <div className="workbench-grid">
          <ImageWorkbench
            src={imageUrl}
            alt={draft || "Selected image awaiting local object detection"}
            detections={detections}
            naturalSize={naturalSize}
            showBoxes={showBoxes}
            isProcessing={isProcessing}
            progress={progress}
            imageKey={imageKey}
            onImageLoad={handleImageLoad}
            onImageError={handleImageError}
            onToggleBoxes={() => setShowBoxes((value) => !value)}
          />
          <AltTextPanel
            draft={draft}
            detections={detections}
            isProcessing={isProcessing}
            copied={copied}
            error={error}
            onDraft={setDraft}
            onCopy={handleCopy}
          />
        </div>
        <BenchmarkPanel
          result={benchmarkResult}
          isRunning={isBenchmarking}
          disabled={isProcessing}
          progress={progress}
          onRun={handleBenchmark}
        />
        <MethodSection />
      </main>
      <StatusBar ready={modelReady} />
    </div>
  );
}
