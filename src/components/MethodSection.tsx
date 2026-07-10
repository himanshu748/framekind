export function MethodSection() {
  return (
    <section className="method-section" id="method" aria-labelledby="method-heading">
      <div>
        <h2 id="method-heading">A benchmark a judge can rerun.</h2>
        <p>
          FrameKind performs object detection in a dedicated browser worker. Images stay in memory on the
          device; only the open model weights are fetched and cached.
        </p>
      </div>
      <dl>
        <div>
          <dt>Same model</dt>
          <dd>YOLOS Tiny in FP32 and UINT8 ONNX variants.</dd>
        </div>
        <div>
          <dt>Same input</dt>
          <dd>One warm-up, then five timed runs on the current image.</dd>
        </div>
        <div>
          <dt>Same runtime</dt>
          <dd>ONNX Runtime Web using WASM SIMD and isolation-enabled threads when the host supports them.</dd>
        </div>
        <div>
          <dt>Quality guardrail</dt>
          <dd>Label-and-box agreement is reported alongside speed and model size.</dd>
        </div>
      </dl>
    </section>
  );
}
