import { describe, expect, it } from "vitest";
import { formatBytes, weightFileName } from "./weights";

describe("weightFileName", () => {
  it("maps each dtype to its published ONNX file", () => {
    expect(weightFileName("fp32")).toBe("model.onnx");
    expect(weightFileName("fp16")).toBe("model_fp16.onnx");
    expect(weightFileName("uint8")).toBe("model_uint8.onnx");
    expect(weightFileName("q4")).toBe("model_q4.onnx");
  });
});

describe("formatBytes", () => {
  it("reports megabytes to two decimals", () => {
    expect(formatBytes(26227993)).toBe("25.01 MB");
  });

  it("says so rather than guessing when the size is unknown", () => {
    expect(formatBytes(undefined)).toBe("not measured");
  });
});
