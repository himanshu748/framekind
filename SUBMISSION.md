# FrameKind, Arm Create submission copy

## Submission facts

- **Challenge:** Arm Create: AI Optimization Challenge
- **Track:** Mobile AI
- **Deadline:** August 14, 2026 at 4:00 PM PDT (August 15, 4:30 AM IST)
- **Project:** FrameKind
- **Tagline:** Private alt-text drafts, powered on your device.
- **Live demo:** https://framekind-ai.netlify.app/
- **Public repository:** https://github.com/himanshu748/framekind
- **License:** MIT
- **Target hardware:** Arm-powered laptop, validated on Apple Silicon (`arm64`)
- **Model:** `Xenova/yolos-tiny`, pinned at `e2f9c7673f0fa61849efe2b56a0d7774779ebb9d`

## Description

FrameKind is a privacy-first accessibility tool that turns an image into an editable alt-text draft without uploading the image to a vision API. A user picks a PNG, JPEG or WebP image, or the bundled sample. FrameKind runs YOLOS Tiny locally through Transformers.js and ONNX Runtime Web, draws detected objects and confidence scores, and produces a concise spatial draft describing what appears on the left, near the center, and on the right. The draft stays editable and copies in one click. Images stay in browser memory; only open model weights are fetched and cached.

The optimization work is the product, not a footnote. FrameKind ships a sweep that a judge can rerun on their own Arm device: every backend the browser exposes, crossed with every published precision of one pinned checkpoint, plus an input-resolution ladder. Each configuration is scored for latency and for detection agreement against the full-precision reference, and weight sizes are read back from the browser cache as measured bytes rather than numbers typed into the source.

Running that sweep three times produced a result that contradicts the standard advice for shrinking browser models, and a second result about benchmarking itself. Quantization by itself never bought a dependable speedup: UINT8 weights are 64% smaller, and the UINT8-versus-FP32 ratio on the WASM backend measured 0.99, then 0.62, then 1.54 across three sweeps on one machine, landing on either side of parity with system load. Quantization on WebGPU was actively harmful: WebGPU UINT8 ran slower than WebGPU FP32 and scored 0% detection agreement in all three sweeps, so the smallest file was not merely the slowest configuration on the fastest backend, it was a broken one. The backend was the real lever and the only stable one: WebGPU FP32 reproduced the reference detections exactly and landed within 9 ms of itself across the two sweeps where the machine was not loaded. Reducing input resolution beat every precision change every time.

The second result is the one that changed how the project reports anything. The WASM FP32 reference alone measured 3,154 ms, 3,444 ms and 7,441 ms on the same machine and image, so the CPU path is the noisiest component in the system and no single-run ratio taken from it means much. Detection agreement, meanwhile, reproduced exactly in all three sweeps. FrameKind now takes five timed runs per configuration and shows p95 beside the median, and its documentation reports ranges rather than a headline number, because the headline number is the thing this project learned not to trust.

There is an Arm-specific reason for these results, worked through in `docs/arm-optimization.md` against a cost model that ships as tested code. YOLOS Tiny is a plain vision transformer, so at native resolution attention accounts for 56% of its multiply-accumulates and grows quadratically in token count. Halving the shortest edge cuts tokens by 3.31× but cuts the attention term by 10.93×, which is why resolution is the strongest lever; the modelled 5.40× falls inside the 5.70× to 8.02× measured across sweeps. Quantization, meanwhile, has no mechanism to pay off in a browser: WebAssembly's `simd128` has no 8-bit dot product and no 8-bit matrix-multiply instruction, so the `SDOT` and `SMMLA` instructions that make INT8 fast on Arm, and that Arm exposes to native frameworks through KleidiAI, are unreachable from the wasm sandbox. Wiring quantized GEMM to them through WebAssembly Relaxed SIMD is still an open feature request against ONNX Runtime. An absent speedup is therefore the expected result rather than an anomaly, and the analysis predicts which Arm cores would benefit first if that work lands.

