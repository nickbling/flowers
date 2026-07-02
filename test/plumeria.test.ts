import { describe, expect, it } from "vitest";
import { BLOOM_CSS, cultivar, plumeria } from "../src";

const ids = (svg: string) =>
  [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);

describe("plumeria", () => {
  const seed = "2026-06-14";

  it("is deterministic for a given seed and theme", () => {
    expect(plumeria({ seed })).toBe(plumeria({ seed }));
    expect(plumeria({ seed, theme: "dark" })).toBe(
      plumeria({ seed, theme: "dark" })
    );
  });

  it("changes with the seed", () => {
    expect(plumeria({ seed })).not.toBe(plumeria({ seed: "another" }));
  });

  it("keeps the same structure across themes, with different colors", () => {
    const light = plumeria({ seed });
    const dark = plumeria({ seed, theme: "dark" });
    const paths = (svg: string) => svg.split("<path").length;

    expect(light).not.toBe(dark);
    expect(paths(light)).toBe(paths(dark));
  });

  it("grows five petals", () => {
    expect(plumeria({ seed }).match(/<g id="[^"]*g\d"/g)).toHaveLength(5);
  });

  it("never reuses ids across themes", () => {
    const light = new Set(ids(plumeria({ seed })));
    const dark = ids(plumeria({ seed, theme: "dark" }));

    expect(dark.length).toBeGreaterThan(0);
    expect(dark.some((id) => light.has(id))).toBe(false);
  });

  it("references only ids it defines", () => {
    const svg = plumeria({ seed });
    const defined = new Set(ids(svg));
    const refs = [...svg.matchAll(/(?:url\(#|href="#)([^")]+)/g)].map(
      (m) => m[1]
    );

    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      expect(defined).toContain(ref);
    }
  });

  it("stays a still document even when the bloom hooks are on", () => {
    expect(plumeria({ seed })).not.toContain("data-petal");

    const hooked = plumeria({ seed, bloom: true });
    expect(hooked).not.toContain("<style>");
    expect(hooked).not.toContain("@keyframes");
    for (let i = 0; i < 5; i++) {
      expect(hooked).toContain(` data-petal="${i}"`);
    }
    expect(hooked).toContain("data-corolla");
    expect(BLOOM_CSS).toContain("prefers-reduced-motion");
    for (const hook of ["[data-petal]", "[data-corolla]", "[data-fade]"]) {
      expect(BLOOM_CSS).toContain(hook);
    }
  });

  it("stays bare by default and casts a shadow only when asked", () => {
    expect(plumeria({ seed })).not.toContain("dropf");
    expect(plumeria({ seed, shadow: true })).toContain("dropf");
    expect(plumeria({ seed, shadow: true, theme: "dark" })).not.toContain(
      "dropf"
    );
  });

  it("is bare by default and rests on a ground glow only when asked", () => {
    expect(plumeria({ seed })).not.toContain("ambient");
    expect(plumeria({ seed, glow: true })).toContain("ambient");
  });

  it("produces a self-contained svg document", () => {
    const svg = plumeria({ seed, size: 240 });

    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain('width="240"');
    expect(svg).toContain('viewBox="0 0 480 480"');
  });

  it("stays numerically sound and reasonably sized", () => {
    for (let i = 0; i < 60; i++) {
      const date = new Date(Date.UTC(2026, 0, 1 + i))
        .toISOString()
        .slice(0, 10);

      for (const theme of ["light", "dark"] as const) {
        // every opt-in at once: the heaviest document a consumer can ask for
        const svg = plumeria({
          bloom: true,
          date,
          glow: true,
          seed: date,
          shadow: true,
          theme,
        });

        expect(svg).not.toMatch(/NaN|Infinity|undefined/);
        expect(svg.length).toBeLessThan(48_000);
      }
    }
  });
});

describe("cultivar", () => {
  const seed = "2026-06-14";

  it("names the same flower plumeria draws", () => {
    expect(plumeria({ seed })).toContain(`A ${cultivar({ seed })} plumeria`);
  });

  it("pales under a full moon without changing the cultivar", () => {
    const full = plumeria({ date: "2000-01-21", seed });
    const ordinary = plumeria({ date: "2000-01-13", seed });

    expect(full).not.toBe(ordinary);
    expect(full).toContain(`A ${cultivar({ seed })} plumeria`);
    expect(ordinary).toContain(`A ${cultivar({ seed })} plumeria`);
  });
});
