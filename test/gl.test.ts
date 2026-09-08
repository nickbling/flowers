import { createHash } from "node:crypto";
import {
  Box3,
  DirectionalLight,
  HemisphereLight,
  Light,
  Mesh,
  MeshPhysicalMaterial,
  OrthographicCamera,
  Scene,
  SpotLight,
  type Texture,
  Vector3,
  WebGLRenderTarget,
} from "three";
import { describe, expect, it } from "vitest";
import { cultivar } from "@/src";
import { exportPlumeriaPng, plumeriaScene, renderPlumeria } from "@/src/gl";
import { petalGeometry } from "@/src/gl/loft";
import { buildPlumeriaScene } from "@/src/gl/plumeria-scene";
import { preparePlumeriaPetal } from "@/src/gl/plumeria-surface";
import {
  type Accumulation,
  accumulate,
  type RenderSurface,
} from "@/src/gl/rendering";
import { BOTANICAL_STUDIO } from "@/src/gl/studio";
import { sampleGenome } from "@/src/plumeria/genome";
import {
  corollaFrame,
  corollaLean,
  laminaPoint,
  midrib,
  petalForm,
} from "@/src/plumeria/petal";
import {
  throatExtent,
  throatRayExtent,
  throatWeight,
} from "@/src/plumeria/pigment";
import { growPlumeria } from "@/src/plumeria/specimen";
import { createRng } from "@/src/shared/prng";

// Scene/resource contracts here; full ribbon topology and motion have their
// own tests. Browser tests exercise presentation rather than scene snapshots.
const seed = "2026-06-14";
function petals(scene: Scene): Mesh[] {
  const found: Mesh[] = [];
  scene.traverse((child) => {
    if (child instanceof Mesh && child.userData.organ === "petal")
      found.push(child);
  });
  return found;
}
function material(scene: Scene): MeshPhysicalMaterial {
  const skin = petals(scene)[0].material;
  if (!(skin instanceof MeshPhysicalMaterial))
    throw new Error("flower tissue must use a physical material");
  return skin;
}
function attribute(scene: Scene, name: string) {
  return petals(scene)[0].geometry.getAttribute(name).array;
}
function textureData(texture: Texture | null): Uint8Array {
  return (
    (texture?.image as { data?: Uint8Array } | undefined)?.data ??
    new Uint8Array()
  );
}
function lightEnergy(scene: Scene): number {
  let energy = 0;
  scene.traverse((child) => {
    if (child instanceof Light) energy += child.intensity;
  });
  return energy;
}

