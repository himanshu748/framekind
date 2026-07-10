import { describe, expect, it } from "vitest";
import { detectionAgreement, percentile } from "./benchmark";

describe("benchmark helpers", () => {
  it("computes a nearest-rank percentile", () => {
    expect(percentile([12, 8, 20, 10, 9], 0.5)).toBe(10);
    expect(percentile([12, 8, 20, 10, 9], 0.95)).toBe(20);
  });

  it("scores matching labels and boxes", () => {
    const first = [{ label: "person", score: 0.9, box: { xmin: 0, ymin: 0, xmax: 100, ymax: 100 } }];
    const second = [{ label: "person", score: 0.8, box: { xmin: 5, ymin: 5, xmax: 95, ymax: 95 } }];
    expect(detectionAgreement(first, second)).toBe(1);
  });
});
