import { createHash } from "node:crypto";
import {
  type BufferGeometry,
  DirectionalLight,
  HemisphereLight,
  Light,
  Mesh,
  MeshPhysicalMaterial,
  type Scene,
  SpotLight,
  type Texture,
} from "three";
import { describe, expect, it } from "vitest";
import { cultivar } from "@/src";
import { plumeriaScene, renderPlumeria } from "@/src/gl";
import {
  petalGeometry,
  type Relief,
  radialCupProfile,
  sampleRelief,
  throatWeight,
} from "@/src/gl/loft";
import { PLUMERIA_GL_RENDER_CONTRACT, STUDIO_LIGHT } from "@/src/gl/studio";
import { sampleGenome } from "@/src/plumeria/genome";
import {
  corollaFrame,
  corollaLean,
  laminaPoint,
  midrib,
  petalForm,
} from "@/src/plumeria/petal";
import { throatExtent, throatRayExtent } from "@/src/plumeria/pigment";
import { sprout } from "@/src/plumeria/render";
import { createRng } from "@/src/shared/prng";

// Vitest owns pure scene contracts; test/browser.mjs exercises the renderer.

const seed = "2026-06-14";

function petals(scene: Scene): Mesh[] {
  const found: Mesh[] = [];
  scene.traverse((child) => {
    if (child instanceof Mesh) found.push(child);
  });
  return found;
}

function attribute(scene: Scene, name: string): Float32Array {
  return petals(scene)[0].geometry.getAttribute(name).array as Float32Array;
}

function material(scene: Scene): MeshPhysicalMaterial {
  const value = petals(scene)[0].material;
  if (!(value instanceof MeshPhysicalMaterial))
    throw new Error("petals must use a physical material");
  return value;
}

function textureData(texture: Texture | null): Uint8Array {
  return ((texture?.image as { data?: Uint8Array } | undefined)?.data ??
    new Uint8Array()) as Uint8Array;
}

function lightEnergy(scene: Scene): number {
  let energy = 0;
  scene.traverse((child) => {
    if (child instanceof Light) energy += child.intensity;
  });
  return energy;
}

function geometryWith(relief: Relief): BufferGeometry {
  const grown = sprout(seed);
  return petalGeometry(grown.form, relief, grown.genome, {
    blush2At: grown.blush2At,
    blush2Mix: grown.blush2Mix,
    blush2Opacity: grown.blush2Opacity,
    blush2Width: grown.blush2Width,
    halo: grown.halo,
    stripeSide: grown.stripeSide,
    stripy: grown.stripeVisible,
  });
}

function zAt(
  geometry: BufferGeometry,
  across: number,
  along: number,
  face = true
): number {
  const uv = geometry.getAttribute("uv");
  const position = geometry.getAttribute("position");
  const half = uv.count / 2;
  const start = face ? 0 : half;
  const end = face ? half : uv.count;
  for (const offset of Array(end - start).keys()) {
    const i = start + offset;
    if (uv.getX(i) === across && uv.getY(i) === along) return position.getZ(i);
  }
  throw new Error(`missing petal sample ${across}, ${along}`);
}

