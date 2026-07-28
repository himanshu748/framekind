# Why the Arm wins came from the backend and the token count, not the weights

FrameKind's sweep produced a result that contradicts the standard advice for shrinking a browser model: quantizing YOLOS Tiny to UINT8 made it 64% smaller and produced no dependable speedup. Across three sweeps on the same Arm64 laptop the UINT8-versus-FP32 ratio on the WASM backend measured 0.99×, 0.62× and 1.54×, landing on either side of parity with machine load. This note explains why an absent speedup is the expected outcome on Arm in a browser, using a cost model that ships as tested code and the constraints of the runtime that actually executes the graph.

Everything labelled *modelled* comes from [`src/lib/cost.ts`](../src/lib/cost.ts) and is covered by [`src/lib/cost.test.ts`](../src/lib/cost.test.ts), so the arithmetic below is reproducible with `npm test` rather than asserted. Everything labelled *measured* is a range across three sweeps, one of which was deliberately run with competing inference sessions on the machine. Raw runs from the first are in [`submission-assets/sweep-apple-silicon-chromium.json`](../submission-assets/sweep-apple-silicon-chromium.json).

A methodological note that turned out to matter more than expected: on this hardware the WASM CPU path is the noisiest component in the system. The FP32 reference alone measured 3,154 ms, 3,444 ms and 7,441 ms across the three sweeps. Detection agreement, by contrast, was identical every time. Any argument built on a single CPU latency measurement here is measuring machine state, which is why the numbers below are ranges and why the app now takes five timed runs per configuration and reports p95 next to the median.

## Where the time goes

YOLOS Tiny is a plain vision transformer: a DeiT-tiny backbone with hidden size 192 and 12 layers, patch size 16, plus 100 learned detection tokens. Per layer, the projections and the MLP cost `12 · N · d²` multiply-accumulates and grow **linearly** in token count `N`. The two attention matmuls cost `2 · N² · d` and grow **quadratically**.

The processor resizes to a shortest edge of 512 by default, so the bundled 1448×1086 sample enters the network at 683×512. That is a 42×32 patch grid, so `N = 1 + 1344 + 100 = 1445`.

| Shortest edge | Input | Tokens | Total MACs | Attention share | Modelled vs 512 | Measured vs 512 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 512 | 683×512 | 1,445 | 17.29 G | 56% | 1.00× | 1.00× |
| 384 | 512×384 | 869 | 8.09 G | 43% | 2.14× | 1.75× to 2.63× |
| 256 | 341×256 | 437 | 3.20 G | 28% | 5.40× | 5.70× to 8.02× |

The measured column holds the UINT8 backend fixed and varies only the resolution, across three sweeps, so it isolates the token count from every other variable. The modelled ratio falls inside the measured range in both cases.

At native resolution **attention is the majority of the arithmetic**, 56% of it. That is the fact that makes input resolution the strongest single lever in this model: halving the shortest edge cuts the token count by 3.31× but cuts the quadratic attention term by 10.93×, so the expensive half of the network shrinks hardest. Measured speedup tends to run ahead of the modelled ratio, which is consistent with the activation working set falling at the same time. The attention score matrix alone is 1,445² entries per head at native resolution.

Quantization does not touch any of this. It changes how wide each operand is, not how many of them there are.

## Why UINT8 bought nothing in the browser

On native Arm, INT8 inference is fast because the ISA has instructions built for it:

- **`SDOT`** (the `dotprod` extension, Armv8.2-A onward) computes a 4-way 8-bit dot product with 32-bit accumulate in one instruction.
- **`SMMLA`** (the `i8mm` extension, Armv8.6-A onward) does an 8-bit matrix multiply-accumulate, which is a substantially larger win again for GEMM-shaped work.