describe("plumeriaScene", () => {
  it("rejects unsupported studio and debug modes", () => {
    expect(() => plumeriaScene({ look: "glossy" as never, seed })).toThrow(
      "look must be luminous or soft"
    );
    expect(() =>
      plumeriaScene({ debugView: "wireframe" as never, seed })
    ).toThrow("debugView must be clay or final");
    for (const development of [-1, 1.01, Number.NaN, Infinity])
      expect(() => plumeriaScene({ seed, development })).toThrow(RangeError);
  });
  it("freezes the renderer-owned studio contract", () => {
    expect(Object.isFrozen(BOTANICAL_STUDIO)).toBe(true);
    expect(Object.isFrozen(BOTANICAL_STUDIO.light)).toBe(true);
  });
  it.each([
    0, 0.5, 1,
  ])("keeps the complete corolla inside the sampled key shadow at development %s", (development) => {
    const built = buildPlumeriaScene({ seed, development });
    const { scene } = built.portrait;
    try {
      const keys = scene.children.filter(
        (object): object is SpotLight => object instanceof SpotLight
      );
      expect(keys).toHaveLength(1);
      const bounds = new Box3();
      for (const petal of petals(scene)) bounds.expandByObject(petal);
      const random = createRng(`${seed}|shadow-coverage`);
      for (let sample = 0; sample < 8; sample += 1) {
        built.studio.sample(random);
        scene.updateMatrixWorld(true);
        for (const key of keys) {
          expect(key.castShadow).toBe(true);
          expect(key.shadow.intensity).toBeGreaterThan(0);
          expect(key.shadow.intensity).toBeLessThan(1);
          key.shadow.updateMatrices(key);
          for (const x of [bounds.min.x, bounds.max.x])
            for (const y of [bounds.min.y, bounds.max.y])
              for (const z of [bounds.min.z, bounds.max.z]) {
                const point = new Vector3(x, y, z).project(key.shadow.camera);
                expect(
                  Math.max(
                    Math.abs(point.x),
                    Math.abs(point.y),
                    Math.abs(point.z)
                  )
                ).toBeLessThan(1);
              }
        }
      }
    } finally {
      built.portrait.dispose();
    }
  });
  it.each([
    "luminous",
    "soft",
  ] as const)("keeps five identical petals under sampled %s directional lighting", (look) => {
    const built = buildPlumeriaScene({
      seed: look === "luminous" ? "reference" : "hello",
      look,
    });
    const { scene } = built.portrait;
    const meshes = petals(scene);
    const positions = attribute(scene, "position").slice();
    const random = createRng("directional-light-field");
    try {
      const keys = scene.children.filter(
        (object): object is SpotLight => object instanceof SpotLight
      );
      expect(keys).toHaveLength(1);
      expect(meshes).toHaveLength(5);
      for (let sample = 0; sample <= 8; sample += 1) {
        if (sample > 0) built.studio.sample(random);
        const direction = keys[0].position
          .clone()
          .sub(keys[0].target.position)
          .normalize();
        expect(Math.hypot(direction.x, direction.y)).toBeGreaterThan(0.1);
        for (const [i, mesh] of meshes.entries()) {
          expect(mesh.geometry).toBe(meshes[0].geometry);
          expect(mesh.material).toBe(meshes[0].material);
          expect(mesh.position.toArray()).toEqual([0, 0, 0]);
          expect(mesh.scale.toArray()).toEqual([1, 1, 1]);
          expect(mesh.rotation.x).toBe(0);
          expect(mesh.rotation.y).toBe(0);
          expect(mesh.rotation.z).toBe((-i * 2 * Math.PI) / 5);
        }
      }
      expect(attribute(scene, "position")).toEqual(positions);
    } finally {
      built.portrait.dispose();
    }
  });
  it("disposes key and sky shadow targets once", () => {
    const built = plumeriaScene({ seed });
    try {
      const lights = built.scene.children.filter(
        (object): object is SpotLight | DirectionalLight =>
          (object instanceof SpotLight || object instanceof DirectionalLight) &&
          object.castShadow
      );
      expect(lights).toHaveLength(2);
      let disposed = 0;
      for (const light of lights) {
        light.shadow.map = new WebGLRenderTarget(4, 4);
        light.shadow.map.addEventListener("dispose", () => {
          disposed += 1;
        });
      }
      built.dispose();
      built.dispose();
      expect(disposed).toBe(2);
    } finally {
      built.dispose();
    }
  });
  it("is deterministic for a given seed", () => {
    const a = plumeriaScene({ seed }),
      b = plumeriaScene({ seed });
    try {
      for (const name of ["position", "normal", "uv", "uv1"])
        expect(attribute(a.scene, name)).toEqual(attribute(b.scene, name));
      expect(textureData(material(a.scene).map)).toEqual(
        textureData(material(b.scene).map)
      );
      expect(textureData(material(a.scene).normalMap)).toEqual(
        textureData(material(b.scene).normalMap)
      );
      expect(a.cultivar).toBe(b.cultivar);
    } finally {
      a.dispose();
      b.dispose();
    }
  });
  it("owns one shared mesh resource and disposes both maps exactly once", () => {
    const built = plumeriaScene({ seed });
    const petal = petals(built.scene)[0],
      skin = material(built.scene);
    expect(skin.map).not.toBeNull();
    expect(skin.normalMap).not.toBeNull();
    expect(skin.map).not.toBe(skin.normalMap);
    const counts = { geometry: 0, material: 0, texture: 0 };
    petal.geometry.addEventListener("dispose", () => {
      counts.geometry += 1;
    });
    skin.addEventListener("dispose", () => {
      counts.material += 1;
    });
    for (const texture of [skin.map, skin.normalMap])
      texture?.addEventListener("dispose", () => {
        counts.texture += 1;
      });
    built.dispose();
    built.dispose();
    expect(counts).toEqual({ geometry: 1, material: 1, texture: 2 });
    expect(built.scene.children).toHaveLength(0);
  });
  it("keeps physical detail fixed when moonlight only pales pigment", () => {
    const ordinary = plumeriaScene({ seed }),
      moonlit = plumeriaScene({ date: "2000-01-21", seed });
    try {
      for (const name of ["position", "normal", "uv", "uv1"])
        expect(attribute(moonlit.scene, name)).toEqual(
          attribute(ordinary.scene, name)
        );
      expect(textureData(material(moonlit.scene).normalMap)).toEqual(
        textureData(material(ordinary.scene).normalMap)
      );
      expect(textureData(material(moonlit.scene).map)).not.toEqual(
        textureData(material(ordinary.scene).map)
      );
    } finally {
      ordinary.dispose();
      moonlit.dispose();
    }
  });
  it("changes with the seed and grows the SVG's genome", () => {
    const a = plumeriaScene({ seed }),
      b = plumeriaScene({ seed: "another" });
    try {
      expect(attribute(a.scene, "position")).not.toEqual(
        attribute(b.scene, "position")
      );
      expect(textureData(material(a.scene).normalMap)).not.toEqual(
        textureData(material(b.scene).normalMap)
      );
      expect(a.cultivar).toBe(cultivar({ seed }));
    } finally {
      a.dispose();
      b.dispose();
    }
  });
  it("changes only the renderer-owned studio between looks", () => {
    const luminous = plumeriaScene({ look: "luminous", seed }),
      soft = plumeriaScene({ look: "soft", seed });
    try {
      expect(attribute(luminous.scene, "position")).toEqual(
        attribute(soft.scene, "position")
      );
      expect(textureData(material(luminous.scene).map)).toEqual(
        textureData(material(soft.scene).map)
      );
      expect(textureData(material(luminous.scene).normalMap)).toEqual(
        textureData(material(soft.scene).normalMap)
      );
      expect(material(luminous.scene).roughness).toBe(
        material(soft.scene).roughness
      );
      expect(lightEnergy(luminous.scene)).toBeGreaterThan(
        lightEnergy(soft.scene)
      );
    } finally {
      luminous.dispose();
      soft.dispose();
    }
  });
  it("fits every flower to the same structural frame", () => {
    const flowers = ["23", "1"]
      .map((seedValue) => plumeriaScene({ seed: seedValue }))
      .sort((a, b) => a.length - b.length);
    try {
      const [small, large] = flowers;
      expect(small.length).toBeLessThan(large.length);
      expect(small.camera.right - small.camera.left).toBeLessThan(
        large.camera.right - large.camera.left
      );
    } finally {
      for (const flower of flowers) flower.dispose();
    }
  });
  it("contains only five complete petals, sharing geometry and opaque tissue", () => {
    const built = plumeriaScene({ seed });
    try {
      const meshes: Mesh[] = [];
      built.scene.traverse((object) => {
        if (object instanceof Mesh) meshes.push(object);
      });
      expect(meshes).toHaveLength(5);
      for (const mesh of meshes) {
        expect(mesh.userData.organ).toBe("petal");
        expect(mesh.geometry).toBe(meshes[0].geometry);
        expect(mesh.material).toBe(meshes[0].material);
      }
      const skin = material(built.scene);
      expect(skin.vertexColors).toBe(false);
      expect(skin.map?.channel).toBe(0);
      expect(skin.normalMap?.channel).toBe(1);
      expect(skin.bumpMap).toBeNull();
      expect(skin.displacementMap).toBeNull();
      expect(skin.transparent).toBe(false);
      expect(skin.opacity).toBe(1);
      expect(skin.ior).toBe(1.45);
      expect(skin.specularIntensity).toBe(0.9);
      expect(skin.sheen).toBe(0);
      expect(skin.clearcoat).toBe(0);
      expect(skin.customProgramCacheKey()).toBe("flower-tissue-0-0-false");
      // Neither fine vertex pigment nor an unused transmission attribute.
      expect(Object.keys(meshes[0].geometry.attributes).sort()).toEqual([
        "normal",
        "position",
        "uv",
        "uv1",
      ]);
      expect(built.scene.background).toBeNull();
    } finally {
      built.dispose();
    }
  });
  it.each([
    "reference",
    "2026-06-14",
    "hello",
    "shape-67",
    "shape-110",
    "shape-165",
  ])("keeps canonical SVG x/y through the entire %s blade and tip", (caseSeed) => {
    const grown = growPlumeria(caseSeed);
    const relief = {
      crownHeight: 0,
      cupRise: 0,
      rimHalfThickness: 0,
      spoonCurl: 0,
    };
    const geometry = petalGeometry(grown.form, relief);
    const sample = preparePlumeriaPetal(grown.form, relief);
    try {
      const uv = geometry.getAttribute("uv"),
        position = geometry.getAttribute("position");
      let checked = 0;
      for (let vertex = 0; vertex < position.count / 2; vertex += 1) {
        const along = uv.getY(vertex);
        // UV is canonical blade length t²; the whole-petal chart opens by .68.
        if (along < 0.68 ** 2) continue;
        const u = 2 * uv.getX(vertex) - 1;
        const [x, y] = laminaPoint(
          grown.form,
          u < 0 ? -1 : 1,
          along,
          Math.abs(u)
        );
        expect(
          Math.hypot(position.getX(vertex) - x, position.getY(vertex) + y)
        ).toBeLessThan(3e-5 * grown.form.length);
        checked += 1;
      }
      expect(checked).toBeGreaterThan(2500);
      // The asymmetric flank can extend beyond the midrib tip radius. Include
      // the curve between mesh rows, not only the currently rendered samples.
      for (const t of [0.985, 0.995, 0.999, 0.9999, 0.99999, 1]) {
        const section = sample(t);
        for (let column = 0; column <= 24; column += 1) {
          const u = column / 12 - 1;
          const [x, y] = laminaPoint(
            grown.form,
            u < 0 ? -1 : 1,
            t * t,
            Math.abs(u)
          );
          const point = section.point(u);
          expect(Math.hypot(point[0] - x, point[1] + y)).toBeLessThan(
            3e-5 * grown.form.length
          );
        }
      }
    } finally {
      geometry.dispose();
    }
  });
});