describe("plumeriaScene", () => {
  it("rejects unsupported studio and debug modes", () => {
    expect(() => plumeriaScene({ look: "glossy" as never, seed })).toThrow(
      "look must be luminous or soft"
    );
    expect(() =>
      plumeriaScene({ debugView: "wireframe" as never, seed })
    ).toThrow("debugView must be clay or final");
  });

  it("freezes the renderer-owned studio contract", () => {
    expect(Object.isFrozen(STUDIO_LIGHT)).toBe(true);
    expect(Object.isFrozen(PLUMERIA_GL_RENDER_CONTRACT)).toBe(true);
  });

  it("is deterministic for a given seed", () => {
    const a = plumeriaScene({ seed });
    const b = plumeriaScene({ seed });

    expect(attribute(a.scene, "position")).toEqual(
      attribute(b.scene, "position")
    );
    expect(textureData(material(a.scene).bumpMap)).toEqual(
      textureData(material(b.scene).bumpMap)
    );
    expect(a.cultivar).toBe(b.cultivar);
  });

  it("changes with the seed", () => {
    expect(attribute(plumeriaScene({ seed }).scene, "position")).not.toEqual(
      attribute(plumeriaScene({ seed: "another" }).scene, "position")
    );
    expect(
      textureData(material(plumeriaScene({ seed }).scene).bumpMap)
    ).not.toEqual(
      textureData(material(plumeriaScene({ seed: "another" }).scene).bumpMap)
    );
  });

  it("grows the same genome as the SVG", () => {
    expect(plumeriaScene({ seed }).cultivar).toBe(cultivar({ seed }));
  });

  it("changes only the renderer-owned studio between looks", () => {
    const luminous = plumeriaScene({ look: "luminous", seed });
    const soft = plumeriaScene({ look: "soft", seed });

    expect(attribute(luminous.scene, "position")).toEqual(
      attribute(soft.scene, "position")
    );
    expect(textureData(material(luminous.scene).bumpMap)).toEqual(
      textureData(material(soft.scene).bumpMap)
    );
    expect(material(luminous.scene).roughness).toBe(
      material(soft.scene).roughness
    );
    expect(material(luminous.scene).clearcoat).toBe(0);
    expect(lightEnergy(luminous.scene)).toBeGreaterThan(
      lightEnergy(soft.scene)
    );
  });

  it("fits every flower to the same structural frame", () => {
    const small = plumeriaScene({ seed: "23" });
    const large = plumeriaScene({ seed: "1" });

    expect(small.length).toBeLessThan(large.length);
    expect(small.camera.right - small.camera.left).toBeLessThan(
      large.camera.right - large.camera.left
    );
  });

  it("grows five petals sharing one geometry", () => {
    const grown = petals(plumeriaScene({ seed }).scene);
    expect(grown).toHaveLength(5);
    const perGeometry = new Map<object, number>();
    for (const mesh of grown) {
      perGeometry.set(mesh.geometry, (perGeometry.get(mesh.geometry) ?? 0) + 1);
    }

    expect([...perGeometry.values()]).toContain(5);
    expect(material(plumeriaScene({ seed }).scene).vertexColors).toBe(true);
    const skin = material(plumeriaScene({ seed }).scene);
    expect(skin.map).toBeNull();
    expect(skin.bumpMap).not.toBeNull();
  });

  it("stacks the pinwheel the way the SVG paints it", () => {
    // The roll is what closes the pinwheel in depth, so it is the one
    // relief claim worth locking: the u = −1 flank rides up, because in
    // the SVG's painter's order each petal laps over its counter-clockwise
    // neighbour. Vertices are found by their uv (u across, t along).
    const geometry = petals(plumeriaScene({ seed }).scene)[0].geometry;
    const uv = geometry.getAttribute("uv");
    const position = geometry.getAttribute("position");
    let over = Number.NaN;
    let under = Number.NaN;

    for (const k of Array(uv.count).keys()) {
      if (Math.abs(uv.getY(k) - 0.5) > 1e-9) continue;
      if (uv.getX(k) === 0) over = position.getZ(k);
      if (uv.getX(k) === 1) under = position.getZ(k);
    }

    expect(over).toBeGreaterThan(under);
  });

  it("ships bare: no background, the page owns the ground", () => {
    expect(plumeriaScene({ seed }).scene.background).toBeNull();
  });

  it("grows the SVG's own petal form, y flipped into three's frame", () => {
    // Parity of species: the loft's petal 0 must put its tip exactly where
    // the SVG's midrib ends — same x (bend and lean hook the same way),
    // y flipped upward. No mirror anywhere: a mirrored pinwheel is a
    // different flower.
    const geometry = petals(plumeriaScene({ seed }).scene)[0].geometry;
    const uv = geometry.getAttribute("uv");
    const position = geometry.getAttribute("position");
    const form = sprout(seed).form;
    const [tx, ty] = midrib(form, 1);
    let found = false;

    for (const k of Array(uv.count).keys()) {
      if (found) break;
      if (uv.getY(k) === 1 && uv.getX(k) === 0.5) {
        // positions live in a Float32Array: ~7 significant digits
        expect(position.getX(k)).toBeCloseTo(tx, 3);
        expect(position.getY(k)).toBeCloseTo(-ty, 3);
        found = true;
      }
    }

    expect(found).toBe(true);
  });

  it("keeps the full SVG outline, including its margin ripple", () => {
    const geometry = petals(plumeriaScene({ seed }).scene)[0].geometry;
    const uv = geometry.getAttribute("uv");
    const position = geometry.getAttribute("position");
    const form = sprout(seed).form;
    let checked = 0;

    for (const k of Array(uv.count).keys()) {
      const t = uv.getY(k);
      const across = uv.getX(k);
      if (across !== 0 && across !== 1) continue;
      const [x, y] = laminaPoint(form, across === 0 ? -1 : 1, t, 1);
      expect(position.getX(k)).toBeCloseTo(x, 3);
      expect(position.getY(k)).toBeCloseTo(-y, 3);
      checked += 1;
    }

    expect(checked).toBeGreaterThan(0);
  });

  it("winds each shell toward its authored normals", () => {
    const geometry = petals(plumeriaScene({ seed }).scene)[0].geometry;
    const index = geometry.getIndex();
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    if (!index) throw new Error("petal geometry must be indexed");

    for (const face of Array(index.count / 3).keys()) {
      const i = face * 3;
      const a = index.getX(i);
      const b = index.getX(i + 1);
      const c = index.getX(i + 2);
      const uv = geometry.getAttribute("uv");
      if (
        [a, b, c].some((vertex) => {
          const along = uv.getY(vertex);
          return along === 0 || along === 1;
        })
      )
        continue;
      const abx = position.getX(b) - position.getX(a);
      const aby = position.getY(b) - position.getY(a);
      const abz = position.getZ(b) - position.getZ(a);
      const acx = position.getX(c) - position.getX(a);
      const acy = position.getY(c) - position.getY(a);
      const acz = position.getZ(c) - position.getZ(a);
      const nx = normal.getX(a);
      const ny = normal.getY(a);
      const nz = normal.getZ(a);
      expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 5);
      const crossX = aby * acz - abz * acy;
      const crossY = abz * acx - abx * acz;
      const crossZ = abx * acy - aby * acx;
      const area = Math.hypot(crossX, crossY, crossZ);
      const dot = crossX * nx + crossY * ny + crossZ * nz;
      if (area > 1e-8) expect(dot).toBeGreaterThan(0);
    }
  });

  it("closes face and belly at the base and tip", () => {
    const geometry = petals(plumeriaScene({ seed }).scene)[0].geometry;
    const uv = geometry.getAttribute("uv");
    const position = geometry.getAttribute("position");

    for (const t of [0, 1]) {
      let x = Number.NaN;
      let y = Number.NaN;
      let z = Number.NaN;
      for (const i of Array(uv.count).keys()) {
        if (uv.getY(i) !== t) continue;
        if (Number.isNaN(x)) {
          x = position.getX(i);
          y = position.getY(i);
          z = position.getZ(i);
        }
        expect(position.getX(i)).toBeCloseTo(x, 5);
        expect(position.getY(i)).toBeCloseTo(y, 5);
        expect(position.getZ(i)).toBeCloseTo(z, 5);
      }
    }
  });

  it("closes face and belly along both rims", () => {
    const geometry = petals(plumeriaScene({ seed }).scene)[0].geometry;
    const uv = geometry.getAttribute("uv");
    const position = geometry.getAttribute("position");
    const faceVertices = uv.count / 2;

    for (const i of Array(faceVertices).keys()) {
      if (uv.getX(i) !== 0 && uv.getX(i) !== 1) continue;
      const belly = i + faceVertices;
      expect(position.getX(i)).toBeCloseTo(position.getX(belly), 5);
      expect(position.getY(i)).toBeCloseTo(position.getY(belly), 5);
      expect(position.getZ(i)).toBeCloseTo(position.getZ(belly), 5);
      if (uv.getY(i) === 0 || uv.getY(i) === 1) continue;
      const normal = geometry.getAttribute("normal");
      expect(normal.getX(i)).toBeCloseTo(normal.getX(belly), 5);
      expect(normal.getY(i)).toBeCloseTo(normal.getY(belly), 5);
      expect(normal.getZ(i)).toBeCloseTo(normal.getZ(belly), 5);
    }
  });

  it("gives each collapsed pole one stable normal", () => {
    const geometry = petals(plumeriaScene({ seed }).scene)[0].geometry;
    const uv = geometry.getAttribute("uv");
    const normal = geometry.getAttribute("normal");
    const half = uv.count / 2;

    for (const along of [0, 1]) {
      for (const offset of [0, half]) {
        const indices = Array.from(
          { length: half },
          (_, i) => i + offset
        ).filter((i) => uv.getY(i) === along);
        const first = indices[0];
        expect(indices.length).toBeGreaterThan(1);
        for (const i of indices) {
          expect(normal.getX(i)).toBeCloseTo(normal.getX(first), 6);
          expect(normal.getY(i)).toBeCloseTo(normal.getY(first), 6);
          expect(normal.getZ(i)).toBeCloseTo(normal.getZ(first), 6);
        }
        expect(
          Math.hypot(normal.getX(first), normal.getY(first))
        ).toBeGreaterThan(0.01);
      }
    }
  });
});

