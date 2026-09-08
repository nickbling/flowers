import {
  LinearFilter,
  LinearMipmapLinearFilter,
  type Mesh,
  type MeshPhysicalMaterial,
  SRGBColorSpace,
} from "three";
import { describe, expect, it } from "vitest";
import { getPlumeriaVariant, plumeria } from "@/src";
import { petalGeometry } from "@/src/gl/loft";
import { createPlumeriaPigment } from "@/src/gl/plumeria-pigment";
import { plumeriaScene } from "@/src/gl/plumeria-scene";
import { sampleRelief } from "@/src/gl/plumeria-surface";
import {
  pigmentMarkSection,
  pigmentMarkWeight,
  pigmentSectionWeight,
  preparePigmentMarks,
} from "@/src/plumeria/markings";
import { laminaPoint, marginBand, veinsPath } from "@/src/plumeria/petal";
import { preparePetalPaint } from "@/src/plumeria/petal-paint";
import {
  lightTone,
  preparePlumeriaPigment,
  throatExtent,
  throatRayExtent,
  vectorTone,
} from "@/src/plumeria/pigment";
import { growPlumeria, sprout } from "@/src/plumeria/specimen";
import { toHex } from "@/src/shared/color";
import { between, createRng, intBetween } from "@/src/shared/prng";

const variant = getPlumeriaVariant("@nbot/flowers:plumeria/candy-stripe");

