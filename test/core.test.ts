import { describe, expect, expectTypeOf, it } from "vitest";
import {
  auditSpecimen,
  createAnatomyKit,
  createGenomeRandom,
  type DeepReadonly,
  defineCultivar,
  defineSpecies,
  develop,
  evaluateField,
  evaluateTone,
  type FlowerGenome,
  field,
  grow,
  type JsonValue,
  jsonFingerprint,
  type Matrix4,
  type Point3,
  phyllotaxisTransforms,
  pigment,
  type ScalarField,
  type SpeciesDefinition,
  scale,
  translate,
} from "@/src/core";

const IDENTITY: Matrix4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

type TestTraits = Readonly<{
  count: number;
  length: number;
}>;

const cultivar = {
  id: "plain",
  name: "Plain",
  revision: 1,
  value: { length: 2 },
} as const;

const species: SpeciesDefinition<TestTraits, typeof cultivar.value> = {
  defaultCultivar: cultivar,
  defaultEnvironment: {},
  develop({ anatomy, genome }) {
    const geometry = anatomy.lamina({
      id: "petal",
      length: genome.traits.length,
      width: 2,
    });
    const appearance = anatomy.appearance({
      id: "petal",
      pigment: {
        base: {
          chroma: { kind: "constant", value: 0.02 },
          hue: { kind: "constant", value: 90 },
          kind: "oklch",
          lightness: { kind: "constant", value: 0.95 },
        },
        layers: [],
      },
      tissue: anatomy.tissues.petal({
        softness: 0.8,
        thickness: 0.1,
        translucency: 0.2,
      }),
    });
    return anatomy.flower({
      appearances: [appearance],
      bounds: { maximum: [1.1, 3.1, 0.3], minimum: [-1.1, -0.1, -0.1] },
      geometries: [geometry],
      roots: [
        anatomy.organ({
          appearance: "petal",
          geometry: "petal",
          id: "petal-0",
          semantic: "petal",
          transform: IDENTITY,
        }),
      ],
    });
  },
  format: "@nbot/flower-species",
  formatVersion: 1,
  id: "test-flower",
  name: "Test flower",
  revision: 1,
  sample({ cultivar: selected, random }) {
    return {
      count: random.integer("corolla.count", 5, 8),
      length: selected.value.length + random.range("corolla.length", 0, 1),
    };
  },
};

describe("createGenomeRandom", () => {
  it("addresses draws by meaning instead of call order", () => {
    const first = createGenomeRandom({ namespace: "test/1", seed: "a" });
    const a = first.unit("form.fullness");
    const b = first.unit("pigment.blush");
    const second = createGenomeRandom({ namespace: "test/1", seed: "a" });

    expect(second.unit("pigment.blush")).toBe(b);
    expect(second.unit("form.fullness")).toBe(a);
  });

  it("makes scopes semantic and rejects conflicting path reuse", () => {
    const random = createGenomeRandom({ namespace: "test/1", seed: "a" });
    expect(random.scope("petal").unit("curl")).toBe(random.unit("petal.curl"));
    expect(() => random.range("petal.curl", 0, 1)).toThrow("was reused");
  });

  it("validates paths and distributions", () => {
    const random = createGenomeRandom({ namespace: "test/1", seed: "a" });
    expect(() => random.unit("Petal Curl")).toThrow("semantic path");
    expect(() => random.chance("petal.curl", 2)).toThrow(RangeError);
    expect(() => random.pick("petal.pick", [])).toThrow(RangeError);
  });

  it("interpolates across opposite numeric extremes without overflowing", () => {
    const value = createGenomeRandom({ namespace: "test/1", seed: "a" }).range(
      "form.extreme",
      -Number.MAX_VALUE,
      Number.MAX_VALUE
    );

    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(-Number.MAX_VALUE);
    expect(value).toBeLessThanOrEqual(Number.MAX_VALUE);
  });

  it("copies structured picks instead of returning caller-owned data", () => {
    const choice = { color: "white" };
    const picked = createGenomeRandom({ namespace: "test/1", seed: "a" }).pick(
      "petal.choice",
      [choice]
    );

    expect(picked).toEqual(choice);
    expect(picked).not.toBe(choice);
  });
});

