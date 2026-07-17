import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { daisy, passionflower, sunflower } from "@/src/catalog";
import {
  defineCultivar,
  defineSpecies,
  field,
  grow,
  multiplyTransforms,
  type Point3,
  pigment,
  rotateY,
  scale,
  translate,
} from "@/src/core";
import { renderSvg } from "@/src/svg";
import { serializeSvg, svgNode } from "@/src/svg/writer";

function references(svg: string): readonly string[] {
  return [...svg.matchAll(/(?:href|xlink:href)="#([^"]+)"/g)].map(
    (match) => match[1]
  );
}

function ids(svg: string): ReadonlySet<string> {
  return new Set([...svg.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
}

function stopColors(markup: string): readonly string[] {
  return [...markup.matchAll(/stop-color:(#[0-9a-f]{6})/g)].map(
    (match) => match[1]
  );
}

function brightness(hex: string): number {
  return [1, 3, 5].reduce(
    (sum, offset) => sum + Number.parseInt(hex.slice(offset, offset + 2), 16),
    0
  );
}

const fixtureCultivar = defineCultivar({
  id: "plain",
  name: "Plain",
  value: {},
});

const sweepFixture = defineSpecies({
  defaultCultivar: fixtureCultivar,
  develop({ anatomy }) {
    const geometry = anatomy.sweep({
      id: "filament",
      path: [
        [0, 0, 0],
        [0, 1, 0],
      ],
      radius: [0.2, 0.05],
    });
    const appearance = anatomy.appearance({
      id: "filament",
      pigment: pigment.solid("#7542a8"),
      tissue: anatomy.tissues.filament(),
    });
    return anatomy.flower({
      appearances: [appearance],
      bounds: { maximum: [0.25, 1.1, 0.25], minimum: [-0.25, -0.25, -0.25] },
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
  id: "sweep-fixture",
  sample: () => ({}),
});

const curvedSweepFixture = defineSpecies({
  defaultCultivar: fixtureCultivar,
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
      pigment: pigment.solid("#7542a8"),
      tissue: anatomy.tissues.filament(),
    });
    return anatomy.flower({
      appearances: [appearance],
      bounds: { maximum: [1.2, 0.9, 0.1], minimum: [-1.1, -0.4, -0.1] },
      geometries: [geometry],
      roots: [
        anatomy.organ({
          appearance,
          geometry,
          id: "curved-filament",
          semantic: "curved-filament",
        }),
      ],
    });
  },
  id: "curved-sweep-fixture",
  sample: () => ({}),
});

const coordinateSweepFixture = defineSpecies({
  defaultCultivar: fixtureCultivar,
  develop({ anatomy }) {
    const geometry = anatomy.sweep({
      id: "horizontal-filament",
      path: [
        [-1, 0, 0],
        [0, 0, 0],
        [1, 0, 0],
      ],
      radius: 0.08,
    });
    const appearance = anatomy.appearance({
      id: "coordinate-paint",
      pigment: pigment.layered("#000000", [
        {
          amount: field.smoothstep(-1, 1, field.coordinate("x")),
          color: "#ffffff",
          id: "across-path",
        },
      ]),
      tissue: anatomy.tissues.filament(),
    });
    return anatomy.flower({
      appearances: [appearance],
      bounds: { maximum: [1.1, 0.1, 0.1], minimum: [-1.1, -0.1, -0.1] },
      geometries: [geometry],
      roots: [
        anatomy.organ({
          appearance,
          geometry,
          id: "horizontal-filament",
          semantic: "horizontal-filament",
        }),
      ],
    });
  },
  id: "coordinate-sweep-fixture",
  sample: () => ({}),
});

const circumferentialSweepFixture = defineSpecies({
  defaultCultivar: fixtureCultivar,
  develop({ anatomy }) {
    const geometry = anatomy.sweep({
      id: "circumferential-filament",
      path: [
        [0, -1, 0],
        [0, 0, 0],
        [0, 1, 0],
      ],
      radius: 0.2,
    });
    const appearance = anatomy.appearance({
      id: "circumferential-paint",
      pigment: pigment.layered("#000000", [
        {
          amount: field.smoothstep(-1, 1, field.coordinate("u")),
          color: "#ffffff",
          id: "around-path",
        },
      ]),
      tissue: anatomy.tissues.filament(),
    });
    return anatomy.flower({
      appearances: [appearance],
      bounds: { maximum: [0.3, 1.3, 0.3], minimum: [-0.3, -1.3, -0.3] },
      geometries: [geometry],
      roots: [
        anatomy.organ({
          appearance,
          geometry,
          id: "circumferential-filament",
          semantic: "circumferential-filament",
        }),
      ],
    });
  },
  id: "circumferential-sweep-fixture",
  sample: () => ({}),
});

const surfaceCoordinateSweepFixture = defineSpecies({
  defaultCultivar: fixtureCultivar,
  develop({ anatomy }) {
    const geometry = anatomy.sweep({
      id: "surface-coordinate-filament",
      path: [
        [0, -1, 0],
        [0, 0, 0],
        [0, 1, 0],
      ],
      radius: 0.2,
    });
    const appearance = anatomy.appearance({
      id: "surface-coordinate-paint",
      pigment: pigment.layered("#000000", [
        {
          amount: field.smoothstep(-0.2, 0.2, field.coordinate("x")),
          color: "#ffffff",
          id: "local-x",
        },
      ]),
      tissue: anatomy.tissues.filament(),
    });
    return anatomy.flower({
      appearances: [appearance],
      bounds: { maximum: [0.3, 1.3, 0.3], minimum: [-0.3, -1.3, -0.3] },
      geometries: [geometry],
      roots: [
        anatomy.organ({
          appearance,
          geometry,
          id: "surface-coordinate-filament",
          semantic: "surface-coordinate-filament",
        }),
      ],
    });
  },
  id: "surface-coordinate-sweep-fixture",
  sample: () => ({}),
});

const returningSweepFixture = defineSpecies({
  defaultCultivar: fixtureCultivar,
  develop({ anatomy }) {
    const geometry = anatomy.sweep({
      id: "returning-filament",
      path: [
        [-1, 0, 0],
        [0, 1, 0],
        [1, 0, 0],
        [-1, 0, 0],
      ],
      radius: 0.05,
    });
    const appearance = anatomy.appearance({
      id: "returning-paint",
      pigment: pigment.layered("#000000", [
        {
          amount: field.coordinate("v"),
          color: "#ffffff",
          id: "along-path",
        },
      ]),
      tissue: anatomy.tissues.filament(),
    });
    return anatomy.flower({
      appearances: [appearance],
      bounds: { maximum: [2, 2, 1], minimum: [-2, -1, -1] },
      geometries: [geometry],
      roots: [
        anatomy.organ({
          appearance,
          geometry,
          id: "returning-filament",
          semantic: "returning-filament",
        }),
      ],
    });
  },
  id: "returning-sweep-fixture",
  sample: () => ({}),
});

const ellipsoidSurfaceFixture = defineSpecies({
  defaultCultivar: fixtureCultivar,
  develop({ anatomy }) {
    const geometry = anatomy.ellipsoid({
      id: "sphere",
      radii: [1, 1, 1],
    });
    const appearance = anatomy.appearance({
      id: "radial-paint",
      pigment: pigment.layered("#000000", [
        {
          amount: field.radial("organ"),
          color: "#ffffff",
          id: "surface-radius",
        },
      ]),
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
          id: "sphere",
          semantic: "sphere",
        }),
      ],
    });
  },
  id: "ellipsoid-surface-fixture",
  sample: () => ({}),
});

const ellipsoidCoordinateFixture = defineSpecies({
  defaultCultivar: fixtureCultivar,
  develop({ anatomy }) {
    const geometry = anatomy.ellipsoid({
      id: "coordinate-sphere",
      radii: [1, 1, 1],
    });
    const appearance = anatomy.appearance({
      id: "hemisphere-paint",
      pigment: pigment.layered("#000000", [
        {
          amount: field.smoothstep(-1, 1, field.coordinate("z")),
          color: "#ffffff",
          id: "local-depth",
        },
      ]),
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
          id: "coordinate-sphere",
          semantic: "coordinate-sphere",
        }),
      ],
    });
  },
  id: "ellipsoid-coordinate-fixture",
  sample: () => ({}),
});