describe("petal relief", () => {
  const flat: Relief = {
    crownHeight: 0,
    cupRise: 0,
    rimHalfThickness: 0,
    spoonCurl: 0,
  };

  it("samples a deep, fleshy shell", () => {
    for (const fullness of [0, 0.5, 1]) {
      const relief = sampleRelief(createRng(`relief-${fullness}`), fullness);
      expect(relief.cupRise).toBeGreaterThanOrEqual(0.25);
      expect(relief.cupRise).toBeLessThanOrEqual(0.31);
      expect(relief.crownHeight).toBeCloseTo(0.24 + 0.14 * fullness, 10);
      expect(relief.rimHalfThickness).toBeGreaterThanOrEqual(0.28);
      expect(relief.rimHalfThickness).toBeLessThanOrEqual(0.34);
    }

    const geometry = geometryWith(sampleRelief(createRng("relief-depth"), 0.5));
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    if (!bounds) throw new Error("petal geometry must have bounds");
    const x = bounds.max.x - bounds.min.x;
    const y = bounds.max.y - bounds.min.y;
    const z = bounds.max.z - bounds.min.z;

    expect(z / Math.max(x, y)).toBeGreaterThan(0.2);
  });

  it("raises the blade radially from its meeting point", () => {
    const base = geometryWith(flat);
    const cupped = geometryWith({ ...flat, cupRise: 0.25 });

    expect(zAt(cupped, 0.5, 0) - zAt(base, 0.5, 0)).toBeCloseTo(0, 5);
    expect(zAt(cupped, 0.5, 0.5) - zAt(base, 0.5, 0.5)).toBeGreaterThan(0);
  });

  it("leaves the throat with a smooth, zero-slope meeting", () => {
    expect(radialCupProfile(0)).toBe(0);
    expect(radialCupProfile(0.002) / 0.002).toBeLessThan(0.02);
    expect(radialCupProfile(0.4)).toBeGreaterThan(0.5);
  });

  it("crowns the midrib", () => {
    const base = geometryWith(flat);
    const crowned = geometryWith({ ...flat, crownHeight: 0.2 });

    expect(zAt(crowned, 0.5, 0.5) - zAt(base, 0.5, 0.5)).toBeGreaterThan(0);
  });

  it("rolls the tucked flank farther than the opposite edge", () => {
    const base = geometryWith(flat);
    const curled = geometryWith({ ...flat, spoonCurl: 0.5 });
    const tucked = zAt(curled, 0, 0.5) - zAt(base, 0, 0.5);
    const opposite = zAt(curled, 1, 0.5) - zAt(base, 1, 0.5);

    expect(zAt(curled, 0.5, 0.5)).toBeCloseTo(zAt(base, 0.5, 0.5), 5);
    expect(tucked).toBeGreaterThan(opposite);
    expect(opposite).toBeGreaterThan(0);
  });

  it("puts most shell thickness behind the visible face", () => {
    const thick = geometryWith({ ...flat, rimHalfThickness: 0.18 });
    const face = zAt(thick, 0.5, 0.5);
    const belly = zAt(thick, 0.5, 0.5, false);

    expect(face).toBeGreaterThan(0);
    expect(belly).toBeLessThan(0);
    expect(Math.abs(belly)).toBeGreaterThan(face);
    expect(zAt(thick, 0, 0.5)).toBeCloseTo(zAt(thick, 0, 0.5, false), 5);
  });
});