describe("accumulation lifecycle", () => {
  it("can cancel reentrantly from its first completed frame", async () => {
    let presentations = 0;
    let run!: Accumulation;
    run = accumulate({
      camera: new OrthographicCamera(),
      onFrame: () => run.cancel(),
      random: () => 0.5,
      samples: 4,
      scene: new Scene(),
      studio: { sample() {} },
      surface: {
        pixelSize: 1,
        present() {
          presentations += 1;
        },
      } as unknown as RenderSurface,
    });
    await run.ready;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(presentations).toBe(1);
  });
});

describe("renderPlumeria options", () => {
  const canvas = {} as HTMLCanvasElement;
  it("shares the four-frame studio default", () => {
    expect(BOTANICAL_STUDIO.samples).toBe(4);
  });
  it("validates export resolution before requesting a browser canvas", () => {
    expect(() => exportPlumeriaPng({ seed, size: 2049 })).toThrow(RangeError);
  });
  for (const size of [0, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2049])
    it(`rejects size ${size}`, () => {
      expect(() => renderPlumeria({ canvas, seed, size })).toThrow(RangeError);
    });
  for (const pixelSize of [0, 1.5, Number.NaN, 2049])
    it(`rejects pixelSize ${pixelSize}`, () => {
      expect(() => renderPlumeria({ canvas, pixelSize, seed })).toThrow(
        RangeError
      );
    });
  for (const samples of [0, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 257])
    it(`rejects samples ${samples}`, () => {
      expect(() => renderPlumeria({ canvas, samples, seed })).toThrow(
        RangeError
      );
    });
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
    for (const side of [1, -1] as const)
      expect(reach(side, 0.5)).toBeCloseTo(reach(side, 1) / 2, 10);
  });
  it("puts the corolla's visible five-fold mass upright", () => {
    for (const seedValue of ["2", "5", "1", "6", "8", "23"])
      expect(corollaLean(growPlumeria(seedValue).form)).toBeCloseTo(0, 3);
  });
  it("fits the complete corolla to a finite box", () => {
    for (const seedValue of ["2", "5", "1", "6", "8", "23"]) {
      const grown = growPlumeria(seedValue),
        frame = corollaFrame(grown.form);
      const xs: number[] = [],
        ys: number[] = [];
      for (const i of Array(181).keys()) {
        const t = (1 - Math.cos((Math.PI * i) / 180)) / 2;
        for (const side of [-1, 1] as const) {
          const [x, y] = laminaPoint(grown.form, side, t, 1);
          for (const k of Array(5).keys()) {
            const angle = (k * 2 * Math.PI) / 5;
            const rx = x * Math.cos(angle) - y * Math.sin(angle),
              ry = x * Math.sin(angle) + y * Math.cos(angle);
            xs.push(240 + frame.scale * (rx - frame.centerX));
            ys.push(240 + frame.scale * (ry - frame.centerY));
          }
        }
      }
      const minX = Math.min(...xs),
        maxX = Math.max(...xs),
        minY = Math.min(...ys),
        maxY = Math.max(...ys);
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
    const weights = [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) =>
      throatWeight(0.7, 0.5, t, 0)
    );
    expect(weights[0]).toBe(1);
    for (let i = 1; i < weights.length; i += 1)
      expect(weights[i]).toBeLessThan(weights[i - 1]);
    expect(weights.at(-1)).toBe(0);
  });
  it("reaches farther for wide-throated genomes", () => {
    const reaches = [0.22, 0.5, 0.82].map(throatExtent);
    expect(reaches[0]).toBeLessThan(reaches[1]);
    expect(reaches[1]).toBeLessThan(reaches[2]);
    expect(throatWeight(0.82, 0.5, 0.65, 0)).toBeGreaterThan(
      throatWeight(0.5, 0.5, 0.65, 0)
    );
    expect(throatWeight(0.5, 0.5, 0.65, 0)).toBeGreaterThan(
      throatWeight(0.22, 0.5, 0.65, 0)
    );
  });
  it("fades the throat tongue without a pigment seam", () => {
    const extent = throatRayExtent(0.5, 0.5);
    expect(
      Math.abs(
        throatWeight(0.5, 0.5, extent - 0.001, 0) -
          throatWeight(0.5, 0.5, extent + 0.001, 0)
      )
    ).toBeLessThan(0.001);
  });
});