describe("pigment fields", () => {
  it("evaluates composable fields deterministically", () => {
    const texture = field.multiply(
      field.smoothstep(0.2, 0.8, field.coordinate("v")),
      field.noise("petal.fiber", { frequency: 3, octaves: 2 })
    );
    const sample = {
      flower: { x: 0, y: 0, z: 0 },
      organ: { x: 0, y: 0.5, z: 0 },
      seed: "garden-42",
      surface: { u: 0, v: 0.5 },
    } as const;

    expect(evaluateField(texture, sample)).toBe(evaluateField(texture, sample));
    expect(evaluateField(texture, sample)).toBeGreaterThan(0);
    expect(evaluateField(texture, sample)).toBeLessThan(0.5);
  });

  it("rejects ambiguous or malformed field programs at authoring time", () => {
    expect(() => field.add()).toThrow("at least one");
    expect(() => field.noise("texture", { octaves: 0 })).toThrow(RangeError);
    expect(() =>
      field.curve(field.coordinate("v"), [
        [0.5, 0],
        [0.2, 1],
      ])
    ).toThrow("strictly increasing");
    expect(() => field.coordinate("time" as never)).toThrow("coordinate axis");
    expect(() => field.radial("viewport" as never)).toThrow("radial space");
    expect(() => field.noise("texture", { space: "screen" as never })).toThrow(
      "noise space"
    );
    expect(() =>
      pigment.layered("#ffffff", [
        {
          amount: 1,
          blend: "screen" as never,
          color: "#000000",
          id: "invalid",
        },
      ])
    ).toThrow("pigment layer blend");
    expect(() => field.multiply({ kind: "screen" } as never)).toThrow(
      "field.kind screen is not supported"
    );
    expect(() =>
      field.multiply({ axis: "time", kind: "coordinate" } as never)
    ).toThrow("field.axis");
    expect(() => pigment.solid({ kind: "rgb" } as never)).toThrow("tone kind");
  });

  it("rejects arithmetic overflow at the evaluated tone boundary", () => {
    expect(() =>
      evaluateTone(
        {
          chroma: field.multiply(Number.MAX_VALUE, 2),
          hue: field.constant(0),
          kind: "oklch",
          lightness: field.constant(0.5),
        },
        {
          flower: { x: 0, y: 0, z: 0 },
          organ: { x: 0, y: 0, z: 0 },
          seed: "overflow",
          surface: { u: 0, v: 0 },
        }
      )
    ).toThrow("must be finite");
  });

  it("deeply freezes field programs without freezing caller-owned inputs", () => {
    const input: ScalarField = {
      edge0: { kind: "constant", value: 0.1 },
      edge1: { kind: "constant", value: 0.9 },
      input: { axis: "v", kind: "coordinate" },
      kind: "smoothstep",
    };
    const program = field.multiply(0.5, input);

    expect(Object.isFrozen(program)).toBe(true);
    if (program.kind !== "multiply") throw new Error("expected a product");
    expect(Object.isFrozen(program.inputs[1])).toBe(true);
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(input.edge0)).toBe(false);
  });

  it("fails clearly when a renderer sample lacks a requested feature", () => {
    const sample = {
      features: {},
      flower: { x: 0, y: 0, z: 0 },
      organ: { x: 0, y: 0, z: 0 },
      seed: "garden-42",
      surface: { u: 0, v: 0 },
    } as const;

    expect(() => evaluateField(field.feature("missing"), sample)).toThrow(
      "feature missing"
    );
    expect(() => evaluateField(field.feature("toString"), sample)).toThrow(
      "feature toString"
    );
  });
});