describe("renderPlumeria options", () => {
  const canvas = {} as HTMLCanvasElement;

  for (const size of [0, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 1025]) {
    it(`rejects size ${size}`, () => {
      expect(() => renderPlumeria({ canvas, seed, size })).toThrow(RangeError);
    });
  }

  for (const samples of [0, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 257]) {
    it(`rejects samples ${samples}`, () => {
      expect(() => renderPlumeria({ canvas, samples, seed })).toThrow(
        RangeError
      );
    });
  }
});

describe("laminaPoint", () => {
  const rng = createRng(seed);
  rng();
  const form = petalForm(sampleGenome(rng).form, rng);

  it("sits on the midrib at u = 0", () => {
    for (const t of [0.2, 0.5, 0.8]) {
      expect(laminaPoint(form, 1, t, 0)).toEqual(midrib(form, t));
      expect(laminaPoint(form, -1, t, 0)).toEqual(midrib(form, t));
    }
  });

  it("walks the half-width linearly in u", () => {
    const [mx, my] = midrib(form, 0.5);
    const reach = (side: 1 | -1, u: number) => {
      const [x, y] = laminaPoint(form, side, 0.5, u);
      return Math.hypot(x - mx, y - my);
    };

    for (const side of [1, -1] as const) {
      expect(reach(side, 0.5)).toBeCloseTo(reach(side, 1) / 2, 10);
    }
  });

  it("puts the corolla's visible five-fold mass upright", () => {
    for (const seedValue of ["2", "5", "1", "6", "8", "23"])
      expect(corollaLean(sprout(seedValue).form)).toBeCloseTo(0, 3);
  });

  it("fits the complete corolla to a finite box", () => {
    for (const seedValue of ["2", "5", "1", "6", "8", "23"]) {
      const grown = sprout(seedValue);
      const frame = corollaFrame(grown.form);
      const xs: number[] = [];
      const ys: number[] = [];

      for (const i of Array(181).keys()) {
        const t = (1 - Math.cos((Math.PI * i) / 180)) / 2;
        for (const side of [-1, 1] as const) {
          const [x, y] = laminaPoint(grown.form, side, t, 1);
          for (const k of Array(5).keys()) {
            const angle = (k * 2 * Math.PI) / 5;
            const rx = x * Math.cos(angle) - y * Math.sin(angle);
            const ry = x * Math.sin(angle) + y * Math.cos(angle);
            xs.push(240 + frame.scale * (rx - frame.centerX));
            ys.push(240 + frame.scale * (ry - frame.centerY));
          }
        }
      }

      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      expect((minX + maxX) / 2).toBeCloseTo(240, 8);
      expect((minY + maxY) / 2).toBeCloseTo(240, 8);
      expect(Math.max(maxX - minX, maxY - minY)).toBeCloseTo(444, 8);
      expect(Math.min(minX, minY)).toBeGreaterThanOrEqual(18 - 1e-8);
      expect(Math.max(maxX, maxY)).toBeLessThanOrEqual(462 + 1e-8);
    }
  });
});