describe("gl vectors", () => {
  const fingerprint = (seedValue: string) => {
    const grown = plumeriaScene({ seed: seedValue });
    const hash = createHash("sha256");
    const mesh = petals(grown.scene)[0];
    hash.update(String(mesh.userData.organ));
    const geometry = mesh.geometry;
    for (const name of Object.keys(geometry.attributes).sort()) {
      hash.update(name);
      hash.update(
        Array.from(geometry.getAttribute(name).array, (value) =>
          Math.round(Number(value) * 100)
        ).join(",")
      );
    }
    hash.update(Array.from(geometry.getIndex()?.array ?? []).join(","));
    const skin = material(grown.scene);
    for (const texture of [
      skin.map,
      skin.bumpMap,
      skin.normalMap,
      skin.displacementMap,
      skin.roughnessMap,
    ]) {
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
        skin.normalScale.x,
        skin.normalScale.y,
        skin.displacementBias,
        skin.displacementScale,
        skin.clearcoat,
        skin.clearcoatRoughness,
        skin.specularIntensity,
        skin.sheen,
        skin.sheenRoughness,
        skin.envMapIntensity,
        skin.onBeforeCompile.toString(),
      ].join(",")
    );
    hash.update(JSON.stringify(BOTANICAL_STUDIO.light));
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
    const result = hash.digest("hex").slice(0, 16);
    grown.dispose();
    return result;
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
      if (child instanceof DirectionalLight || child instanceof SpotLight) {
        light.target = child.target.position.toArray();
        light.shadowIntensity = child.shadow.intensity;
      }
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
    hash.update(JSON.stringify(BOTANICAL_STUDIO));
    hash.update(JSON.stringify(lights));
    const result = hash.digest("hex").slice(0, 16);
    grown.dispose();
    return result;
  };
  // Deterministic appearance contracts; update alongside reviewed visual proofs.
  const cases = [
    {
      image: "0d66d5911570b2a6",
      scene: "4b28c6179ab8825a",
      seed: "2026-06-14",
    },
    { image: "5b2a06c47ce0456b", scene: "63e425e8fe901a91", seed: "hello" },
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
