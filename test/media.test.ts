import { describe, expect, it } from "vitest";
import {
  assertFlowerMediaReport,
  type FlowerMediaFrame,
  type FlowerMediaReport,
  normalizedChromaticDistance,
  reviewFlowerMediaFrames,
} from "@/src/devkit/media";

function frame(overrides: Partial<FlowerMediaFrame> = {}): FlowerMediaFrame {
  const defaults: FlowerMediaFrame = {
    centerX: 0.5,
    centerY: 0.5,
    coverage: 0.52,
    height: 0.85,
    meanColor: [216, 177, 124],
    width: 0.85,
  };
  return Object.freeze({
    ...defaults,
    ...overrides,
  });
}

function report(issues: FlowerMediaReport["issues"]): FlowerMediaReport {
  const reference = frame();
  return Object.freeze({
    gl: reference,
    issues,
    silhouetteOverlap: 0.82,
    spatialColorDifference: 0.08,
    specimen: Object.freeze({
      genomeId: "flower/1/example/reference",
      species: "@garden/example:flower",
    }),
    svg: reference,
  });
}

describe("cross-media flower contract", () => {
  it("compares pigment independently from proportional exposure", () => {
    expect(
      normalizedChromaticDistance([240, 120, 120], [120, 60, 60])
    ).toBeCloseTo(0, 12);
    expect(
      normalizedChromaticDistance([255, 64, 64], [64, 64, 255])
    ).toBeGreaterThan(0.4);
  });

  it("accepts the deliberate translation range between SVG and GL", () => {
    const issues = reviewFlowerMediaFrames(
      frame(),
      frame({
        centerX: 0.51,
        coverage: 0.44,
        height: 0.82,
        meanColor: [202, 166, 120],
        width: 0.82,
      }),
      { silhouetteOverlap: 0.9, spatialColorDifference: 0.12 }
    );

    expect(issues).toEqual([]);
    expect(Object.isFrozen(issues)).toBe(true);
    expect(() => assertFlowerMediaReport(report(issues))).not.toThrow();
  });

  it("rejects a renderer pair that no longer depicts the same flower", () => {
    const issues = reviewFlowerMediaFrames(
      frame(),
      frame({
        centerX: 0.68,
        coverage: 0.15,
        height: 0.58,
        meanColor: [0, 245, 255],
        width: 0.6,
      }),
      { silhouetteOverlap: 0.42, spatialColorDifference: 0.34 }
    );

    expect(issues.map((issue) => issue.code)).toEqual([
      "framing-mismatch",
      "silhouette-mismatch",
      "palette-mismatch",
    ]);
    expect(() => assertFlowerMediaReport(report(issues))).toThrow(
      "flower media contract failed for @garden/example:flower"
    );
  });

  it("rejects spatial pigment drift hidden by identical aggregate colors", () => {
    const issues = reviewFlowerMediaFrames(frame(), frame(), {
      silhouetteOverlap: 0.9,
      spatialColorDifference: 0.23,
    });

    expect(issues.map((issue) => issue.code)).toEqual(["palette-mismatch"]);
  });
});