describe("throat pigment", () => {
  it("flows continuously from the meeting into the blade", () => {
    const reach = 0.7;
    const weights = [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) =>
      throatWeight(reach, 0.5, t, 0, t)
    );

    expect(weights[0]).toBe(1);
    for (const [i, weight] of weights.entries()) {
      if (i === 0) continue;
      expect(weight).toBeLessThan(weights[i - 1]);
    }
    expect(weights.at(-1)).toBe(0);
  });

  it("reaches farther for wide-throated genomes", () => {
    const reaches = [0.22, 0.5, 0.82].map(throatExtent);
    expect(reaches[0]).toBeLessThan(reaches[1]);
    expect(reaches[1]).toBeLessThan(reaches[2]);
    expect(throatWeight(0.82, 0.5, 0.65, 0, 0.65)).toBeGreaterThan(
      throatWeight(0.5, 0.5, 0.65, 0, 0.65)
    );
    expect(throatWeight(0.5, 0.5, 0.65, 0, 0.65)).toBeGreaterThan(
      throatWeight(0.22, 0.5, 0.65, 0, 0.65)
    );
  });

  it("fades the throat tongue without a pigment seam", () => {
    const reach = 0.5;
    const rays = 0.5;
    const extent = throatRayExtent(reach, rays);
    const before = throatWeight(reach, rays, extent - 0.001, 0, 1);
    const after = throatWeight(reach, rays, extent + 0.001, 0, 1);

    expect(Math.abs(before - after)).toBeLessThan(0.001);
  });
});

