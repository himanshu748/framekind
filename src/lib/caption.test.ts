import { describe, expect, it } from "vitest";
import { generateAltText } from "./caption";

describe("generateAltText", () => {
  it("describes unique objects and their horizontal positions", () => {
    const text = generateAltText(
      [
        { label: "bicycle", score: 0.96, box: { xmin: 20, ymin: 10, xmax: 220, ymax: 180 } },
        { label: "person", score: 0.91, box: { xmin: 720, ymin: 20, xmax: 940, ymax: 210 } },
        { label: "potted plant", score: 0.88, box: { xmin: 430, ymin: 30, xmax: 570, ymax: 230 } },
      ],
      1000,
    );

    expect(text.startsWith("A ")).toBe(true);
    expect(text).toContain("bicycle");
    expect(text).toContain("person");
    expect(text).toContain("on the left");
    expect(text).toContain("on the right");
  });

  it("does not claim a low-confidence detection", () => {
    const text = generateAltText(
      [{ label: "cat", score: 0.2, box: { xmin: 0, ymin: 0, xmax: 10, ymax: 10 } }],
      100,
    );
    expect(text).toContain("No objects were detected");
  });

  it("uses a plural verb when one label has multiple detections", () => {
    const text = generateAltText(
      [
        { label: "person", score: 0.95, box: { xmin: 10, ymin: 0, xmax: 30, ymax: 80 } },
        { label: "person", score: 0.9, box: { xmin: 60, ymin: 0, xmax: 90, ymax: 80 } },
      ],
      100,
    );

    expect(text).toBe("2 people are visible.");
  });
});
