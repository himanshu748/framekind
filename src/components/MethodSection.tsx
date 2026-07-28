export function MethodSection() {
  return (
    <section className="method-section" id="method" aria-labelledby="method-heading">
      <div>
        <h2 id="method-heading">A sweep a judge can rerun.</h2>
        <p>
          FrameKind performs object detection in a dedicated browser worker. Images stay in memory on the
          device; only the open model weights are fetched and cached. The fastest configuration is not the
          same on every Arm device, so FrameKind measures rather than assumes.
        </p>
      </div>
      <dl>
        <div>
          <dt>Every backend</dt>
          <dd>WebGPU and WASM, whichever this browser exposes, selected at runtime.</dd>
        </div>
        <div>
          <dt>Every precision</dt>
          <dd>FP32, FP16, UINT8 and Q4 from one pinned checkpoint, plus an input-resolution ladder.</dd>
        </div>
        <div>
          <dt>Same conditions</dt>
          <dd>One image, one threshold, one warm-up, then the same timed run count per configuration.</dd>
        </div>
        <div>
          <dt>Quality guardrail</dt>
          <dd>Every result is scored against the full-precision reference, and weight sizes are measured bytes.</dd>
        </div>
      </dl>
    </section>
  );
}
