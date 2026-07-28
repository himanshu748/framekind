import { describe, expect, it } from "vitest";
import { costForShortestEdge, layerMacs, resizeToShortestEdge, tokenCount } from "./cost";

const SAMPLE_WIDTH = 1448;
const SAMPLE_HEIGHT = 1086;

describe("resizeToShortestEdge", () => {
  it("scales the bundled sample the way the processor does", () => {
    expect(resizeToShortestEdge(SAMPLE_WIDTH, SAMPLE_HEIGHT, 512)).toEqual({
      width: 683,
      height: 512,
    });
  });

  it("clamps on the longest edge for extreme aspect ratios", () => {
    expect(resizeToShortestEdge(4000, 500, 512, 1333)).toEqual({ width: 1333, height: 167 });
  });
});

describe("tokenCount", () => {
  it("counts patches plus the class and detection tokens", () => {
    expect(tokenCount(683, 512)).toBe(1445);
    expect(tokenCount(341, 256)).toBe(437);
  });
});

describe("layerMacs", () => {
  it("shows attention dominating at native resolution", () => {
    const native = layerMacs(1445);
    expect(native.attention).toBeGreaterThan(native.projectionAndMlp);
    expect(native.attention / native.total).toBeCloseTo(0.56, 2);
  });

  it("shows attention receding once tokens are cut", () => {
    const reduced = layerMacs(437);
    expect(reduced.attention).toBeLessThan(reduced.projectionAndMlp);
    expect(reduced.attention / reduced.total).toBeCloseTo(0.28, 2);
  });
});

describe("costForShortestEdge", () => {
  it("predicts the arithmetic saved by halving the shortest edge", () => {
    const native = costForShortestEdge(SAMPLE_WIDTH, SAMPLE_HEIGHT, 512);
    const halved = costForShortestEdge(SAMPLE_WIDTH, SAMPLE_HEIGHT, 256);

    expect(native.total / 1e9).toBeCloseTo(17.29, 1);
    expect(halved.total / 1e9).toBeCloseTo(3.2, 1);
    expect(native.total / halved.total).toBeCloseTo(5.4, 1);
  });

  it("cuts the quadratic term far harder than the linear one", () => {
    const native = costForShortestEdge(SAMPLE_WIDTH, SAMPLE_HEIGHT, 512);
    const halved = costForShortestEdge(SAMPLE_WIDTH, SAMPLE_HEIGHT, 256);

    const linearRatio = native.perLayer.projectionAndMlp / halved.perLayer.projectionAndMlp;
    const quadraticRatio = native.perLayer.attention / halved.perLayer.attention;

    expect(linearRatio).toBeCloseTo(3.31, 1);
    expect(quadraticRatio).toBeCloseTo(10.93, 1);
  });
});