describe("anatomy authoring", () => {
  it("rejects misspelled lamina profiles and tips", () => {
    const anatomy = createAnatomyKit("literal-validation");
    expect(() =>
      anatomy.lamina({
        id: "petal",
        length: 1,
        profile: "elliptical" as never,
        shoulder: 0.5,
        width: 0.4,
      })
    ).toThrow("lamina profile");
    expect(() =>
      anatomy.lamina({
        id: "petal",
        length: 1,
        tip: "rounded" as never,
        width: 0.4,
      })
    ).toThrow("lamina tip");
  });

  it("binds geometry, pigment and tissue into reusable flower parts", () => {
    const anatomy = createAnatomyKit("parts");
    const geometry = anatomy.ellipsoid({
      id: "floret",
      radii: [0.1, 0.12, 0.08],
    });
    const outer = anatomy.part({
      geometry,
      id: "outer-floret",
      pigment: pigment.solid("#f0bc24"),
      tissue: anatomy.tissues.pollen(),
    });
    const core = anatomy.part({
      geometry,
      id: "core-floret",
      pigment: pigment.solid("#b87512"),
      tissue: anatomy.tissues.pollen(),
    });
    const raisedGeometry = anatomy.ellipsoid({
      id: "raised-floret",
      radii: [0.08, 0.1, 0.12],
    });
    const raised = anatomy.part({
      appearance: outer.appearance,
      geometry: raisedGeometry,
      id: "raised-floret",
    });
    const model = anatomy.flower({
      parts: [outer, core, raised],
      roots: [
        anatomy.radial({
          count: 12,
          id: "outer-ring",
          part: outer,
          radius: 0.4,
          semantic: "disk-floret",
        }),
        anatomy.organ({
          id: "core",
          part: core,
          semantic: "disk-floret",
        }),
        anatomy.organ({
          id: "raised",
          part: raised,
          semantic: "disk-floret",
          transform: translate(0, 0, 0.2),
        }),
      ],
    });

    expect(Object.keys(model.geometries)).toEqual(["floret", "raised-floret"]);
    expect(Object.keys(model.appearances)).toEqual([
      "outer-floret",
      "core-floret",
    ]);
    expect(model.roots[0]).toMatchObject({
      template: { appearance: "outer-floret", geometry: "floret" },
    });
    expect(Object.isFrozen(outer)).toBe(true);
  });

  it("measures portrait bounds when the author does not supply them", () => {
    const anatomy = createAnatomyKit("automatic-bounds");
    const geometry = anatomy.lamina({
      crown: 0.2,
      id: "petal",
      length: 2,
      thickness: 0.04,
      width: 1,
    });
    const appearance = anatomy.appearance({
      id: "petal",
      pigment: pigment.solid("#fffdf7"),
      tissue: anatomy.tissues.petal(),
    });
    const model = anatomy.flower({
      appearances: [appearance],
      geometries: [geometry],
      roots: [
        anatomy.organ({
          appearance,
          geometry,
          id: "petal",
          semantic: "petal",
          transform: translate(0.5, -0.25, 0.1),
        }),
      ],
    });

    expect(model.portrait.bounds.minimum[0]).toBeLessThan(0.1);
    expect(model.portrait.bounds.maximum[0]).toBeGreaterThan(0.9);
    expect(model.portrait.bounds.minimum[1]).toBeCloseTo(-0.25);
    expect(model.portrait.bounds.maximum[1]).toBeCloseTo(1.75);
    expect(model.portrait.bounds.maximum[2]).toBeGreaterThan(0.4);
  });

  it("supports named tissue outside the built-in material presets", () => {
    const ovary = createAnatomyKit("custom-tissue").tissues.custom("ovary", {
      softness: 0.4,
      thickness: 0.7,
      translucency: 0.05,
    });

    expect(ovary).toEqual({
      softness: 0.4,
      thickness: 0.7,
      translucency: 0.05,
      type: "ovary",
    });
    expect(() => createAnatomyKit("empty-tissue").tissues.custom(" ")).toThrow(
      "must not be empty"
    );
  });

  it("gives planar meshes a non-degenerate automatic depth bound", () => {
    const anatomy = createAnatomyKit("planar-mesh-bounds");
    const geometry = anatomy.mesh({
      id: "petal",
      indices: [0, 1, 2],
      positions: [
        [-1, 0, 0],
        [1, 0, 0],
        [0, 2, 0],
      ],
    });
    const appearance = anatomy.appearance({
      id: "petal",
      pigment: pigment.solid("#fffdf7"),
      tissue: anatomy.tissues.petal(),
    });
    const model = anatomy.flower({
      appearances: [appearance],
      geometries: [geometry],
      roots: [
        anatomy.organ({
          appearance,
          geometry,
          id: "petal",
          semantic: "petal",
        }),
      ],
    });

    expect(model.portrait.bounds.minimum.slice(0, 2)).toEqual([-1, 0]);
    expect(model.portrait.bounds.maximum.slice(0, 2)).toEqual([1, 2]);
    expect(model.portrait.bounds.minimum[2]).toBeLessThan(0);
    expect(model.portrait.bounds.maximum[2]).toBeGreaterThan(0);
  });

  it("accepts interface-shaped JSON traits and preserves tuple arity", () => {
    interface InterfaceCultivar {
      length: number;
    }
    interface InterfaceTraits {
      origin: Point3;
      petalCount: number;
    }

    const interfaceSpecies = defineSpecies<InterfaceTraits, InterfaceCultivar>({
      defaultCultivar: {
        id: "interface-default",
        name: "Interface default",
        value: { length: 1 },
      },
      develop({ anatomy }) {
        const geometry = anatomy.ellipsoid({
          id: "center",
          radii: [0.2, 0.2, 0.1],
        });
        const appearance = anatomy.appearance({
          id: "center",
          pigment: pigment.solid("#fffdf7"),
          tissue: anatomy.tissues.petal(),
        });
        return anatomy.flower({
          appearances: [appearance],
          bounds: {
            maximum: [0.21, 0.21, 0.11],
            minimum: [-0.21, -0.21, -0.11],
          },
          geometries: [geometry],
          roots: [
            anatomy.organ({
              appearance,
              geometry,
              id: "center",
              semantic: "center",
            }),
          ],
        });
      },
      id: "interface-flower",
      sample: ({ cultivar: selected }) => ({
        origin: [0, selected.value.length, 0],
        petalCount: 5,
      }),
    });
    const specimen = grow(interfaceSpecies, { seed: "reference" });

    expect(specimen.genome.traits.origin).toEqual([0, 1, 0]);
    expectTypeOf<
      DeepReadonly<InterfaceTraits>["origin"]
    >().toEqualTypeOf<Point3>();
  });

  it("exposes deeply frozen cultivar values as deeply readonly", () => {
    interface MutableCultivarValue {
      form: { length: number };
      origin: [number, number, number];
    }

    const authored = defineCultivar<MutableCultivarValue>({
      id: "typed-cultivar",
      name: "Typed cultivar",
      value: { form: { length: 2 }, origin: [0, 0, 0] },
    });

    expectTypeOf(authored.value).toEqualTypeOf<
      DeepReadonly<MutableCultivarValue>
    >();
    expect(Object.isFrozen(authored.value.form)).toBe(true);
    expect(Object.isFrozen(authored.value.origin)).toBe(true);
  });

  it("threads a typed environment through sampling and persisted genomes", () => {
    interface Climate {
      daylightHours: number;
      location: { latitude: number };
    }

    const climateSpecies = defineSpecies<
      TestTraits,
      typeof cultivar.value,
      Climate
    >({
      defaultCultivar: cultivar,
      defaultEnvironment: {
        daylightHours: 12,
        location: { latitude: 0 },
      },
      develop({ anatomy, genome }) {
        const center = anatomy.ellipsoid({
          id: "center",
          radii: [genome.traits.length / 10, genome.traits.length / 10, 0.1],
        });
        const appearance = anatomy.appearance({
          id: "center",
          pigment: pigment.solid("#ffffff"),
          tissue: anatomy.tissues.pollen(),
        });
        return anatomy.flower({
          appearances: [appearance],
          geometries: [center],
          roots: [
            anatomy.organ({
              appearance,
              geometry: center,
              id: "center",
              semantic: "center",
            }),
          ],
        });
      },
      id: "climate-flower",
      sample({ cultivar: selected, environment }) {
        return {
          count: Math.round(environment.daylightHours),
          length:
            selected.value.length + Math.abs(environment.location.latitude),
        };
      },
    });
    const specimen = grow(climateSpecies, {
      environment: {
        daylightHours: 14.5,
        location: { latitude: 1.25 },
      },
      seed: "summer",
    });

    expect(specimen.genome.traits).toEqual({ count: 15, length: 3.25 });
    expect(specimen.genome.environment.location.latitude).toBe(1.25);
    expect(Object.isFrozen(specimen.genome.environment.location)).toBe(true);
    expectTypeOf(specimen.genome.environment).toEqualTypeOf<
      DeepReadonly<Climate>
    >();
  });

  it("uses full edge-to-edge width and exposes meaningful tip profiles", () => {
    const anatomy = createAnatomyKit("test");
    const rounded = anatomy.lamina({
      id: "rounded",
      length: 2,
      tip: "round",
      width: 2,
    });
    const pointed = anatomy.lamina({
      id: "pointed",
      length: 2,
      tip: "pointed",
      width: 2,
    });
    const softPoint = anatomy.lamina({
      id: "soft-point",
      length: 2,
      tip: "soft-point",
      width: 2,
    });
    const roundedWidth =
      Math.max(...rounded.outline.map(([x]) => x)) -
      Math.min(...rounded.outline.map(([x]) => x));
    const nearTip = rounded.sections.length - 3;

    expect(roundedWidth).toBeCloseTo(2, 1);
    expect(rounded.sections[nearTip].right[0]).toBeGreaterThan(
      softPoint.sections[nearTip].right[0]
    );
    expect(softPoint.sections[nearTip].right[0]).toBeGreaterThan(
      pointed.sections[nearTip].right[0]
    );
  });

  it("injects format metadata while rejecting degenerate helpers", () => {
    const authoredCultivar = defineCultivar<typeof cultivar.value>({
      id: "plain",
      name: " Plain ",
      value: { length: 2 },
    });
    const authoredSpecies = defineSpecies<TestTraits, typeof cultivar.value>({
      defaultCultivar: authoredCultivar,
      develop: species.develop,
      id: "authored-flower",
      sample: species.sample,
    });

    expect(authoredCultivar.revision).toBe(1);
    expect(authoredCultivar.name).toBe("Plain");
    expect(authoredSpecies.format).toBe("@nbot/flower-species");
    expect(authoredSpecies.formatVersion).toBe(1);
    expect(authoredSpecies.revision).toBe(1);
    expect(() => scale(0)).toThrow("must not be zero");
    expect(() =>
      createAnatomyKit("test").mesh({
        id: "flat",
        indices: [0, 1, 2],
        positions: [
          [0, 0, 0],
          [1, 0, 0],
          [2, 0, 0],
        ],
      })
    ).toThrow("must not be degenerate");
    expect(() =>
      createAnatomyKit("test").sweep({
        id: "repeated",
        path: [
          [0, 0, 0],
          [0, 0, 0],
          [0, 1, 0],
        ],
        radius: 0.1,
      })
    ).toThrow("must differ");
    expect(() =>
      createAnatomyKit("test").sweep({
        id: "cusped",
        path: [
          [0, 0, 0],
          [1, 0, 0],
          [2, 0, 0],
          [1, 0, 0],
        ],
        radius: 0.1,
      })
    ).toThrow("undefined tangent");
    expect(() =>
      createAnatomyKit("test").sweep({
        id: "unequal-cusp",
        path: [
          [0, 0, 0],
          [1, 0, 0],
          [2, 0, 0],
          [0.5, 0, 0],
        ],
        radius: 0.1,
      })
    ).toThrow("undefined tangent");
  });

  it("accepts a monotone sweep with very uneven segment lengths", () => {
    const geometry = createAnatomyKit("test").sweep({
      id: "uneven",
      path: [
        [0, 0, 0],
        [5e-7, 0, 0],
        [1, 0, 0],
      ],
      radius: 0.1,
    });

    expect(geometry.path).toHaveLength(3);
  });

  it("fills phyllotactic annuli without changing the disk default", () => {
    const disk = phyllotaxisTransforms({ count: 4, radius: 1 });
    const annulus = phyllotaxisTransforms({
      count: 4,
      innerRadius: 0.75,
      radius: 1,
    });
    const radialDistance = (transform: Matrix4) =>
      Math.hypot(transform[12], transform[13]);

    expect(radialDistance(disk[0])).toBeCloseTo(Math.sqrt(0.125));
    expect(radialDistance(annulus[0])).toBeGreaterThan(0.75);
    expect(() =>
      phyllotaxisTransforms({ count: 4, innerRadius: 1.1, radius: 1 })
    ).toThrow("inner radius");
  });

  it("copies geometry data before making authored output immutable", () => {
    const anatomy = createAnatomyKit("test");
    const path: [number, number, number][] = [
      [0, 0, 0],
      [0, 1, 0],
    ];
    const authored = anatomy.sweep({ id: "filament", path, radius: 0.1 });

    expect(authored.path).not.toBe(path);
    expect(Object.isFrozen(authored.path[0])).toBe(true);
    expect(Object.isFrozen(path[0])).toBe(false);
  });

  it("validates all ellipsoid axes and accepts an explicitly absent mesh UV set", () => {
    const anatomy = createAnatomyKit("test");

    expect(() =>
      anatomy.ellipsoid({
        id: "broken",
        radii: [1, 2] as unknown as readonly [number, number, number],
      })
    ).toThrow("3 finite numbers");
    expect(
      anatomy.mesh({
        id: "triangle",
        indices: [0, 1, 2],
        positions: [
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0],
        ],
        surfaceCoordinates: undefined,
      }).surfaceCoordinates
    ).toBeUndefined();
  });

  it("does not freeze cultivar data owned by the caller", () => {
    const value = { form: { length: 2 } };
    const authored = defineCultivar({
      id: "caller-owned",
      name: "Caller owned",
      value,
    });

    expect(authored.value).toEqual(value);
    expect(authored.value).not.toBe(value);
    expect(Object.isFrozen(authored.value.form)).toBe(true);
    expect(Object.isFrozen(value.form)).toBe(false);
  });
});