describe("shared plumeria pigment markings", () => {
  it("keeps pigment in petal coordinates rather than the canonical projection", () => {
    const specimen = growPlumeria("reference", 0, undefined, variant);
    const marks = preparePigmentMarks(
      "reference",
      specimen.genome,
      specimen.livery
    );
    const reshaped = {
      ...specimen,
      form: {
        ...specimen.form,
        bend: specimen.form.bend + 0.5,
        over: { ...specimen.form.over, width: specimen.form.over.width * 1.4 },
      },
    };
    const first = createPlumeriaPigment(specimen, marks);
    const second = createPlumeriaPigment(reshaped, marks);
    try {
      const a = first.image.data,
        b = second.image.data;
      if (!a || !b) throw new Error("missing pigment pixels");
      expect(Buffer.from(b).equals(Buffer.from(a))).toBe(true);
    } finally {
      first.dispose();
      second.dispose();
    }
  });

  it("uses inherited unlit mark lightness instead of baking a dark core", () => {
    const specimen = growPlumeria("reference", 0, undefined, variant);
    const genome = {
      ...specimen.genome,
      throat: { ...specimen.genome.throat, reach: 0, rays: 0 },
      margin: { ...specimen.genome.margin, strength: 0 },
      blush: { ...specimen.genome.blush, strength: 0 },
    };
    const livery = { ...specimen.livery, halo: 0, blush2Mix: null };
    for (const kind of ["stripe", "ray"] as const) {
      const mark = {
        kind,
        from: 0.3,
        to: 0.9,
        start: 0,
        end: 0,
        bow: 0,
        width: 0.25,
        opacity: 1,
      };
      const tone = preparePlumeriaPigment(genome, livery, [mark])(0.6)(0);
      const inherited =
        kind === "stripe" ? genome.margin.tone : genome.throat.tone;
      expect(tone.l).toBeCloseTo(inherited.l, 12);
    }
  });

  it("treats the halo as a chromatic wash rather than a ring of shade", () => {
    const { genome, livery } = growPlumeria("reference", 0, undefined, variant);
    const clear = preparePlumeriaPigment(genome, { ...livery, halo: 0 }, []);
    const stained = preparePlumeriaPigment(
      genome,
      { ...livery, halo: 0.2 },
      []
    );
    for (const along of [0.65, 0.59, 0.75, 0.48, 0.37])
      for (const across of [-0.7, 0, 0.7]) {
        const a = clear(along)(across);
        const b = stained(along)(across);
        expect(b.l).toBeCloseTo(a.l, 12);
        expect(Math.hypot(b.c - a.c, b.h - a.h)).toBeGreaterThan(0);
      }
  });

  it("grades pale pigment continuously instead of introducing a chroma contour", () => {
    for (const grade of [lightTone, vectorTone]) {
      const below = grade({ c: 0.04 - 1e-7, h: 85, l: 0.95 });
      const above = grade({ c: 0.04 + 1e-7, h: 85, l: 0.95 });
      expect(Math.abs(above.c - below.c)).toBeLessThan(1e-6);
      expect(Math.abs(above.l - below.l)).toBeLessThan(1e-6);
      expect(above.h).toBe(below.h);
    }
  });

  it("prepares immutable, seed-dependent curved ribbons with tapered compact support", () => {
    const { genome, livery } = growPlumeria("reference", 0, undefined, variant);
    const marks = preparePigmentMarks("reference", genome, livery);
    expect(marks).toEqual(preparePigmentMarks("reference", genome, livery));
    expect(marks).not.toEqual(preparePigmentMarks("other", genome, livery));
    expect(Object.isFrozen(marks)).toBe(true);
    expect(marks.filter((mark) => mark.kind === "stripe")).toHaveLength(1);
    for (const mark of marks) {
      expect(Object.isFrozen(mark)).toBe(true);
      const along = (mark.from + mark.to) / 2;
      const { center, width } = pigmentMarkSection(mark, along);
      expect(width).toBeCloseTo(mark.width, 12);
      expect(center).toBeCloseTo((mark.start + mark.end) / 2 + mark.bow, 12);
      expect(pigmentMarkWeight(mark, along, center)).toBeCloseTo(
        mark.opacity,
        12
      );
      expect(pigmentMarkWeight(mark, along, center + width * 0.5)).toBeCloseTo(
        mark.opacity * 0.5,
        12
      );
      expect(pigmentMarkWeight(mark, along, center + width * 1.01)).toBe(0);
      expect(pigmentMarkWeight(mark, mark.from, mark.start)).toBe(0);
      expect(pigmentMarkWeight(mark, mark.to, mark.end)).toBe(0);
      expect(Math.abs(center) + width).toBeLessThan(1);
    }
  });

  it("keeps the color profile flat at the center of each wash", () => {
    const section = { center: 0.2, width: 0.3, fade: 1 };
    expect(
      1 - pigmentSectionWeight(section, section.center + section.width * 1e-4)
    ).toBeLessThan(1e-9);
  });

  it("conserves translated narrow ribbon coverage on nonuniform midpoint cells", () => {
    // Actual mature loft across distribution; midpoint bounds also cover the
    // half-cells at the domain edges without extending outside the petal.
    const u = Array.from({ length: 73 }, (_, column) =>
      Math.sin((Math.sin(((column / 36 - 1) * Math.PI) / 2) * Math.PI) / 2)
    );
    for (const center of [-0.79, -0.013, 0.031, 0.75]) {
      const section = { center, width: 0.016, fade: 1 };
      const covered = u.reduce((mass, across, i) => {
        const cell = [
          (u[Math.max(0, i - 1)] + across) / 2,
          (across + u[Math.min(72, i + 1)]) / 2,
        ] as const;
        return (
          mass +
          pigmentSectionWeight(section, across, cell) * (cell[1] - cell[0])
        );
      }, 0);
      expect(covered).toBeCloseTo(section.width, 12);
    }
    const section = { center: 0.031, width: 0.016, fade: 1 };
    const cell = [-0.029, 0.043] as const;
    const dense =
      Array.from({ length: 10001 }, (_, i) =>
        pigmentSectionWeight(
          section,
          cell[0] + (i * (cell[1] - cell[0])) / 10000
        )
      ).reduce((sum, weight) => sum + weight, 0) / 10001;
    expect(pigmentSectionWeight(section, 0, cell)).toBeCloseTo(dense, 4);
  });

  it("draws clear SVG ink from shared pigment contours without embossed marks", () => {
    const seed = "reference";
    const { genome, livery, form } = growPlumeria(seed, 0, undefined, variant);
    const marks = preparePigmentMarks(seed, genome, livery);
    const svg = plumeria({ seed, variant });
    const paths = [
      ...svg.matchAll(/<path data-pigment="([^"]+)" d="([^"]+)"/g),
    ];
    expect(paths).toHaveLength(marks.length);
    for (const [index, mark] of marks.entries()) {
      const numbers = [...paths[index][2].matchAll(/-?\d+(?:\.\d+)?/g)].map(
        ([n]) => Number(n)
      );
      // Fine ink follows the half-strength contour; stripes keep full support.
      expect(numbers).toHaveLength(52);
      for (let sample = 0; sample < 13; sample += 1) {
        const along = mark.from + ((mark.to - mark.from) * sample) / 12;
        const { center, width } = pigmentMarkSection(mark, along);
        const across = center + width * (mark.kind === "stripe" ? 1 : 0.5);
        const point = laminaPoint(
          form,
          across < 0 ? -1 : 1,
          along,
          Math.abs(across)
        );
        expect(numbers[2 * sample]).toBeCloseTo(point[0], 1);
        expect(numbers[2 * sample + 1]).toBeCloseTo(point[1], 1);
      }
    }
    expect(svg).not.toMatch(
      /groovepath|undertexture|translate\(0\.36 -0\.08\)/
    );
    const grain =
      svg.match(/<filter id="[^"]*grain"[^>]*>[\s\S]*?<\/filter>/)?.[0] ?? "";
    expect(
      Number(grain.match(/baseFrequency="([\d.]+)"/)?.[1])
    ).toBeGreaterThan(0.25);
    expect(grain).toContain('in="SourceGraphic" in2="tooth"');
    const fibers = svg.match(/<path id="[^"]*fibers"[^>]*>/)?.[0] ?? "";
    expect(fibers.match(/ Q /g)?.length).toBeGreaterThanOrEqual(12);
    expect(fibers).not.toContain("filter");
    expect(svg.match(/href="#[^"]*fibers"/g)).toHaveLength(5);
    for (const path of svg.matchAll(/<path data-pigment="(?:ray|vein)"[^>]*>/g))
      expect(path[0]).not.toContain("filter");
    expect(svg.match(/<filter /g)?.length).toBeLessThanOrEqual(4);
    expect(svg.match(/<fe[A-Z]/g)?.length).toBeLessThanOrEqual(7);
    expect(svg.match(/href="#[^"]*markings"/g)).toHaveLength(5);
  });

  it("keeps pigment outside geometry preparation and every surface buffer", () => {
    const seed = "reference";
    const { genome, form } = growPlumeria(seed, 0, undefined, variant);
    const relief = sampleRelief(
      createRng(`${seed}/relief`),
      genome.form.fullness
    );
    for (const development of [0, 0.5, 1]) {
      const portrait = plumeriaScene({ seed, variant, development });
      const geometry = (
        portrait.scene.getObjectByProperty("type", "Mesh") as Mesh
      ).geometry;
      // Geometry does not even accept pigment/livery/mark descriptors now.
      const quiet = petalGeometry(form, relief, development);
      try {
        expect(geometry.index?.array).toEqual(quiet.index?.array);
        expect(geometry.hasAttribute("color")).toBe(false);
        for (const key of Object.keys(geometry.attributes))
          expect(geometry.getAttribute(key).array).toEqual(
            quiet.getAttribute(key).array
          );
        const uv = geometry.getAttribute("uv");
        expect(uv.getY(0)).toBe(0);
        expect(uv.getY(uv.count - 1)).toBe(1);
      } finally {
        portrait.dispose();
        quiet.dispose();
      }
    }
  });

  it("owns one petal pigment map with stable material coordinates through development", () => {
    const seed = "reference";
    const specimen = growPlumeria(seed, 0, undefined, variant);
    const marks = preparePigmentMarks(seed, specimen.genome, specimen.livery);
    const sample = preparePlumeriaPigment(
      specimen.genome,
      specimen.livery,
      marks
    );
    let reference: Uint8Array | undefined;
    let referenceUvs: Buffer[] | undefined;
    for (const development of [0, 0.5, 1]) {
      const portrait = plumeriaScene({ seed, variant, development });
      try {
        const mesh = portrait.scene.getObjectByProperty("type", "Mesh") as Mesh;
        const material = mesh.material as MeshPhysicalMaterial;
        const uvs = ["uv", "uv1"].map((name) =>
          Buffer.from(mesh.geometry.getAttribute(name).array.buffer)
        );
        if (referenceUvs)
          for (const [index, uv] of uvs.entries())
            expect(uv.equals(referenceUvs[index])).toBe(true);
        referenceUvs = uvs;
        const texture = material.map;
        expect(texture).not.toBeNull();
        if (!texture) throw new Error("missing production pigment map");
        expect(material.vertexColors).toBe(false);
        expect(texture?.channel).toBe(0);
        expect(material.normalMap?.channel).toBe(1);
        expect(material.bumpMap).toBeNull();
        expect(material.displacementMap).toBeNull();
        expect(texture?.colorSpace).toBe(SRGBColorSpace);
        expect(texture?.generateMipmaps).toBe(true);
        expect(texture?.minFilter).toBe(LinearMipmapLinearFilter);
        expect(texture?.magFilter).toBe(LinearFilter);
        const { data, width, height } = texture.image as {
          data: Uint8Array;
          width: number;
          height: number;
        };
        expect([width, height, data.length]).toEqual([256, 256, 262144]);
        if (reference) expect(data).toEqual(reference);
        reference = data;
        // Root handoff, mid-blade and distal landmarks; exact encoded texels,
        // not a comparison to the incidental (unused) coarse color attribute.
        for (const y of [15, 31, 127, 207])
          for (const x of [37, 128, 201]) {
            const along = (y + 0.5) / height,
              across = (2 * (x + 0.5)) / width - 1;
            const tone = sample(along)(across, [
              (2 * x) / width - 1,
              (2 * (x + 1)) / width - 1,
            ]);
            const hex = toHex(lightTone(tone));
            expect([
              ...data.slice(4 * (y * width + x), 4 * (y * width + x) + 4),
            ]).toEqual(
              [1, 3, 5]
                .map((i) => Number.parseInt(hex.slice(i, i + 2), 16))
                .concat(255)
            );
          }
      } finally {
        portrait.dispose();
      }
    }
  });

  it("reserves historical conditional SVG paint draws, preserving downstream blush and sheen", () => {
    for (let index = 0; index < 24; index += 1) {
      const seed = `paint-stream-${index}`;
      const grown = sprout(seed);
      const { form, genome, stripeVisible, halo } = grown;
      const { throat, veins, margin, blush } = genome;
      const rng = createRng(`${seed}|petal-paint`);
      const flameSeed = intBetween(rng, 1, 999999);
      const flameScale = between(rng, 0.85, 1.15) * (8 + 14 * throat.flame);
      const flameRadius =
        ((throatExtent(throat.reach) * form.length) / 1.28) *
        between(rng, 0.98, 1.02);
      if (throat.rays > 0.05)
        veinsPath(
          form,
          rng,
          intBetween(rng, 2, 3),
          throatRayExtent(throat.reach, throat.rays),
          0.55
        );
      if (veins.strength > 0.05)
        veinsPath(form, rng, intBetween(rng, 4, 5), 0.82, 0.95);
      veinsPath(form, rng, 2, 0.88, 0.85);
      veinsPath(form, rng, 2, 0.85, 0.8);
      const marginPath =
        margin.strength > 0.05 ? marginBand(form, rng, margin.strength) : "";
      const fibers = veinsPath(form, rng, intBetween(rng, 6, 8), 0.92, 1);
      veinsPath(form, rng, intBetween(rng, 3, 4), 0.86, 0.92);
      const haloRadius = throat.reach * form.length * between(rng, 0.96, 1.05);
      const haloWidth = halo && haloRadius > 0 ? between(rng, 8, 13) : 0;
      if (stripeVisible) {
        between(rng, 0.45, 0.6);
        between(rng, 0.05, 0.09);
        between(rng, 0.28, 0.4);
        between(rng, 0.12, 0.2);
      }
      const blushAlong = Math.min(0.92, blush.at * between(rng, 0.92, 1.08));
      const blushRadius =
        form.length * (0.16 + 0.14 * blush.strength) * between(rng, 0.9, 1.1);
      const sheenWidth = between(rng, 0.85, 1.1),
        sheenHeight = between(rng, 0.85, 1.1),
        blushAspect = between(rng, 0.55, 0.8);
      expect(preparePetalPaint(seed, form, genome, grown)).toEqual({
        flameSeed,
        flameScale,
        flameRadius,
        fibers,
        margin: marginPath,
        haloRadius,
        haloWidth,
        blushAlong,
        blushRadius,
        sheenWidth,
        sheenHeight,
        blushAspect,
      });
    }
  });
});
