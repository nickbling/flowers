import { describe, expect, it } from "vitest";
import { fromHex, oklch, toHex } from "@/src/shared/color";

describe("oklch", () => {
  it("maps the extremes to pure white and black", () => {
    expect(oklch(1, 0, 0)).toBe("#ffffff");
    expect(oklch(0, 0, 0)).toBe("#000000");
  });

  it("always returns a valid hex color, even out of gamut", () => {
    expect(oklch(0.7, 0.4, 145)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("terminates for enormous chroma and rejects non-finite channels", () => {
    expect(oklch(0.5, 1e20, 20)).toMatch(/^#[0-9a-f]{6}$/);
    expect(() => oklch(0.5, Number.POSITIVE_INFINITY, 20)).toThrow(
      "must be finite"
    );
  });
});

describe("fromHex", () => {
  it("converts known sRGB primaries to OKLCH", () => {
    expect(fromHex("#ff0000")).toEqual({
      c: expect.closeTo(0.2577, 4),
      h: expect.closeTo(29.2339, 4),
      l: expect.closeTo(0.628, 4),
    });
    expect(fromHex("#ffffff")).toEqual({
      c: 0,
      h: 0,
      l: expect.closeTo(1, 7),
    });
  });

  it("round-trips in-gamut colors", () => {
    for (const color of ["#000000", "#ffffff", "#edabc0", "#1574c4"]) {
      expect(toHex(fromHex(color))).toBe(color);
    }
  });

  it("rejects shorthand, alpha and non-hex colors", () => {
    for (const color of ["#fff", "#ffffffff", "red", "123456"]) {
      expect(() => fromHex(color)).toThrow(TypeError);
    }
  });
});