FrameKind acts on its own measurements. It selects the fastest configuration that reproduces the reference detections exactly, which on a WebGPU-capable Arm device is WebGPU FP32, so the default gives up no detection quality. Quantization is retained for the WASM fallback, where it is the only lever left and the download saving is real. Input resolution is deliberately kept out of the default: it is the largest lever available, but it changes what the model can see, and in an accessibility tool a missed object becomes a missing sentence in someone's alt text. The status bar names the configuration actually in use.

FrameKind should win because it treats optimization as a measurement problem on the judge's own hardware rather than a number in a README, then lets the measurement overrule the received wisdom and change what the product actually runs.

## Inspiration

Alt text makes the web more usable, but generating it through a hosted vision API can expose personal, unpublished or sensitive images. We wanted to see whether a compact open model could provide a useful starting point locally, and to make the performance-versus-quality tradeoff visible instead of hiding it behind a loading spinner.

## What it does

- Processes selected images locally in the browser.
- Selects a backend and precision at runtime from what the device actually supports.
- Detects objects, overlays boxes, labels and confidence scores.
- Creates an editable spatial alt-text draft and copies it in one click.
- Sweeps every available backend, precision and input resolution on demand.
- Scores every configuration against the full-precision reference so speed never appears without a quality guardrail.
- Reports measured weight sizes and exports every raw run as JSON.

## How we built it

FrameKind is a React and TypeScript application bundled with Vite. Transformers.js loads the pinned `Xenova/yolos-tiny` revision, and ONNX Runtime Web executes it through either the WebGPU or the WASM backend. Inference runs inside a dedicated Web Worker, which owns backend selection, model lifecycle and sweep timing so long-running full-precision work never blocks the interface.

Detections above a 0.5 confidence threshold are grouped by label and converted into a deterministic draft. The caption logic includes quantities and coarse horizontal positions while avoiding unsupported visual claims.

The sweep runs the full-precision WASM reference first and keeps its detections. Each remaining configuration gets a fresh session, one untimed warm-up, then the same number of timed runs, and is scored against the reference by identical label plus bounding-box intersection-over-union of at least 0.5, reported as a symmetric match rate. Weight sizes come from the Cache API entry for each ONNX file.

The production host sends cross-origin isolation headers so ONNX Runtime Web can use isolation-enabled WASM threads. GitHub Pages cannot send those headers, so the Pages URL redirects to the isolated host rather than serving a copy that silently falls back to one thread.

## Challenges we ran into

The first version of this project reported a large speedup from quantization measured in one browser. Building the sweep showed the result did not hold: on a different browser the same comparison came out at parity, and the apparent win had been a property of one runtime rather than of the optimization.

Then the same lesson arrived a second time, aimed at us. Having rebuilt the benchmark, we published a 2.10× figure for WebGPU from a single sweep. Running it twice more showed the WASM reference it was measured against moving between 3,154 ms and 7,441 ms depending on machine load, which made that ratio unreliable too. Three timed runs per configuration was not enough sampling to support the claims being drawn from it. The fix was to raise the run count, surface p95 alongside the median, and rewrite every number in the documentation as a range. Learning that our own corrected benchmark was still under-sampled was more useful than the original finding.

Defining quality agreement usefully was the second challenge. Matching requires an identical label and an intersection-over-union of at least 0.5, then a symmetric score across both prediction sets. On an image with four objects that metric is coarse, so it is presented as a pass or fail signal rather than a precise ranking. It is still sharp enough to catch a configuration returning nothing useful, which is exactly what it caught on WebGPU UINT8.

## Accomplishments we are proud of

- A measured result that overturned our own earlier claim, and a product that changed its default because of it.
- An Arm-level explanation of that result, down to the missing `SDOT` and `SMMLA` instructions, backed by a cost model that runs in the test suite.
- Real, fully local object detection rather than a simulated demo.
- A usable alt-text workflow with editable output and human review.
- Runtime backend selection that gives up no detection quality.
- A rerunnable sweep with JSON export, so the evidence belongs to whoever runs it.
- Measured weight sizes instead of hardcoded constants.