describe("gl vectors", () => {
  const fingerprint = (seedValue: string) => {
    const grown = plumeriaScene({ seed: seedValue });
    const geometry = petals(grown.scene)[0].geometry;
    const rounded = (name: string) =>
      Array.from(geometry.getAttribute(name).array, (v) =>
        Math.round(Number(v) * 100)
      ).join(",");
    const hash = createHash("sha256");
    for (const name of ["position", "normal", "color", "uv", "thinness"])
      hash.update(rounded(name));
    hash.update(Array.from(geometry.getIndex()?.array ?? []).join(","));
    const skin = material(grown.scene);
    for (const texture of [skin.map, skin.bumpMap, skin.roughnessMap]) {
      hash.update(textureData(texture));
      hash.update(
        [
          texture?.colorSpace,
          texture?.generateMipmaps,
          texture?.magFilter,
          texture?.minFilter,
        ].join(",")
      );
    }
    hash.update(
      [
        skin.roughness,
        skin.bumpScale,
        skin.clearcoat,
        skin.clearcoatRoughness,
        skin.specularIntensity,
        skin.sheen,
        skin.sheenRoughness,
        skin.envMapIntensity,
        skin.onBeforeCompile.toString(),
      ].join(",")
    );
    hash.update(JSON.stringify(STUDIO_LIGHT));
    hash.update(
      [
        grown.camera.left,
        grown.camera.right,
        grown.camera.top,
        grown.camera.bottom,
        grown.camera.near,
        grown.camera.far,
        ...grown.camera.position.toArray(),
      ].join(",")
    );
    return hash.digest("hex").slice(0, 16);
  };

  const imageFingerprint = (seedValue: string) => {
    const grown = plumeriaScene({ seed: seedValue });
    const lights: unknown[] = [];
    grown.scene.traverse((child) => {
      if (!(child instanceof Light)) return;
      const light: Record<string, unknown> = {
        castShadow: child.castShadow,
        color: child.color.getHexString(),
        intensity: child.intensity,
        position: child.position.toArray(),
        type: child.type,
      };
      if (child instanceof DirectionalLight || child instanceof SpotLight)
        light.target = child.target.position.toArray();
      if (child instanceof HemisphereLight)
        light.groundColor = child.groundColor.getHexString();
      if (child instanceof SpotLight) {
        light.angle = child.angle;
        light.decay = child.decay;
        light.distance = child.distance;
        light.penumbra = child.penumbra;
      }
      lights.push(light);
    });
    const hash = createHash("sha256");
    hash.update(fingerprint(seedValue));
    hash.update(JSON.stringify(PLUMERIA_GL_RENDER_CONTRACT));
    hash.update(JSON.stringify(lights));
    return hash.digest("hex").slice(0, 16);
  };

  const cases = [
    {
      image: "a7dde7a5dd5cc2c6",
      scene: "fef1151bf5000fb7",
      seed: "2026-06-14",
    },
    {
      image: "5636ef831e1358a8",
      scene: "b9edb268592291cb",
      seed: "hello",
    },
  ] as const;

  for (const seedValue of cases) {
    it(`is frozen for ${seedValue.seed}`, () => {
      expect(fingerprint(seedValue.seed)).toBe(seedValue.scene);
    });

    it(`freezes the complete image contract for ${seedValue.seed}`, () => {
      expect(imageFingerprint(seedValue.seed)).toBe(seedValue.image);
    });
  }
});
