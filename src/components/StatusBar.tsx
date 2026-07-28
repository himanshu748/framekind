import { Monitor } from "lucide-react";
import { describeConfig } from "../lib/device";
import type { RunConfig } from "../types";

export function StatusBar({ ready, activeConfig }: { ready: boolean; activeConfig: RunConfig | null }) {
  return (
    <footer className="status-bar">
      <Monitor aria-hidden="true" />
      <span>YOLOS Tiny</span>
      <span aria-hidden="true">·</span>
      <span>ONNX Runtime Web</span>
      <span aria-hidden="true">·</span>
      <span>{activeConfig ? describeConfig(activeConfig) : "Selecting backend"}</span>
      <span aria-hidden="true">·</span>
      <span>{ready ? "Local cache ready" : "Preparing local cache"}</span>
    </footer>
  );
}