Arm exposes these to frameworks through [KleidiAI](https://developer.arm.com/ai/kleidi-libraries) micro-kernels, which are integrated into XNNPACK (and so TensorFlow Lite and MediaPipe), llama.cpp, PyTorch and ExecuTorch, native ONNX Runtime, and MNN. The reported gains are real: Arm and the ExecuTorch team measured [over 20% better prefill performance](https://pytorch.org/blog/unleashing-ai-mobile/) on a Cortex-A v9 device from i8mm-based Int4 matmul kernels.

None of that is reachable from a browser. WebAssembly's shipped SIMD is `simd128`, a fixed 128-bit lane model with **no 8-bit dot product and no 8-bit matrix multiply instruction**. An INT8 GEMM compiled to `simd128` widens operands and accumulates over 128-bit lanes, which recovers little of the advantage that `SDOT` and `SMMLA` provide natively. The quantized graph also pays for `QuantizeLinear` and `DequantizeLinear` nodes around the matmuls, which is arithmetic the FP32 graph never runs.

The bridge that would close this gap is the WebAssembly **Relaxed SIMD** proposal, whose integer dot product instruction is intended to lower to VNNI on x86-64 and to the `SDOT` family on Arm. It is not wired into this runtime. The artifacts ONNX Runtime Web ships and that this project bundles are `ort-wasm-simd-threaded.wasm` and `ort-wasm-simd-threaded.jsep.wasm`, both fixed-SIMD builds, and dispatching quantized GEMM through relaxed SIMD integer dot product is still an [open feature request against ONNX Runtime](https://github.com/microsoft/onnxruntime/issues/22533), filed in October 2024. The reporter's own prototype measured roughly 1.15× through VNNI and explicitly had not validated the Arm `SDOT` path.

So the absent speedup is not an anomaly to explain away. It is what a quantized model should do when the target cannot execute the instructions that make quantization pay: with no mechanism pushing the ratio below 1.0, the measurement is free to wander around parity with whatever else the machine is doing, which is exactly what three sweeps showed.

## Why WebGPU won instead

WebGPU sidesteps the question. The work moves off the CPU, so the absence of `SDOT` in the wasm sandbox stops mattering. It was also the most reproducible configuration measured: WebGPU FP32 landed at 1,498 ms and 1,507 ms on the two sweeps where the machine was not loaded, while reproducing the reference detections exactly.

The sweep also found that quantizing *on* WebGPU is worse than useless here. WebGPU UINT8 was slower than WebGPU FP32 in every sweep and scored **0% detection agreement in every sweep**, meaning it did not find the reference objects at all. On that backend the quantized graph is not merely a bad trade, it is broken, and only the agreement guardrail surfaces that. A latency-only benchmark would have reported it as a mid-table result.

## What this means for the product

FrameKind picks the fastest configuration that reproduces the reference detections exactly, which on a WebGPU-capable Arm device is WebGPU FP32. Quantization is kept as the WASM fallback, where the download saving is real even though the latency saving is not, and where no better lever exists.

Input resolution is deliberately left out of the default. It is the largest lever available, worth roughly 6× to 8× on the same backend, but it is the one that changes what the model can see, and this is an accessibility tool where a missed object becomes a missing sentence in someone's alt text. It belongs in the sweep, where a user can see the cost, rather than silently in the default.

## What would change the conclusion

- **Relaxed SIMD dispatch landing in ONNX Runtime Web.** If quantized GEMM reaches `SDOT` or `SMMLA` through relaxed SIMD, the WASM UINT8 row should move for the first time, and it should move most on Armv8.6 and later cores that have `i8mm`.
- **A device without WebGPU.** Then the CPU path is the only path, and the ranking in the table above is the whole story.
- **A larger input or a larger backbone.** Attention share rises with token count, so the resolution lever gets stronger and the precision lever gets relatively weaker.

Each of these is a rerun of the sweep, not a rewrite of the app, which is the point of shipping the benchmark rather than its output.

## Limits of this analysis

The cost model counts multiply-accumulates in the transformer encoder. It does not model the patch embedding convolution, layer norms, softmax, the detection heads, or memory bandwidth, and it assumes the runtime achieves similar utilisation across configurations. The attribution of the null quantization result to missing Arm INT8 instructions rests on the shipped runtime artifacts and the open upstream issue rather than on a disassembly of the wasm binary or a per-operator profile. A per-op profile on a device with and without `i8mm` would settle it directly and is the obvious next experiment.