describe("grow", () => {
  it("materializes one frozen JSON genome before development", () => {
    const first = grow(species, { seed: "garden-42" });
    const second = grow(species, { seed: "garden-42" });

    expect(first).toEqual(second);
    expect(JSON.parse(JSON.stringify(first.genome))).toEqual(first.genome);
    expect(first.genome.cultivar.value).toEqual(cultivar.value);
    expect(Object.isFrozen(first.genome.traits)).toBe(true);
    expect(Object.isFrozen(first.model.roots)).toBe(true);
    expect(auditSpecimen(first)).toEqual([]);
  });

  it("keeps display labels outside author phenotype callbacks", () => {
    const observed = { develop: false, sample: false };
    const labelSpecies = defineSpecies<TestTraits, typeof cultivar.value>({
      defaultCultivar: cultivar,
      develop(input) {
        observed.develop =
          "name" in input.genome.cultivar || "name" in input.genome.species;
        return species.develop(input);
      },
      id: "label-free-callbacks",
      sample(input) {
        observed.sample = "name" in input.cultivar;
        return species.sample(input);
      },
    });
    const specimen = grow(labelSpecies, { seed: "garden-42" });

    expect(observed).toEqual({ develop: false, sample: false });
    expect(specimen.genome.cultivar.name).toBe("Plain");
    expect(specimen.genome.species.name).toBe("label free callbacks");
  });

  it("audits a hand-authored sweep cusp before either renderer sees it", () => {
    const specimen = grow(species, { seed: "garden-42" });
    const broken = {
      ...specimen,
      model: {
        ...specimen.model,
        geometries: {
          ...specimen.model.geometries,
          petal: {
            id: "petal",
            kind: "sweep",
            path: [
              [0, 0, 0],
              [1, 0, 0],
              [2, 0, 0],
              [0.5, 0, 0],
            ],
            radius: [0.1, 0.1, 0.1, 0.1],
          },
        },
      },
    } as typeof specimen;

    expect(auditSpecimen(broken).map((issue) => issue.code)).toContain(
      "sweep-cusp"
    );
  });

  it("normalizes negative zero before identity and development", () => {
    const negativeZeroSpecies = defineSpecies<
      { direction: number },
      Record<string, never>
    >({
      defaultCultivar: {
        id: "plain",
        name: "Plain",
        value: {},
      },
      develop({ anatomy, genome }) {
        const radius = Object.is(genome.traits.direction, -0) ? 1 : 2;
        const geometry = anatomy.ellipsoid({
          id: "center",
          radii: [radius, radius, radius],
        });
        const appearance = anatomy.appearance({
          id: "center",
          pigment: pigment.solid("#fffdf7"),
          tissue: anatomy.tissues.pollen(),
        });
        return anatomy.flower({
          appearances: [appearance],
          bounds: { maximum: [2.1, 2.1, 2.1], minimum: [-2.1, -2.1, -2.1] },
          geometries: [geometry],
          roots: [
            anatomy.organ({
              appearance,
              geometry,
              id: "center",
              semantic: "center",
            }),
          ],
        });
      },
      id: "negative-zero",
      sample: () => ({ direction: -0 }),
    });
    const original = grow(negativeZeroSpecies, { seed: "reference" });
    const persisted = JSON.parse(
      JSON.stringify(original.genome)
    ) as FlowerGenome<{ direction: number }>;
    const restored = develop(negativeZeroSpecies, persisted);

    expect(Object.is(original.genome.traits.direction, -0)).toBe(false);
    expect(restored).toEqual(original);
  });

  it("reports cyclic sampled traits as an authoring error", () => {
    const cyclic: Record<string, JsonValue> = {};
    cyclic.self = cyclic;
    const broken = { ...species, sample: () => cyclic as TestTraits };

    expect(() => grow(broken, { seed: "garden-42" })).toThrow("cycles");
  });

  it("keeps environment in the immutable identity input", () => {
    const environment = {
      weather: { season: "summer" },
    } satisfies Record<string, JsonValue>;
    const specimen = grow(species, { environment, seed: "garden-42" });

    expect(specimen.genome.environment).toEqual(environment);
    expect(specimen.genome.environment).not.toBe(environment);
    expect(Object.isFrozen(specimen.genome.environment)).toBe(true);
    expect(Object.isFrozen(environment.weather)).toBe(false);
    expect(specimen.model.genomeId).not.toBe(
      grow(species, { seed: "garden-42" }).model.genomeId
    );
  });

  it("uses canonical JSON fingerprints and rejects empty identities", () => {
    expect(jsonFingerprint({ a: 1, b: 2 })).toBe(
      jsonFingerprint({ b: 2, a: 1 })
    );
    expect(() => grow(species, { seed: "" })).toThrow("non-empty");
    expect(() => jsonFingerprint(Array(1))).toThrow("sparse array hole");
  });

  it("validates and develops a persisted concrete genome", () => {
    const original = grow(species, { seed: "garden-42" });
    const persisted = JSON.parse(
      JSON.stringify(original.genome)
    ) as FlowerGenome<TestTraits>;

    const restored = develop(species, persisted);

    expect(restored).toEqual(original);
    expect(restored.genome).not.toBe(persisted);
    expect(Object.isFrozen(restored.genome.traits)).toBe(true);
    expect(Object.isFrozen(persisted.traits)).toBe(false);

    const tampered = {
      ...persisted,
      traits: { ...persisted.traits, length: persisted.traits.length + 1 },
    };
    expect(() => develop(species, tampered)).toThrow(
      "traits do not match its species"
    );

    const renamed = {
      ...persisted,
      cultivar: { ...persisted.cultivar, name: "Renamed cultivar" },
      species: { ...persisted.species, name: "Renamed species" },
    };
    expect(develop(species, renamed).model.genomeId).toBe(
      original.model.genomeId
    );
  });

  it("validates the complete persisted genome envelope", () => {
    const persisted = JSON.parse(
      JSON.stringify(grow(species, { seed: "garden-42" }).genome)
    ) as FlowerGenome<TestTraits>;
    const missingCultivar = { ...persisted, cultivar: null };
    const unexpected = { ...persisted, renderer: "svg" };

    expect(() =>
      develop(species, missingCultivar as unknown as FlowerGenome<TestTraits>)
    ).toThrow("genome.cultivar must be an object");
    expect(() =>
      develop(species, unexpected as unknown as FlowerGenome<TestTraits>)
    ).toThrow("not part of this format");
  });

  it("rejects incomplete species and non-record environments at runtime", () => {
    expect(() =>
      defineSpecies({
        defaultCultivar: cultivar,
        defaultEnvironment: ["summer"],
        develop: species.develop,
        id: "array-environment",
        sample: species.sample,
      } as never)
    ).toThrow("defaultEnvironment must be an object");
    expect(() =>
      defineSpecies({
        defaultCultivar: cultivar,
        develop: null,
        id: "missing-callbacks",
        sample: null,
      } as never)
    ).toThrow("sample and develop functions");
  });

  it("reports broken renderer-neutral references", () => {
    const specimen = grow(species, { seed: "garden-42" });
    const broken = {
      ...specimen,
      model: {
        ...specimen.model,
        roots: [
          ...specimen.model.roots,
          {
            appearance: "missing",
            geometry: "missing",
            id: "petal-0",
            kind: "organ" as const,
            semantic: "petal",
            transform: IDENTITY,
          },
        ],
      },
    };
    const codes = auditSpecimen(broken).map((issue) => issue.code);

    expect(codes).toContain("duplicate-id");
    expect(codes).toContain("missing-geometry");
    expect(codes).toContain("missing-appearance");
  });

  it("does not mistake Object prototype names for model references", () => {
    const specimen = grow(species, { seed: "garden-42" });
    const root = specimen.model.roots[0];
    if (root.kind !== "organ") throw new Error("fixture root must be an organ");
    const broken = {
      ...specimen,
      model: {
        ...specimen.model,
        roots: [
          {
            ...root,
            appearance: "toString",
            geometry: "constructor",
          },
        ],
      },
    };
    const codes = auditSpecimen(broken).map((issue) => issue.code);

    expect(codes).toContain("missing-geometry");
    expect(codes).toContain("missing-appearance");
  });

  it("rejects nonnumeric transform components at the model boundary", () => {
    const brokenTransform = [...IDENTITY];
    (brokenTransform as unknown[])[12] = "oops";
    const broken = defineSpecies({
      defaultCultivar: defineCultivar({
        id: "plain",
        name: "Plain",
        value: {},
      }),
      develop({ anatomy }) {
        const geometry = anatomy.ellipsoid({
          id: "center",
          radii: [1, 1, 1],
        });
        const appearance = anatomy.appearance({
          id: "center",
          pigment: pigment.solid("#fffdf7"),
          tissue: anatomy.tissues.pollen(),
        });
        return anatomy.flower({
          appearances: [appearance],
          bounds: { maximum: [2, 2, 2], minimum: [-2, -2, -2] },
          geometries: [geometry],
          roots: [
            anatomy.organ({
              appearance,
              geometry,
              id: "center",
              semantic: "center",
              transform: brokenTransform as unknown as Matrix4,
            }),
          ],
        });
      },
      id: "broken-transform",
      sample: () => ({}),
    });

    expect(() => grow(broken, { seed: "reference" })).toThrow(
      "transform-component"
    );
  });

  it("accepts invertible transforms independently of model scale", () => {
    const microscopic = defineSpecies({
      defaultCultivar: defineCultivar({
        id: "plain",
        name: "Plain",
        value: {},
      }),
      develop({ anatomy }) {
        const geometry = anatomy.ellipsoid({
          id: "center",
          radii: [1, 1, 1],
        });
        const appearance = anatomy.appearance({
          id: "center",
          pigment: pigment.solid("#fffdf7"),
          tissue: anatomy.tissues.pollen(),
        });
        return anatomy.flower({
          appearances: [appearance],
          bounds: {
            maximum: [0.00011, 0.00011, 0.00011],
            minimum: [-0.00011, -0.00011, -0.00011],
          },
          geometries: [geometry],
          roots: [
            anatomy.organ({
              appearance,
              geometry,
              id: "center",
              semantic: "center",
              transform: scale(0.0001),
            }),
          ],
        });
      },
      id: "microscopic-transform",
      sample: () => ({}),
    });

    expect(auditSpecimen(grow(microscopic, { seed: "reference" }))).toEqual([]);
  });

  it("reports pigment features that a geometry cannot provide", () => {
    const specimen = grow(species, { seed: "garden-42" });
    const appearance = specimen.model.appearances.petal;
    const broken = {
      ...specimen,
      model: {
        ...specimen.model,
        appearances: {
          ...specimen.model.appearances,
          petal: {
            ...appearance,
            pigment: pigment.layered("#fffdf7", [
              {
                amount: field.feature("missing-vein"),
                color: "#e8b51f",
                id: "missing-feature",
              },
            ]),
          },
        },
      },
    };

    expect(auditSpecimen(broken).map((issue) => issue.code)).toContain(
      "missing-feature"
    );
  });

  it("reports geometry outside the declared portrait bounds", () => {
    const specimen = grow(species, { seed: "garden-42" });
    const broken = {
      ...specimen,
      model: {
        ...specimen.model,
        portrait: {
          ...specimen.model.portrait,
          bounds: { maximum: [0.1, 0.1, 0.1], minimum: [-0.1, -0.1, -0.1] },
        },
      },
    } as typeof specimen;

    expect(auditSpecimen(broken).map((issue) => issue.code)).toContain(
      "bounds-containment"
    );
  });

  it("includes the rendered Catmull–Rom centerline in sweep bounds", () => {
    const curveSpecies = defineSpecies({
      defaultCultivar: defineCultivar({
        id: "plain",
        name: "Plain",
        value: {},
      }),
      develop({ anatomy }) {
        const geometry = anatomy.sweep({
          id: "curved-filament",
          path: [
            [-0.694945214606961, 0.20602194751604763, 0],
            [0.888350558379021, 0.6557220742291103, 0],
            [0.8579980875701299, 0.01368850468416416, 0],
            [-0.21308111336976987, -0.08645902425696894, 0],
          ],
          radius: 0.01,
        });
        const appearance = anatomy.appearance({
          id: "filament",
          pigment: pigment.solid("#fffdf7"),
          tissue: anatomy.tissues.filament(),
        });
        return anatomy.flower({
          appearances: [appearance],
          bounds: {
            maximum: [0.898350558379021, 0.6657220742291103, 0.01],
            minimum: [-0.704945214606961, -0.09645902425696894, -0.01],
          },
          geometries: [geometry],
          roots: [
            anatomy.organ({
              appearance,
              geometry,
              id: "filament",
              semantic: "filament",
            }),
          ],
        });
      },
      id: "curve-bounds",
      sample: () => ({}),
    });

    expect(() => grow(curveSpecies, { seed: "reference" })).toThrow(
      "bounds-containment"
    );
  });

  it("includes exact SVG Catmull–Rom lamina extrema in portrait bounds", () => {
    const curveSpecies = defineSpecies({
      defaultCultivar: defineCultivar({
        id: "plain",
        name: "Plain",
        value: {},
      }),
      develop({ anatomy }) {
        const geometry = anatomy.lamina({
          bend: 3,
          id: "ruffled-petal",
          length: 1,
          ruffle: { amplitude: 0.3, phase: 4, waves: 2 },
          samples: 8,
          width: 1,
        });
        const appearance = anatomy.appearance({
          id: "petal",
          pigment: pigment.solid("#fffdf7"),
          tissue: anatomy.tissues.petal(),
        });
        const points = geometry.sections.flatMap((section) =>
          [section.left, section.center, section.right].flatMap((point) => [
            [point[0], point[1], point[2] - section.thickness] as Point3,
            [point[0], point[1], point[2] + section.thickness] as Point3,
          ])
        );
        const minimum: Point3 = [
          Math.min(...points.map((point) => point[0])),
          Math.min(...points.map((point) => point[1])),
          Math.min(...points.map((point) => point[2])),
        ];
        const maximum: Point3 = [
          Math.max(...points.map((point) => point[0])),
          Math.max(...points.map((point) => point[1])),
          Math.max(...points.map((point) => point[2])),
        ];
        return anatomy.flower({
          appearances: [appearance],
          bounds: { maximum, minimum },
          geometries: [geometry],
          roots: [
            anatomy.organ({
              appearance,
              geometry,
              id: "ruffled-petal",
              semantic: "petal",
            }),
          ],
        });
      },
      id: "lamina-curve-bounds",
      sample: () => ({}),
    });

    expect(() => grow(curveSpecies, { seed: "reference" })).toThrow(
      "bounds-containment"
    );
  });

  it("rejects hand-authored noise programs above the public octave limit", () => {
    const excessiveNoise: ScalarField = {
      frequency: 1,
      kind: "noise",
      octaves: 9,
      seedPath: "petal.fiber",
      space: "surface",
    };
    const noisySpecies = defineSpecies({
      defaultCultivar: defineCultivar({
        id: "plain",
        name: "Plain",
        value: {},
      }),
      develop({ anatomy }) {
        const geometry = anatomy.ellipsoid({
          id: "center",
          radii: [1, 1, 1],
        });
        const solid = pigment.solid("#fffdf7");
        const appearance = anatomy.appearance({
          id: "center",
          pigment: {
            ...solid,
            base: { ...solid.base, lightness: excessiveNoise },
          },
          tissue: anatomy.tissues.pollen(),
        });
        return anatomy.flower({
          appearances: [appearance],
          bounds: { maximum: [1.1, 1.1, 1.1], minimum: [-1.1, -1.1, -1.1] },
          geometries: [geometry],
          roots: [
            anatomy.organ({
              appearance,
              geometry,
              id: "center",
              semantic: "center",
            }),
          ],
        });
      },
      id: "excessive-noise",
      sample: () => ({}),
    });

    expect(() => grow(noisySpecies, { seed: "reference" })).toThrow(
      "noise-octaves"
    );
  });

  it("reports non-finite genome data without throwing from the audit", () => {
    const specimen = grow(species, { seed: "garden-42" });
    const broken = {
      ...specimen,
      genome: {
        ...specimen.genome,
        traits: { ...specimen.genome.traits, length: Number.NaN },
      },
    } as typeof specimen;

    const codes = auditSpecimen(broken).map((issue) => issue.code);
    expect(codes).toContain("non-finite");
    expect(codes).toContain("genome-json");
  });
});