const microscopicGeometryFixture = defineSpecies({
  defaultCultivar: fixtureCultivar,
  develop({ anatomy }) {
    const geometry = anatomy.ellipsoid({
      id: "microscopic-sphere",
      radii: [0.0001, 0.0002, 0.0001],
    });
    const appearance = anatomy.appearance({
      id: "red",
      pigment: pigment.solid("#ff0000"),
      tissue: anatomy.tissues.pollen(),
    });
    return anatomy.flower({
      appearances: [appearance],
      bounds: { maximum: [1.1, 2.1, 1.1], minimum: [-1.1, -2.1, -1.1] },
      geometries: [geometry],
      roots: [
        anatomy.organ({
          appearance,
          geometry,
          id: "microscopic-sphere",
          semantic: "microscopic-sphere",
          transform: scale(10_000),
        }),
      ],
    });
  },
  id: "microscopic-geometry-fixture",
  sample: () => ({}),
});

const cacheCollisionFixture = defineSpecies({
  defaultCultivar: fixtureCultivar,
  develop({ anatomy }) {
    const large = anatomy.ellipsoid({ id: "a/b", radii: [1, 1, 0.5] });
    const small = anatomy.ellipsoid({ id: "a", radii: [0.1, 0.1, 0.05] });
    const largePaint = anatomy.appearance({
      id: "c",
      pigment: pigment.solid("#ff0000"),
      tissue: anatomy.tissues.petal(),
    });
    const smallPaint = anatomy.appearance({
      id: "b/c",
      pigment: pigment.solid("#0000ff"),
      tissue: anatomy.tissues.petal(),
    });
    return anatomy.flower({
      appearances: [largePaint, smallPaint],
      bounds: { maximum: [1.4, 1.1, 0.6], minimum: [-2.3, -1.1, -0.6] },
      geometries: [large, small],
      roots: [
        anatomy.organ({
          appearance: largePaint,
          geometry: large,
          id: "large",
          semantic: "large",
          transform: translate(-1.2, 0, 0),
        }),
        anatomy.organ({
          appearance: smallPaint,
          geometry: small,
          id: "small",
          semantic: "small",
          transform: translate(1.2, 0, 0),
        }),
      ],
    });
  },
  id: "cache-collision-fixture",
  sample: () => ({}),
});

