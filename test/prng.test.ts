import { describe, expect, it } from "vitest";
import { between, createRng } from "@/src/shared/prng";

describe("createRng", () => {
  it("is deterministic for a seed", () => {
    const a = createRng("seed");
    const b = createRng("seed");
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("diverges for similar seeds", () => {
    expect(createRng("seed-1")()).not.toBe(createRng("seed-2")());
  });

  it("returns values in [0, 1)", () => {
    const rng = createRng("range");
    for (const _ of Array(1000)) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("between stays within its bounds", () => {
    const rng = createRng("between");
    for (const _ of Array(1000)) {
      const v = between(rng, 5, 10);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThan(10);
    }
  });
});
