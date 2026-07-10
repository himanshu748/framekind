import { Monitor } from "lucide-react";

export function StatusBar({ ready }: { ready: boolean }) {
  return (
    <footer className="status-bar">
      <Monitor aria-hidden="true" />
      <span>YOLOS Tiny</span>
      <span aria-hidden="true">·</span>
      <span>ONNX Runtime Web</span>
      <span aria-hidden="true">·</span>
      <span>WASM SIMD</span>
      <span aria-hidden="true">·</span>
      <span>{ready ? "Local cache ready" : "Preparing local cache"}</span>
    </footer>
  );
}