const meshFixture = defineSpecies({
  defaultCultivar: fixtureCultivar,
  develop({ anatomy }) {
    const geometry = anatomy.mesh({
      id: "patches",
      indices: [0, 1, 2, 3, 4, 5],
      positions: [
        [-1, 0, 0],
        [-0.2, 0, 0],
        [-0.6, 1, 0],
        [0.2, 0, 0],
        [1, 0, 0],
        [0.6, 1, 0],
      ],
      surfaceCoordinates: [
        [0, 0],
        [0, 0],
        [0, 1],
        [1, 0],
        [1, 0],
        [1, 1],
      ],
    });
    const appearance = anatomy.appearance({
      id: "patches",
      pigment: pigment.layered("#000000", [
        {
          amount: field.coordinate("u"),
          color: "#ffffff",
          id: "across",
        },
      ]),
      tissue: anatomy.tissues.petal(),
    });
    return anatomy.flower({
      appearances: [appearance],
      bounds: { maximum: [1.1, 1.1, 0.1], minimum: [-1.1, -0.1, -0.1] },
      geometries: [geometry],
      roots: [
        anatomy.organ({
          appearance,
          geometry,
          id: "patches",
          semantic: "patch",
        }),
      ],
    });
  },
  id: "mesh-fixture",
  sample: () => ({}),
});

