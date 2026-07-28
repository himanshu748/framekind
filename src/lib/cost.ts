export const YOLOS_TINY = {
  hiddenSize: 192,
  layers: 12,
  patchSize: 16,
  detectionTokens: 100,
};

export const NATIVE_LONGEST_EDGE = 1333;

export function resizeToShortestEdge(
  width: number,
  height: number,
  shortestEdge: number,
  longestEdge = NATIVE_LONGEST_EDGE,
) {
  let scale = shortestEdge / Math.min(width, height);
  if (Math.max(width, height) * scale > longestEdge) {
    scale = longestEdge / Math.max(width, height);
  }
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export function tokenCount(width: number, height: number, model = YOLOS_TINY) {
  const patches =
    Math.floor(height / model.patchSize) * Math.floor(width / model.patchSize);
  return 1 + patches + model.detectionTokens;
}

/**
 * YOLOS Tiny is a plain ViT, so per layer the projections and MLP grow linearly
 * with token count while the two attention matmuls grow quadratically. Splitting
 * the two terms is the whole point: it shows which knob attacks which term.
 */
export function layerMacs(tokens: number, model = YOLOS_TINY) {
  const projectionAndMlp = 12 * tokens * model.hiddenSize * model.hiddenSize;
  const attention = 2 * tokens * tokens * model.hiddenSize;
  return { projectionAndMlp, attention, total: projectionAndMlp + attention };
}

export function modelMacs(width: number, height: number, model = YOLOS_TINY) {
  const tokens = tokenCount(width, height, model);
  const perLayer = layerMacs(tokens, model);
  return {
    tokens,
    perLayer,
    total: perLayer.total * model.layers,
    attentionShare: perLayer.attention / perLayer.total,
  };
}

export function costForShortestEdge(
  naturalWidth: number,
  naturalHeight: number,
  shortestEdge: number,
) {
  const resized = resizeToShortestEdge(naturalWidth, naturalHeight, shortestEdge);
  return { resized, ...modelMacs(resized.width, resized.height) };
}
