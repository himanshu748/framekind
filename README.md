# FrameKind

Private alt-text drafts, powered on your device.

[**Open the live demo**](https://framekind-ai.netlify.app/) · [Arm challenge](https://arm-ai-optimization-challenge.devpost.com/) · [Why the Arm wins landed where they did](docs/arm-optimization.md) · [Sweep evidence](submission-assets/sweep-apple-silicon-chromium.json)

![FrameKind running in Safari](submission-assets/framekind-safari-desktop-final.png)

FrameKind is a privacy-first image accessibility tool. It runs YOLOS Tiny in the browser, overlays grounded detections, and turns them into an editable spatial alt-text draft. The image stays in browser memory: there is no image-upload API.

Built for the **Mobile AI** track of the [Arm Create AI Optimization Challenge](https://arm-ai-optimization-challenge.devpost.com/), targeting Arm-powered laptops.

## The finding

The usual advice for shrinking a browser model is to quantize it. On an Arm64 laptop that advice does not survive contact with a benchmark, and FrameKind measures why in the app.

- **Quantization never produced a reliable speedup.** UINT8 weights are 64% smaller than FP32, and across three sweeps the UINT8-versus-FP32 ratio on WASM measured 0.99×, 0.62× and 1.54×. It lands on either side of parity depending on what else the machine is doing. What it never did was resemble a large, dependable win.
- **Quantization on WebGPU is actively harmful.** WebGPU UINT8 ran slower than WebGPU FP32 and scored **0% detection agreement in all three sweeps**, meaning it did not find the reference objects at all. The smallest file was the worst configuration on the fastest backend.
- **The backend was the real lever, and the only stable one.** WebGPU FP32 reproduced the reference detections exactly and landed at 1,498 ms and 1,507 ms on the two sweeps where the machine was not loaded.

Reducing the input resolution was worth more than any precision change in every sweep, though the size of that win moved too.

The second-order finding matters as much as the first: **the CPU path is the noisiest thing in the system.** The WASM FP32 reference alone measured 3,154 ms, 3,444 ms and 7,441 ms on the same machine and image. Any single-run ratio published from that path, including the 3.43× this project once claimed, is measuring machine state as much as the optimization. The detection-agreement column, by contrast, reproduced exactly across all three sweeps. That asymmetry is the reason the benchmark ships inside the product instead of its output shipping in this file.

There is an Arm-specific reason for this, worked through in [docs/arm-optimization.md](docs/arm-optimization.md). In short: attention is 56% of this model's arithmetic at native resolution, so cutting tokens attacks a quadratic term, while quantization has no mechanism to pay off in a browser because WebAssembly's `simd128` has no 8-bit dot product or matrix-multiply instruction. The `SDOT` and `SMMLA` instructions that make INT8 fast on Arm, and that Arm exposes to native frameworks through KleidiAI, are not reachable from the wasm sandbox. That is why the quantized rows wander around parity instead of winning. The cost model behind the resolution argument ships as tested code in [`src/lib/cost.ts`](src/lib/cost.ts).

## Measured on Arm64

Apple Silicon, cross-origin isolated, 4 WASM threads, weights pre-cached, agreement scored against the full-precision WASM reference. Three sweeps: one in Chromium 148, two in Chrome 150, the middle one deliberately run with other inference sessions competing for the machine. Raw runs from the first sweep: [`submission-assets/sweep-apple-silicon-chromium.json`](submission-assets/sweep-apple-silicon-chromium.json).

Median inference, in milliseconds, per sweep:

| Configuration | Weights | Sweep 1 | Sweep 2 (loaded) | Sweep 3 | Agreement |
| --- | ---: | ---: | ---: | ---: | ---: |
| WASM · FP32 (reference) | 25.01 MB | 3,154 | 3,444 | 7,441 | reference |
| WASM · UINT8 | 9.07 MB | 3,183 | 5,584 | 4,824 | 86% |
| WASM · UINT8 @384px | 9.07 MB | 1,254 | 3,188 | 1,836 | 67% |
| WASM · UINT8 @256px | 9.07 MB | 397 | 979 | 624 | 86% |
| WebGPU · FP32 | 25.01 MB | 1,498 | 3,409 | 1,507 | 100% |
| WebGPU · FP16 | 12.72 MB | 574 | 1,637 | 801 | 75% |
| WebGPU · UINT8 | 9.07 MB | 1,622 | 4,425 | 2,351 | 0% |

Weight sizes are the bytes this device actually fetched, read back from the Cache API, not constants written into the source. The agreement column is a single column because it did not vary: every configuration scored identically in all three sweeps.

Read the latency columns as a range, not as three attempts at one number. The ordering is stable, the ratios are not, and the WASM rows move most. This is one machine and one architecture. Run the sweep on your own Arm device, compare median against p95, and expect the winner to differ.

## How the default is chosen

FrameKind runs the fastest configuration that reproduces the reference detections exactly, which on a WebGPU-capable Arm device is WebGPU FP32. Every reduced-precision variant measured here loses agreement, so the default trades no quality at all, and it was the most reproducible configuration in the sweeps. Quantization is kept for the WASM fallback, where it is the only lever left and the download saving is real regardless of what latency does.

The status bar names the configuration actually in use.

## Architecture

![FrameKind architecture](submission-assets/architecture.svg)

React keeps interaction and review on the main thread. A dedicated Web Worker owns backend selection, model loading, ONNX Runtime Web inference, model disposal, and sweep timing.

The draft generator is deliberately deterministic. It groups detections above the confidence threshold, adds quantities and left/center/right position, and avoids claims the detector did not establish.

## Run it

Requirements: a current browser with Web Workers and WebAssembly, plus Node.js 20.19+ or 22.12+. WebGPU is used when the browser exposes it and is not required.

```bash
npm install
npm run dev
```

Then open the local URL printed by Vite. The first analysis downloads and caches open model weights. Images themselves are not sent to Hugging Face or another inference service.

Useful commands:

```bash
npm test
npm run build
npm run preview
```

## Sweep method

1. Detect the backends this browser exposes, and set WASM threads from `crossOriginIsolated` and core count.
2. Run the full-precision WASM reference first and keep its detections.
3. For each remaining configuration, create a fresh session, run one untimed warm-up, then record the timed runs.
4. Score every configuration against the reference: identical label plus bounding-box intersection-over-union of at least 0.5, then a symmetric match rate across both prediction sets.
5. Read each variant's weight size back from the browser cache.
6. Report median and p95, and export every raw run as JSON.

Agreement is computed on the image currently loaded, across a handful of boxes, so it is a pass or fail signal rather than a precise ranking. A 0% row means a configuration is broken. The gap between 86% and 75% is within the noise of a four-object image.

## Limits and responsible use

- YOLOS Tiny recognizes the COCO label set; it is not a general image-understanding system.
- The draft is a starting point, not authoritative alt text. Context and intent still require a person.
- Detection confidence and spatial heuristics can be wrong. Review every draft.
- The first visit needs network access to fetch model weights; later use benefits from the browser cache.
- The ONNX Runtime WASM binary is a larger download than the model weights, so weight-size reductions do not shrink the first visit as much as the model table suggests.
- Performance depends on hardware, browser, thermals, and current system load.

## Validate it on Arm64

1. Run `uname -m` and confirm the output is `arm64`.
2. Run `npm install`, then `npm run dev`.
3. Open the Vite URL and wait until the bundled sample shows detection boxes and a draft.
4. Check the status bar to see which backend and precision were selected on your device.
5. Select **Run sweep** and leave the tab open until every configuration completes.
6. Select **Export JSON** to keep the raw runs from your own device.
7. Run `npm test` and `npm run build` to validate the selection logic, the agreement metric and the production bundle.

## Hosting note

The app needs `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` to reach multi-threaded WASM. Netlify sends both. GitHub Pages cannot send either, so the Pages URL redirects to the Netlify host rather than serving a copy that silently falls back to a single thread.

## Technology and attribution

- React, TypeScript, and Vite
- [Transformers.js](https://huggingface.co/docs/transformers.js/) and ONNX Runtime Web, WebGPU and WASM backends
- [`Xenova/yolos-tiny`](https://huggingface.co/Xenova/yolos-tiny), an ONNX-compatible conversion of YOLOS Tiny
- Lucide icons and Inter Variable

FrameKind source is MIT licensed. Third-party models, packages, fonts, and icons retain their own licenses.

The model is pinned to Hugging Face revision `e2f9c7673f0fa61849efe2b56a0d7774779ebb9d` so the implementation and recorded weight sizes do not drift with the repository's `main` branch.

## AI assistance disclosure

OpenAI Codex assisted with ideation, implementation, testing, design exploration, and documentation. Claude Code assisted with the backend-selection work, the sweep harness, and this revision. YOLOS Tiny supplies object detection. The bundled sample image was generated for demonstration and testing. The entrant must review and approve the final project and contest submission.