const meshDepthFixture = defineSpecies({
  defaultCultivar: fixtureCultivar,
  develop({ anatomy }) {
    // The near triangle is deliberately indexed first. SVG must paint by
    // transformed depth, not by the author's incidental index order.
    const geometry = anatomy.mesh({
      id: "stacked-triangles",
      indices: [0, 1, 2, 3, 4, 5, 6, 7, 8],
      positions: [
        [-1, 0, 1],
        [1, 0, 1],
        [0, 1, 1],
        [-1, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
        [-1, 0, -1],
        [1, 0, -1],
        [0, 1, -1],
      ],
      surfaceCoordinates: [
        [0.5, 1],
        [0.5, 1],
        [0.5, 1],
        [0.5, 0.5],
        [0.5, 0.5],
        [0.5, 0.5],
        [0.5, 0],
        [0.5, 0],
        [0.5, 0],
      ],
    });
    const appearance = anatomy.appearance({
      id: "depth-paint",
      pigment: pigment.layered("#000000", [
        {
          amount: field.coordinate("v"),
          color: "#ffffff",
          id: "front-white",
        },
      ]),
      tissue: anatomy.tissues.petal(),
    });
    return anatomy.flower({
      appearances: [appearance],
      bounds: { maximum: [3.5, 1.1, 1.1], minimum: [-3.5, -0.1, -1.1] },
      geometries: [geometry],
      roots: [
        anatomy.organ({
          appearance,
          geometry,
          id: "tiny-depth",
          semantic: "tiny-depth",
          transform: multiplyTransforms(
            translate(-2.4, 0, 0),
            scale(1, 1, 1e-12)
          ),
        }),
        anatomy.organ({
          appearance,
          geometry,
          id: "normal-depth",
          semantic: "normal-depth",
        }),
        anatomy.organ({
          appearance,
          geometry,
          id: "reflected-depth",
          semantic: "reflected-depth",
          transform: multiplyTransforms(translate(2.4, 0, 0), scale(1, 1, -1)),
        }),
      ],
    });
  },
  id: "mesh-depth-fixture",
  sample: () => ({}),
});

const meshWithoutSurfaceCoordinatesFixture = defineSpecies({
  defaultCultivar: fixtureCultivar,
  develop({ anatomy }) {
    const geometry = anatomy.mesh({
      id: "unwrapped-patches",
      indices: [0, 1, 2, 3, 4, 5],
      positions: [
        [-1, 0, 0],
        [-0.2, 0, 0],
        [-0.6, 1, 0],
        [0.2, 0, 0],
        [1, 0, 0],
        [0.6, 1, 0],
      ],
    });
    const appearance = anatomy.appearance({
      id: "unwrapped-patches",
      pigment: pigment.layered("#000000", [
        {
          amount: field.smoothstep(-1, 1, field.coordinate("x")),
          color: "#ffffff",
          id: "local-x",
        },
      ]),
      tissue: anatomy.tissues.petal(),
    });
    return anatomy.flower({
      appearances: [appearance],
      bounds: { maximum: [1.1, 1.1, 0.1], minimum: [-1.1, -0.1, -0.1] },
      geometries: [geometry],
      roots: [
        anatomy.organ({
          appearance,
          geometry,
          id: "unwrapped-patches",
          semantic: "unwrapped-patch",
        }),
      ],
    });
  },
  id: "mesh-without-surface-coordinates-fixture",
  sample: () => ({}),
});

const farOriginFixture = defineSpecies({
  defaultCultivar: fixtureCultivar,
  develop({ anatomy }) {
    const geometry = anatomy.ellipsoid({
      id: "far-pollen",
      radii: [0.1, 0.1, 0.1],
    });
    const appearance = anatomy.appearance({
      id: "far-pollen",
      pigment: pigment.solid("#fffdf7"),
      tissue: anatomy.tissues.pollen(),
    });
    return anatomy.flower({
      appearances: [appearance],
      bounds: {
        maximum: [10_001.11, 0.11, 0.11],
        minimum: [10_000.89, -0.11, -0.11],
      },
      geometries: [geometry],
      roots: [
        anatomy.organ({
          appearance,
          geometry,
          id: "far-pollen",
          semantic: "far-pollen",
          transform: translate(10_001, 0, 0),
        }),
      ],
    });
  },
  id: "far-origin-fixture",
  sample: () => ({}),
});

const depthProjectionFixture = defineSpecies({
  defaultCultivar: fixtureCultivar,
  develop({ anatomy }) {
    const ellipsoid = anatomy.ellipsoid({
      id: "deep-ellipsoid",
      radii: [0.1, 0.1, 1],
    });
    const sweep = anatomy.sweep({
      id: "deep-sweep",
      path: [
        [0, 0, -0.8],
        [0, 0, 0.8],
      ],
      radius: 0.06,
    });
    const mesh = anatomy.mesh({
      id: "deep-mesh",
      indices: [0, 1, 2],
      positions: [
        [0, -0.35, -0.8],
        [0, 0.35, 0],
        [0, -0.35, 0.8],
      ],
    });
    const appearance = anatomy.appearance({
      id: "white",
      pigment: pigment.solid("#fffdf7"),
      tissue: anatomy.tissues.petal(),
    });
    const turn = rotateY(Math.PI / 2);
    return anatomy.flower({
      appearances: [appearance],
      bounds: { maximum: [1.2, 1.5, 0.2], minimum: [-1.2, -1.5, -0.2] },
      geometries: [ellipsoid, sweep, mesh],
      roots: [
        anatomy.organ({
          appearance,
          geometry: ellipsoid,
          id: "deep-ellipsoid",
          semantic: "deep-ellipsoid",
          transform: multiplyTransforms(translate(0, -1, 0), turn),
        }),
        anatomy.organ({
          appearance,
          geometry: sweep,
          id: "deep-sweep",
          semantic: "deep-sweep",
          transform: turn,
        }),
        anatomy.organ({
          appearance,
          geometry: mesh,
          id: "deep-mesh",
          semantic: "deep-mesh",
          transform: multiplyTransforms(translate(0, 1, 0), turn),
        }),
      ],
    });
  },
  id: "depth-projection-fixture",
  sample: () => ({}),
});

const depthOrderFixture = defineSpecies({
  defaultCultivar: fixtureCultivar,
  develop({ anatomy }) {
    const triangle = (id: string, z: number) =>
      anatomy.mesh({
        id,
        indices: [0, 1, 2],
        positions: [
          [-1, -1, z],
          [1, -1, z],
          [0, 1, z],
        ],
      });
    const front = triangle("front", 1);
    const back = triangle("back", -1);
    const frontPaint = anatomy.appearance({
      id: "front",
      pigment: pigment.solid("#ff0000"),
      tissue: anatomy.tissues.petal(),
    });
    const backPaint = anatomy.appearance({
      id: "back",
      pigment: pigment.solid("#0000ff"),
      tissue: anatomy.tissues.petal(),
    });
    return anatomy.flower({
      appearances: [frontPaint, backPaint],
      bounds: { maximum: [1.1, 1.1, 1.1], minimum: [-1.1, -1.1, -1.1] },
      geometries: [front, back],
      // Deliberately list the front first: painter's order must still put it
      // after the back because local geometry, not root order, owns the depth.
      roots: [
        anatomy.organ({
          appearance: frontPaint,
          geometry: front,
          id: "front",
          semantic: "front",
        }),
        anatomy.organ({
          appearance: backPaint,
          geometry: back,
          id: "back",
          semantic: "back",
        }),
      ],
    });
  },
  id: "depth-order-fixture",
  sample: () => ({}),
});

const closeDepthOrderFixture = defineSpecies({
  defaultCultivar: fixtureCultivar,
  develop({ anatomy }) {
    const geometry = anatomy.ellipsoid({
      id: "layer",
      radii: [0.2, 0.2, 0.01],
    });
    const appearances = (["#ff0000", "#00ff00", "#0000ff"] as const).map(
      (color, index) =>
        anatomy.appearance({
          id: `layer-${index}`,
          pigment: pigment.solid(color),
          tissue: anatomy.tissues.pollen(),
        })
    );
    return anatomy.flower({
      appearances,
      geometries: [geometry],
      roots: [
        anatomy.organ({
          appearance: appearances[0],
          geometry,
          id: "front",
          semantic: "front",
          transform: translate(0, 0, 1.8e-10),
        }),
        anatomy.organ({
          appearance: appearances[1],
          geometry,
          id: "middle",
          semantic: "middle",
          transform: translate(0, 0, 0.9e-10),
        }),
        anatomy.organ({
          appearance: appearances[2],
          geometry,
          id: "back",
          semantic: "back",
        }),
      ],
    });
  },
  id: "close-depth-order-fixture",
  sample: () => ({}),
});

describe("typed SVG writer", () => {
  it("sorts attributes and escapes document text", () => {
    const markup = serializeSvg(
      svgNode("svg", { width: 12, "aria-label": 'A & "B"' }, [
        svgNode("title", {}, ["a < b"]),
      ])
    );

    expect(markup).toBe(
      '<svg aria-label="A &amp; &quot;B&quot;" width="12"><title>a &lt; b</title></svg>'
    );
  });
});

describe("renderSvg", () => {
  it.each([
    ["daisy", grow(daisy, { seed: "reference" })],
    ["passionflower", grow(passionflower, { seed: "reference" })],
    ["sunflower", grow(sunflower, { seed: "reference" })],
  ] as const)("renders the %s example as an isolated document", (_name, specimen) => {
    const first = renderSvg(specimen);
    const second = renderSvg(specimen);
    const defined = ids(first);

    expect(first).toBe(second);
    expect(first).toMatch(/^<svg /);
    expect(first).not.toMatch(/NaN|Infinity|undefined|<style/);
    expect(first).toContain('style="fill:');
    expect(references(first).every((reference) => defined.has(reference))).toBe(
      true
    );
  });

  it("keeps the compound sunflower within its vector budget", () => {
    const svg = renderSvg(grow(sunflower, { seed: "reference" }));

    expect(Buffer.byteLength(svg)).toBeLessThan(325_000);
    expect(gzipSync(svg).byteLength).toBeLessThan(65_000);
  });

  it("uses disjoint deterministic ids and validates presentation options", () => {
    const first = renderSvg(grow(daisy, { seed: "a" }), { size: 320 });
    const repeated = renderSvg(grow(daisy, { seed: "a" }), {
      size: 320,
    });
    const other = renderSvg(grow(daisy, { seed: "b" }), { size: 320 });

    expect(first).toBe(repeated);
    expect([...ids(first)].some((id) => ids(other).has(id))).toBe(false);
    const prefixed = renderSvg(grow(daisy, { seed: "a" }), {
      idPrefix: "gallery-card-1",
      size: 320,
    });
    expect([...ids(first)].some((id) => ids(prefixed).has(id))).toBe(false);
    expect(prefixed).toContain('id="gallery-card-1-');
    expect(() =>
      renderSvg(grow(daisy, { seed: "a" }), {
        background: "#fff" as `#${string}`,
      })
    ).toThrow("six-digit");
    expect(() =>
      renderSvg(grow(daisy, { seed: "a" }), {
        idPrefix: "invalid prefix",
      })
    ).toThrow("idPrefix");
  });

  it("preserves a tapered sweep as a filled vector silhouette", () => {
    const svg = renderSvg(grow(sweepFixture, { seed: "reference" }));
    const id = svg.match(/data-organ="filament" href="#([^"]+)"/)?.[1];
    const group = id
      ? svg.match(new RegExp(`<g id="${id}">(.*?)</g>`))?.[1]
      : undefined;

    expect(group).toContain("-0.2");
    expect(group).toContain("-0.05");
    expect(group?.match(/fill:url\(/g)).toHaveLength(2);
    expect(group).toContain("fill:none");
  });

  it("draws the same centripetal sweep centerline audited by core", () => {
    const svg = renderSvg(grow(curvedSweepFixture, { seed: "reference" }));
    const id = svg.match(/data-organ="curved-filament" href="#([^"]+)"/)?.[1];
    const group = id
      ? svg.match(new RegExp(`<g id="${id}">(.*?)</g>`))?.[1]
      : undefined;
    const path = group?.match(/<path d="([^"]+)"/)?.[1];
    const coordinates = [...(path ?? "").matchAll(/-?\d+(?:\.\d+)?/g)].map(
      ([value]) => Number(value)
    );
    const xs = coordinates.filter((_, index) => index % 2 === 0);

    expect(path).toBeDefined();
    expect(Math.max(...xs)).toBeGreaterThan(0.94);
  });

  it("samples sweep pigment on the authored centerline", () => {
    const svg = renderSvg(grow(coordinateSweepFixture, { seed: "reference" }));
    const id = svg.match(
      /data-organ="horizontal-filament" href="#([^"]+)"/
    )?.[1];
    const gradient = id
      ? svg.match(
          new RegExp(
            `<linearGradient[^>]*id="${id}-paint-0"[^>]*>(.*?)</linearGradient>`
          )
        )
      : undefined;
    const colors = stopColors(gradient?.[1] ?? "");

    expect(colors).toHaveLength(9);
    expect(gradient?.[0]).toContain('x1="-1"');
    expect(gradient?.[0]).toContain('x2="1"');
    expect(gradient?.[0]).toContain('y1="0"');
    expect(gradient?.[0]).toContain('y2="0"');
    expect(
      brightness(colors.at(-1) ?? "#000000") - brightness(colors[0])
    ).toBeGreaterThan(500);
  });

  it("preserves circumferential sweep pigment as two vector sides", () => {
    const svg = renderSvg(
      grow(circumferentialSweepFixture, { seed: "reference" })
    );
    const id = svg.match(
      /data-organ="circumferential-filament" href="#([^"]+)"/
    )?.[1];
    if (!id) throw new Error("missing circumferential sweep definition");
    const colors = [0, 1].map((side) => {
      const markup = svg.match(
        new RegExp(
          `<linearGradient[^>]*id="${id}-paint-${side}"[^>]*>(.*?)</linearGradient>`
        )
      )?.[1];
      return stopColors(markup ?? "");
    });

    expect(colors[0]).toHaveLength(9);
    expect(colors[1]).toHaveLength(9);
    expect(
      brightness(colors[1][4] ?? "#000000") -
        brightness(colors[0][4] ?? "#000000")
    ).toBeGreaterThan(350);
  });

  it("samples organ-space sweep pigment on the tube surface", () => {
    const svg = renderSvg(
      grow(surfaceCoordinateSweepFixture, { seed: "reference" })
    );
    const id = svg.match(
      /data-organ="surface-coordinate-filament" href="#([^"]+)"/
    )?.[1];
    if (!id) throw new Error("missing surface-coordinate sweep definition");
    const middleColor = (side: 0 | 1) => {
      const markup = svg.match(
        new RegExp(
          `<linearGradient[^>]*id="${id}-paint-${side}"[^>]*>(.*?)</linearGradient>`
        )
      )?.[1];
      return stopColors(markup ?? "")[4] ?? "#000000";
    };

    expect(
      Math.abs(brightness(middleColor(1)) - brightness(middleColor(0)))
    ).toBeGreaterThan(500);
  });

  it("rotates circumferential sweep pigment with the authored tube frame", () => {
    const original = grow(circumferentialSweepFixture, { seed: "reference" });
    const root = original.model.roots[0];
    if (root.kind !== "organ") throw new Error("fixture root must be an organ");
    const paired = {
      ...original,
      model: {
        ...original.model,
        portrait: {
          ...original.model.portrait,
          bounds: {
            maximum: [0.9, 1.3, 0.3] as Point3,
            minimum: [-0.9, -1.3, -0.3] as Point3,
          },
        },
        roots: [
          {
            ...root,
            id: "circumferential-left",
            semantic: "circumferential-left",
            transform: translate(-0.6, 0, 0),
          },
          {
            ...root,
            id: "circumferential-right",
            semantic: "circumferential-right",
            transform: multiplyTransforms(
              translate(0.6, 0, 0),
              rotateY(Math.PI)
            ),
          },
        ],
      },
    };
    const svg = renderSvg(paired);
    const definition = (semantic: string) =>
      svg.match(new RegExp(`data-organ="${semantic}" href="#([^"]+)"`))?.[1];
    const left = definition("circumferential-left");
    const right = definition("circumferential-right");
    if (!(left && right)) throw new Error("missing paired sweep definitions");
    const sideColor = (id: string) => {
      const markup = svg.match(
        new RegExp(
          `<linearGradient[^>]*id="${id}-paint-0"[^>]*>(.*?)</linearGradient>`
        )
      )?.[1];
      return stopColors(markup ?? "")[4] ?? "#000000";
    };

    expect(left).not.toBe(right);
    expect(
      Math.abs(brightness(sideColor(left)) - brightness(sideColor(right)))
    ).toBeGreaterThan(350);
  });

  it("gives a returning sweep a nonzero vector gradient", () => {
    const svg = renderSvg(grow(returningSweepFixture, { seed: "reference" }));
    const id = svg.match(
      /data-organ="returning-filament" href="#([^"]+)"/
    )?.[1];
    const gradient = id
      ? svg.match(
          new RegExp(`<linearGradient[^>]*id="${id}-paint-0"[^>]*>`)
        )?.[0]
      : undefined;
    const coordinate = (name: "x1" | "x2" | "y1" | "y2") =>
      Number(gradient?.match(new RegExp(`${name}="([^"]+)"`))?.[1]);

    expect(gradient).toBeDefined();
    expect(
      Math.hypot(
        coordinate("x2") - coordinate("x1"),
        coordinate("y2") - coordinate("y1")
      )
    ).toBeGreaterThan(0);
  });

  it("evaluates ellipsoid pigment on the visible surface", () => {
    const svg = renderSvg(grow(ellipsoidSurfaceFixture, { seed: "reference" }));
    const id = svg.match(/data-organ="sphere" href="#([^"]+)"/)?.[1];
    const gradient = id
      ? svg.match(
          new RegExp(
            `<radialGradient[^>]*id="${id}-paint-0"[^>]*>(.*?)</radialGradient>`
          )
        )?.[1]
      : undefined;
    const colors = stopColors(gradient ?? "");

    expect(colors).toHaveLength(9);
    expect(Math.min(...colors.map(brightness))).toBeGreaterThan(650);
  });

  it("samples the visible local ellipsoid hemisphere after rotation", () => {
    const original = grow(ellipsoidCoordinateFixture, { seed: "reference" });
    const root = original.model.roots[0];
    if (root.kind !== "organ") throw new Error("fixture root must be an organ");
    const rotated = {
      ...original,
      model: {
        ...original.model,
        roots: [{ ...root, transform: rotateY(Math.PI) }],
      },
    };
    const centerColor = (svg: string) => {
      const id = svg.match(
        /data-organ="coordinate-sphere" href="#([^"]+)"/
      )?.[1];
      const markup = id
        ? svg.match(
            new RegExp(
              `<radialGradient[^>]*id="${id}-paint-0"[^>]*>(.*?)</radialGradient>`
            )
          )?.[1]
        : undefined;
      return stopColors(markup ?? "")[0] ?? "#000000";
    };

    expect(
      brightness(centerColor(renderSvg(original))) -
        brightness(centerColor(renderSvg(rotated)))
    ).toBeGreaterThan(500);
  });

  it("does not reuse one oriented ellipsoid paint definition in a document", () => {
    const original = grow(ellipsoidCoordinateFixture, { seed: "reference" });
    const root = original.model.roots[0];
    if (root.kind !== "organ") throw new Error("fixture root must be an organ");
    const paired = {
      ...original,
      model: {
        ...original.model,
        portrait: {
          ...original.model.portrait,
          bounds: {
            maximum: [2.3, 1.1, 1.1] as Point3,
            minimum: [-2.3, -1.1, -1.1] as Point3,
          },
        },
        roots: [
          {
            ...root,
            id: "coordinate-left",
            semantic: "coordinate-left",
            transform: translate(-1.2, 0, 0),
          },
          {
            ...root,
            id: "coordinate-right",
            semantic: "coordinate-right",
            transform: multiplyTransforms(
              translate(1.2, 0, 0),
              rotateY(Math.PI)
            ),
          },
        ],
      },
    };
    const svg = renderSvg(paired);
    const definition = (semantic: string) =>
      svg.match(new RegExp(`data-organ="${semantic}" href="#([^"]+)"`))?.[1];
    const left = definition("coordinate-left");
    const right = definition("coordinate-right");
    if (!(left && right))
      throw new Error("missing paired ellipsoid definitions");
    const centerColor = (id: string) => {
      const markup = svg.match(
        new RegExp(
          `<radialGradient[^>]*id="${id}-paint-0"[^>]*>(.*?)</radialGradient>`
        )
      )?.[1];
      return stopColors(markup ?? "")[0] ?? "#000000";
    };

    expect(left).not.toBe(right);
    expect(
      Math.abs(brightness(centerColor(left)) - brightness(centerColor(right)))
    ).toBeGreaterThan(500);
  });

  it("preserves significant local coordinates before instance transforms", () => {
    const svg = renderSvg(
      grow(microscopicGeometryFixture, { seed: "reference" })
    );
    const id = svg.match(
      /data-organ="microscopic-sphere" href="#([^"]+)"/
    )?.[1];
    const ellipse = id
      ? svg.match(new RegExp(`<ellipse[^>]*id="${id}"[^>]*/>`))?.[0]
      : undefined;

    expect(ellipse).toContain('rx="0.0001"');
    expect(ellipse).toContain('ry="0.0002"');
    expect(svg).toContain('transform="matrix(10000 0 0 10000 0 0)"');
  });

  it("frames a tiny flower accurately when it is far from the origin", () => {
    const svg = renderSvg(grow(farOriginFixture, { seed: "reference" }));

    expect(svg).toContain('transform="translate(10001 0) rotate(0)"');
    expect(svg).toContain("translate(-10001 0)");
    expect(svg).not.toContain("translate(10000 0)");
  });

  it("keeps structurally ambiguous geometry and appearance ids disjoint", () => {
    const svg = renderSvg(grow(cacheCollisionFixture, { seed: "reference" }));
    const href = (semantic: string) =>
      svg.match(new RegExp(`data-organ="${semantic}" href="#([^"]+)"`))?.[1];
    const large = href("large");
    const small = href("small");

    expect(large).toBeDefined();
    expect(small).toBeDefined();
    expect(large).not.toBe(small);
    expect(svg).toContain(`id="${large}" rx="1"`);
    expect(svg).toContain(`id="${small}" rx="0.1"`);
  });

  it("evaluates indexed-mesh pigment from authored surface coordinates", () => {
    const svg = renderSvg(grow(meshFixture, { seed: "reference" }));

    expect(svg).toContain("fill:#000000");
    expect(svg).toContain("fill:#fefefe");
  });

  it("evaluates indexed-mesh pigment from position when UVs are absent", () => {
    const svg = renderSvg(
      grow(meshWithoutSurfaceCoordinatesFixture, { seed: "reference" })
    );
    const fills = [
      ...svg.matchAll(/<path[^>]*style="fill:(#[0-9a-f]{6})/g),
    ].map((match) => match[1]);

    expect(fills).toHaveLength(2);
    expect(
      Math.abs(brightness(fills[1]) - brightness(fills[0]))
    ).toBeGreaterThan(350);
  });

  it("paints mesh triangles by transformed depth and caches each orientation", () => {
    const svg = renderSvg(grow(meshDepthFixture, { seed: "reference" }));
    const definition = (semantic: string) => {
      const id = svg.match(
        new RegExp(`data-organ="${semantic}" href="#([^"]+)"`)
      )?.[1];
      if (!id) throw new Error(`missing ${semantic}`);
      const markup = svg.match(new RegExp(`<g id="${id}">(.*?)</g>`))?.[1];
      if (!markup) throw new Error(`missing definition ${id}`);
      return {
        fills: [
          ...markup.matchAll(/<path[^>]*style="fill:(#[0-9a-f]{6})/g),
        ].map((match) => brightness(match[1])),
        id,
      };
    };
    const tiny = definition("tiny-depth");
    const normal = definition("normal-depth");
    const reflected = definition("reflected-depth");

    expect(tiny.id).not.toBe(normal.id);
    expect(normal.id).not.toBe(reflected.id);
    expect(tiny.fills).toHaveLength(3);
    expect(tiny.fills[0]).toBeLessThan(tiny.fills[1]);
    expect(tiny.fills[1]).toBeLessThan(tiny.fills[2]);
    expect(normal.fills).toHaveLength(3);
    expect(normal.fills[0]).toBeLessThan(normal.fills[1]);
    expect(normal.fills[1]).toBeLessThan(normal.fills[2]);
    expect(reflected.fills).toHaveLength(3);
    expect(reflected.fills[0]).toBeGreaterThan(reflected.fills[1]);
    expect(reflected.fills[1]).toBeGreaterThan(reflected.fills[2]);
  });

  it("projects z-bearing ellipsoids, sweeps and meshes through full 3D transforms", () => {
    const svg = renderSvg(grow(depthProjectionFixture, { seed: "reference" }));
    const definition = (semantic: string) => {
      const use = svg.match(
        new RegExp(`<use data-organ="${semantic}" href="#([^"]+)"([^>]*)/>`)
      );
      if (!use) throw new Error(`missing ${semantic} use`);
      expect(use[2]).not.toContain("transform=");
      return use[1];
    };
    const xSpan = (path: string) => {
      const coordinates = [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map(
        ([value]) => Number(value)
      );
      const xs = coordinates.filter((_, index) => index % 2 === 0);
      return Math.max(...xs) - Math.min(...xs);
    };

    const ellipsoidId = definition("deep-ellipsoid");
    const ellipse = svg.match(
      new RegExp(`<ellipse[^>]*id="${ellipsoidId}"[^>]*/>`)
    )?.[0];
    expect(ellipse).toContain('rx="1"');
    expect(ellipse).toContain('ry="0.1"');
    const ellipsoidGradient = svg.match(
      new RegExp(`<radialGradient[^>]*id="${ellipsoidId}-paint-0"[^>]*>`)
    )?.[0];
    expect(ellipsoidGradient).toContain("scale(1 0.1)");

    const sweepId = definition("deep-sweep");
    const sweepMarkup = svg.match(
      new RegExp(`<g id="${sweepId}">(.*?)</g>`)
    )?.[1];
    const sweepPath = sweepMarkup?.match(/<path d="([^"]+)"/)?.[1];
    expect(sweepPath).toBeDefined();
    expect(xSpan(sweepPath ?? "")).toBeGreaterThan(1.5);

    const meshId = definition("deep-mesh");
    const meshMarkup = svg.match(
      new RegExp(`<g id="${meshId}">(.*?)</g>`)
    )?.[1];
    const meshPath = meshMarkup?.match(/<path d="([^"]+)"/)?.[1];
    expect(meshPath).toBeDefined();
    expect(xSpan(meshPath ?? "")).toBeGreaterThan(1.5);
  });

  it("paints local geometry depth back-to-front", () => {
    const svg = renderSvg(grow(depthOrderFixture, { seed: "reference" }));
    const order = [...svg.matchAll(/<use data-organ="([^"]+)"/g)].map(
      (match) => match[1]
    );

    expect(order).toEqual(["back", "front"]);
  });

  it("keeps painter ordering transitive at nearly equal depths", () => {
    const svg = renderSvg(grow(closeDepthOrderFixture, { seed: "reference" }));
    const order = [...svg.matchAll(/<use data-organ="([^"]+)"/g)].map(
      (match) => match[1]
    );

    expect(order).toEqual(["back", "middle", "front"]);
  });

  it("uses the authored key-light direction once in flower space", () => {
    const specimen = grow(daisy, { seed: "reference" });
    const relight = (keyLight: Point3) => ({
      ...specimen,
      model: {
        ...specimen.model,
        portrait: { ...specimen.model.portrait, keyLight },
      },
    });
    const fromLeft = renderSvg(relight([-1, 0, 1]));
    const fromRight = renderSvg(relight([1, 0, 1]));
    const keyGradient = (svg: string) =>
      svg.match(/<linearGradient[^>]*id="[^"]+-key-light"[^>]*>/)?.[0];

    expect(keyGradient(fromLeft)).toBeDefined();
    expect(keyGradient(fromRight)).toBeDefined();
    expect(keyGradient(fromLeft)).not.toBe(keyGradient(fromRight));
    expect(fromLeft.match(/-key-light/g)).toHaveLength(2);
  });
});
