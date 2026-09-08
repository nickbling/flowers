import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  BLOOM_CSS,
  cultivar,
  definePlumeriaCultivar,
  getPlumeriaVariant,
  plumeria,
  plumeriaCultivarNames,
  plumeriaVariants,
} from "@/src";
import {
  pigmentMarkSection,
  preparePigmentMarks,
} from "@/src/plumeria/markings";
import { curlBand, laminaPoint, petalOutline } from "@/src/plumeria/petal";
import { evaluatePlumeriaPigment } from "@/src/plumeria/pigment";
import { growPlumeria } from "@/src/plumeria/specimen";

const ids = (svg: string) =>
  [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);

// The shared pigment illustration remains a sub-7 KiB transfer while
// the raw standalone document stays below 50 KiB.
const MAX_GZIP_BYTES = 7000;

describe("plumeria", () => {
  const seed = "2026-06-14";

  it("is deterministic for a given seed", () => {
    expect(plumeria({ seed })).toBe(plumeria({ seed }));
  });

  it("rejects an empty seed at the shared SVG and GL boundary", () => {
    expect(() => plumeria({ seed: "" })).toThrow("seed must not be empty");
    expect(() => growPlumeria("")).toThrow("seed must not be empty");
  });

  it("changes with the seed", () => {
    expect(plumeria({ seed })).not.toBe(plumeria({ seed: "another" }));
  });

  it("shares an immutable specimen across renderers", () => {
    const specimen = growPlumeria(seed);

    expect(Object.isFrozen(specimen)).toBe(true);
    expect(Object.isFrozen(specimen.form.over)).toBe(true);
    expect(Object.isFrozen(specimen.genome.body)).toBe(true);
  });

  it("grows five petals", () => {
    const svg = plumeria({ seed });
    expect(svg.match(/<g id="[^"]*g\d"/g)).toHaveLength(5);
    expect(svg.match(/href="#[^"]*roll"/g)).toHaveLength(5);
    expect(svg).not.toContain("rollcrease");
  });

  it("keeps the painted edge roll narrow and subordinate", () => {
    const form = growPlumeria("8").form;
    const coordinates = (path: string) =>
      [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map(([value]) => Number(value));
    const band = coordinates(curlBand(form));
    const points = Array.from({ length: band.length / 2 }, (_, index) => [
      band[2 * index],
      band[2 * index + 1],
    ]);
    const twiceArea = points.reduce((area, point, index) => {
      const next = points[(index + 1) % points.length];
      return area + point[0] * next[1] - next[0] * point[1];
    }, 0);
    const area = Math.abs(twiceArea) / 2;
    expect(area).toBeGreaterThan(form.length ** 2 * 0.025);
    expect(area).toBeLessThan(form.length ** 2 * 0.045);

    const svg = plumeria({ seed: "8" });
    for (const key of ["lobe", "curl"]) {
      const gradient = svg.match(
        new RegExp(
          `<linearGradient id="[^"]*${key}"[^>]*>[\\s\\S]*?</linearGradient>`
        )
      )?.[0];
      const opacities = [
        ...(gradient?.matchAll(/stop-opacity(?:="|:)([\d.]+)/g) ?? []),
      ].map(([, opacity]) => Number(opacity));
      expect(Math.max(...opacities)).toBeGreaterThan(0.1);
      expect(Math.min(...opacities)).toBeLessThan(0.1);
    }
  });

  it.each([
    "reference",
    "2026-06-14",
    "hello",
    "shape-67",
    "shape-110",
    "shape-165",
  ])("resolves the %s SVG tip against the actual petal curve", (caseSeed) => {
    const { form } = growPlumeria(caseSeed);
    const curves = [...petalOutline(form).matchAll(/C ([^CZ]+)/g)].map(
      (match) => match[1].trim().split(/\s+/).map(Number)
    );
    const canonical = [-1, 1].flatMap((side) =>
      Array.from({ length: 4001 }, (_, i) =>
        laminaPoint(form, side as -1 | 1, 1 - 0.1 * (1 - i / 4000) ** 2, 1)
      )
    );
    let maximumError = 0;
    const tip = curves.length / 2;
    for (let index = tip - 2; index <= tip + 1; index += 1) {
      const start = curves[index - 1].slice(4),
        curve = curves[index];
      for (let i = 0; i <= 20; i += 1) {
        const t = i / 20,
          s = 1 - t;
        const point = [0, 1].map(
          (axis) =>
            s ** 3 * start[axis] +
            3 * s * s * t * curve[axis] +
            3 * s * t * t * curve[axis + 2] +
            t ** 3 * curve[axis + 4]
        );
        let distance = Infinity;
        for (const [x, y] of canonical)
          distance = Math.min(
            distance,
            (point[0] - x) ** 2 + (point[1] - y) ** 2
          );
        maximumError = Math.max(maximumError, Math.sqrt(distance));
      }
    }
    expect(maximumError / form.length).toBeLessThan(2e-4);
  });

  it("lets the petal bases meet without a registration point", () => {
    const svg = plumeria({ seed });
    expect(svg).not.toContain("<circle");
    expect(svg).not.toContain('tube"');
  });

  it("keeps a narrow contact shadow near the petal bases without a dark center disk", () => {
    const svg = plumeria({ seed });
    const length = growPlumeria(seed).form.length;
    const hub = svg.match(
      /<radialGradient id="[^"]*hub"[^>]*r="([\d.]+)"[^>]*>([\s\S]*?)<\/radialGradient>/
    );
    expect(Number(hub?.[1]) / length).toBeLessThan(0.06);
    expect(hub?.[2]).toMatch(/offset="0"[^>]*stop-color:#000/);
    const contact =
      svg.match(/<filter id="[^"]*contact"[^>]*>[\s\S]*?<\/filter>/)?.[0] ?? "";
    expect(Number(contact.match(/stdDeviation="([\d.]+)"/)?.[1])).toBeLessThan(
      1
    );
  });

  it("uses disjoint ids for different specimens", () => {
    const first = new Set(ids(plumeria({ seed })));
    const second = ids(plumeria({ seed: `${seed}-second` }));

    expect(second.length).toBeGreaterThan(0);
    expect(second.some((id) => first.has(id))).toBe(false);
  });

  it("namespaces repeated inline specimens on demand", () => {
    const first = new Set(ids(plumeria({ idPrefix: "card-one", seed })));
    const second = ids(plumeria({ idPrefix: "card-two", seed }));

    expect(second.every((id) => id.startsWith("pcard-two-"))).toBe(true);
    expect(second.some((id) => first.has(id))).toBe(false);
    expect(() => plumeria({ idPrefix: "invalid prefix", seed })).toThrow(
      "idPrefix"
    );
  });

  it("names different moon exposures independently on the same page", () => {
    const ordinary = new Set(ids(plumeria({ date: "2000-01-13", seed })));
    const fullMoon = ids(plumeria({ date: "2000-01-21", seed }));

    expect(fullMoon.some((id) => ordinary.has(id))).toBe(false);
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

  it("protects every paintable shape from ordinary host CSS", () => {
    const svg = plumeria({ seed });
    const shapes = [...svg.matchAll(/<(path|use|ellipse)\b[^>]*>/g)].map(
      ([element]) => element
    );

    expect(shapes.length).toBeGreaterThan(0);
    for (const element of shapes) {
      expect(element).toMatch(/style="[^"]*fill:/);
      expect(element).toMatch(/style="[^"]*stroke:/);
    }
  });

  it("stays a still document even when the bloom hooks are on", () => {
    expect(plumeria({ seed })).not.toContain("data-petal");

    const hooked = plumeria({ seed, bloom: true });
    expect(hooked).not.toContain("<style>");
    expect(hooked).not.toContain("@keyframes");
    for (const i of Array(5).keys()) {
      expect(hooked).toContain(` data-petal="${i}"`);
    }
    expect(hooked.match(/data-petal=/g)).toHaveLength(10);
    expect(hooked).toMatch(
      /<g data-petal="4"[^>]*><g style="clip-path:url\(#p[^"]*wedge\)"/
    );
    expect(
      plumeria({ bloom: true, glow: true, seed, shadow: true }).match(
        /data-fade=/g
      )
    ).toHaveLength(2);
    expect(hooked).toContain('data-corolla=""');
    expect(hooked).not.toMatch(/\sdata-[\w-]+(?=\s|>)/);
    expect(BLOOM_CSS).toContain("prefers-reduced-motion");
    for (const hook of ["[data-petal]", "[data-corolla]", "[data-fade]"]) {
      expect(BLOOM_CSS).toContain(hook);
    }
  });

  it("stays bare by default and casts a shadow only when asked", () => {
    expect(plumeria({ seed })).not.toContain("dropf");
    expect(plumeria({ seed, shadow: true })).toContain("dropf");
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

  it("validates its presentation size and keeps zero-reach gradients legal", () => {
    expect(() => plumeria({ seed, size: 0 })).toThrow("integer from 1 to 4096");
    expect(() => plumeria({ seed, size: 1.5 })).toThrow(
      "integer from 1 to 4096"
    );
    for (const date of ["not-a-date", "2026-02-30", "2026-7-1"])
      expect(() => plumeria({ date, seed })).toThrow("valid YYYY-MM-DD");

    const noThroat = definePlumeriaCultivar({
      body: { base: "#fffdf7" },
      name: "No throat",
      throat: { color: "#f2bd22", reach: 0 },
    });
    const svg = plumeria({ cultivar: noThroat, seed });

    expect(svg).not.toMatch(
      /<(?:ellipse|radialGradient)\b[^>]*\br="0(?:\.0+)?"/
    );
    expect(svg).not.toMatch(/<ellipse\b[^>]*\br[xy]="0(?:\.0+)?"/);
  });

  it("stays numerically sound and reasonably sized", () => {
    for (const i of Array(60).keys()) {
      const date = new Date(Date.UTC(2026, 0, 1 + i))
        .toISOString()
        .slice(0, 10);

      // every opt-in at once: the heaviest document a consumer can ask for
      const svg = plumeria({
        bloom: true,
        date,
        glow: true,
        seed: date,
        shadow: true,
      });

      expect(svg).not.toMatch(/NaN|Infinity|undefined/);
      expect(svg.length).toBeLessThan(50_000);
      expect(gzipSync(svg).length).toBeLessThan(MAX_GZIP_BYTES);
    }
  });

  it("keeps heavy standalone documents below the size budget", () => {
    for (const index of Array(300).keys()) {
      const svg = plumeria({
        bloom: true,
        glow: true,
        seed: `size-budget-${index}`,
        shadow: true,
      });
      expect(svg.length).toBeLessThan(50_000);
      expect(gzipSync(svg).length).toBeLessThan(MAX_GZIP_BYTES);
    }
  });
});

describe("plumeria catalog", () => {
  it("uses stable semantic identities for every maintained variant", () => {
    const ids = plumeriaVariants.map((variant) => variant.id);

    expect(plumeriaVariants).toHaveLength(64);
    expect(new Set(ids).size).toBe(64);
    expect(plumeriaCultivarNames).toEqual([
      "celadine",
      "gold",
      "sunset",
      "rainbow",
      "pink pearl",
      "candy stripe",
      "fuchsia",
      "carmine",
    ]);
    expect(
      plumeriaVariants.filter(({ kind }) => kind === "cultivar")
    ).toHaveLength(plumeriaCultivarNames.length);
    expect(
      plumeriaVariants.filter(({ kind }) => kind === "hybrid")
    ).toHaveLength(56);
    for (const id of ids) {
      expect(id).toMatch(
        /^@nbot\/flowers:plumeria\/[a-z]+(?:-[a-z]+)*(?:-x-[a-z]+(?:-[a-z]+)*)?$/
      );
      expect(id).not.toMatch(/catalog-\d+/);
    }
  });

  it("keeps variant identity separate from individual seed variation", () => {
    const variant = getPlumeriaVariant(
      "@nbot/flowers:plumeria/celadine-x-rainbow"
    );

    const first = growPlumeria("first", 0, undefined, variant);
    const second = growPlumeria("second", 0, undefined, variant);

    expect(first.genome.cultivar).toBe("celadine × rainbow");
    expect(second.genome.cultivar).toBe("celadine × rainbow");
    expect(first.uid).not.toBe(second.uid);
    expect(cultivar({ seed: "reference", variant })).toBe("celadine × rainbow");
    expect(plumeria({ seed: "reference", variant })).toContain(
      "A celadine × rainbow plumeria"
    );
    expect(() => getPlumeriaVariant("@nbot/flowers:plumeria/unknown")).toThrow(
      "unsupported plumeria variant"
    );
  });
});

describe("cultivar pigment", () => {
  const noLivery = {
    blush2At: 0.5,
    blush2Mix: null,
    blush2Opacity: 0,
    blush2Width: 0.18,
    halo: 0,
    stripeSide: 0.5,
    stripeVisible: false,
  } as const;
  const distance = (
    first: Readonly<{ c: number; h: number; l: number }>,
    second: Readonly<{ c: number; h: number; l: number }>
  ) =>
    Math.hypot(
      first.c - second.c,
      (((((first.h - second.h) % 360) + 540) % 360) - 180) / 360,
      first.l - second.l
    );

  it("turns the ray genome into radial pigment structure", () => {
    const specimen = growPlumeria(
      "ray-proof",
      0,
      undefined,
      getPlumeriaVariant("@nbot/flowers:plumeria/rainbow")
    );
    const quiet = {
      ...specimen.genome,
      blush: { ...specimen.genome.blush, strength: 0 },
      margin: { ...specimen.genome.margin, strength: 0 },
      throat: { ...specimen.genome.throat, rays: 0 },
      veins: { ...specimen.genome.veins, strength: 0 },
    };
    const rayed = {
      ...quiet,
      throat: { ...quiet.throat, rays: 1 },
    };
    const differences = Array.from({ length: 101 }, (_, index) => {
      const across = index / 50 - 1;
      return distance(
        evaluatePlumeriaPigment(rayed, noLivery, 0.42, across),
        evaluatePlumeriaPigment(quiet, noLivery, 0.42, across)
      );
    });

    expect(Math.max(...differences)).toBeGreaterThan(0.025);
    expect(Math.max(...differences) - Math.min(...differences)).toBeGreaterThan(
      0.015
    );
  });

  it("turns the vein genome into fine pigment contrast", () => {
    const specimen = growPlumeria(
      "vein-proof",
      0,
      undefined,
      getPlumeriaVariant("@nbot/flowers:plumeria/carmine")
    );
    const quiet = {
      ...specimen.genome,
      blush: { ...specimen.genome.blush, strength: 0 },
      margin: { ...specimen.genome.margin, strength: 0 },
      throat: { ...specimen.genome.throat, rays: 0 },
      veins: { ...specimen.genome.veins, strength: 0 },
    };
    const veined = {
      ...quiet,
      veins: { ...quiet.veins, strength: 1 },
    };
    // Measure along the inherited curves, not between narrow veins on a grid.
    const veins = preparePigmentMarks("", veined, noLivery).filter(
      (mark) => mark.kind === "vein"
    );
    const maximumDifference = Math.max(
      ...veins.flatMap((mark) =>
        [0.25, 0.5, 0.75].map((progress) => {
          const along = mark.from + (mark.to - mark.from) * progress;
          const across = pigmentMarkSection(mark, along).center;
          return distance(
            evaluatePlumeriaPigment(veined, noLivery, along, across),
            evaluatePlumeriaPigment(quiet, noLivery, along, across)
          );
        })
      )
    );

    expect(maximumDifference).toBeGreaterThan(0.04);
  });

  it("guarantees every named Candy Stripe specimen an interior stripe", () => {
    const variant = getPlumeriaVariant("@nbot/flowers:plumeria/candy-stripe");
    for (const index of Array(32).keys()) {
      expect(
        growPlumeria(`candy-stripe-${index}`, 0, undefined, variant).livery
          .stripeVisible
      ).toBe(true);
    }

    const specimen = growPlumeria("stripe-proof", 0, undefined, variant);
    const quiet = {
      ...specimen.genome,
      blush: { ...specimen.genome.blush, strength: 0 },
      margin: { ...specimen.genome.margin, strength: 0 },
      throat: { ...specimen.genome.throat, rays: 0 },
      veins: { ...specimen.genome.veins, strength: 0 },
    };
    const stripeCenter = 0.7 * noLivery.stripeSide;
    const stripe = evaluatePlumeriaPigment(quiet, noLivery, 0.56, stripeCenter);
    const oppositeSide = evaluatePlumeriaPigment(
      quiet,
      noLivery,
      0.56,
      -stripeCenter
    );
    expect(distance(stripe, oppositeSide)).toBeGreaterThan(0.035);
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