## What we learned

Quantization is a download optimization first and a latency optimization only sometimes. Weight size, initialization, inference latency and output agreement move independently, and the ranking between them is not portable across backends or browsers. A single ratio published in a README is close to meaningless without the device and runtime that produced it, which is the argument for shipping the benchmark rather than its output.

## What is next

- Per-operator profiling on Arm cores with and without `i8mm`, to confirm the instruction-level attribution directly rather than by inference from the shipped runtime.
- Score agreement across a small image set rather than the loaded image, so the guardrail is less coarse.
- Reduce the ONNX Runtime WASM download, which is currently larger than the model weights.
- Add richer but still evidence-grounded relationships between objects.
- Offline installation through a Progressive Web App.
- Usability testing with screen-reader users and accessibility professionals.

## AI assistance disclosure

OpenAI Codex assisted with project ideation, implementation, testing, design exploration, deployment and documentation. Claude Code assisted with backend selection, the sweep harness, and this revision. YOLOS Tiny supplies object detection. The bundled sample image was AI-generated for demonstration and testing. The entrant must review and approve the final project and contest submission.

## 90-second demo script

**0:00 to 0:08, opening**
"Alt text improves accessibility, but uploading personal images to a vision API creates a privacy tradeoff. FrameKind drafts alt text directly on your device."

**0:08 to 0:22, run the sample**
"YOLOS Tiny runs locally through ONNX Runtime Web inside a dedicated worker, so the image stays in browser memory. The status bar shows which backend FrameKind picked for this machine."

**0:22 to 0:38, inspect the result**
"It detects a person, a bicycle and a potted plant, then turns those grounded detections into a spatial draft. It describes only supported objects and positions instead of inventing scene details. The draft stays editable and copies in one click."

**0:38 to 1:05, the sweep**
"Now the interesting part. This sweep runs every backend and precision this browser supports, against the same image, and scores each one against the full-precision reference. Quantization on its own bought nothing dependable here, it lands either side of parity. Moving the same graph to WebGPU was the one stable win, with identical detections. And quantizing on WebGPU scored zero percent agreement, so the smallest file was not slow, it was broken. Only the quality guardrail catches that."

**1:05 to 1:20, the consequence**
"There is an Arm reason for that. WebAssembly has no 8-bit dot product instruction, so the SDOT and SMMLA units that make INT8 fast on Arm are unreachable from the browser sandbox. The levers that do work are the GPU, and the token count. And run this three times and the CPU rows move by a factor of two, which is why FrameKind reports p95 next to the median and why we stopped quoting a single number. FrameKind runs the fastest configuration that still reproduces the reference exactly, and you can export every raw run as JSON."

**1:20 to 1:30, close**
"Private, on-device accessibility assistance, where the optimization claim is something you rerun on your own Arm hardware rather than something you take our word for."

## Account-bound checklist

- [ ] Confirm the entrant is an adult/age of majority and otherwise eligible under the official rules.
- [ ] Confirm no employment, sanctions, residence, or conflict restriction applies.
- [ ] Sign in to or create the free Devpost account.
- [ ] Join the challenge and accept the official rules.
- [ ] Sign in to or create the free Arm Developer Program account if the submission form requires it.
- [ ] Choose **Mobile AI** as the track.
- [ ] Add the live demo and public MIT repository links above.
- [ ] Use the verified app screenshot as the project image.
- [ ] Regenerate the sweep JSON and screenshots in the browsers you intend to cite.
- [ ] Add a public demo-video link if a video is recorded; the rules treat it as optional.
- [ ] Review the AI disclosure and all claims in the entrant's own voice.
- [ ] Accept the submission agreement, publicity/release provisions, and dispute/arbitration terms, then submit.
