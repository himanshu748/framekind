import type { Detection } from "../types";

export function percentile(values: number[], fraction: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

function intersectionOverUnion(a: Detection["box"], b: Detection["box"]) {
  const left = Math.max(a.xmin, b.xmin);
  const top = Math.max(a.ymin, b.ymin);
  const right = Math.min(a.xmax, b.xmax);
  const bottom = Math.min(a.ymax, b.ymax);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const areaA = Math.max(0, a.xmax - a.xmin) * Math.max(0, a.ymax - a.ymin);
  const areaB = Math.max(0, b.xmax - b.xmin) * Math.max(0, b.ymax - b.ymin);
  const union = areaA + areaB - intersection;
  return union <= 0 ? 0 : intersection / union;
}

export function detectionAgreement(reference: Detection[], candidate: Detection[]) {
  if (reference.length === 0 && candidate.length === 0) return 1;
  const used = new Set<number>();
  let matches = 0;

  for (const expected of reference) {
    let bestIndex = -1;
    let bestOverlap = 0;
    candidate.forEach((actual, index) => {
      if (used.has(index) || actual.label !== expected.label) return;
      const overlap = intersectionOverUnion(expected.box, actual.box);
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestIndex = index;
      }
    });
    if (bestIndex >= 0 && bestOverlap >= 0.5) {
      used.add(bestIndex);
      matches += 1;
    }
  }

  return (2 * matches) / Math.max(1, reference.length + candidate.length);
}
