import {
  type BufferGeometry,
  DirectionalLight,
  InstancedMesh,
  Mesh,
  type MeshPhysicalMaterial,
  type MeshStandardMaterial,
  SpotLight,
} from "three";
import { describe, expect, it } from "vitest";
import { daisy, passionflower, sunflower } from "@/src/catalog";
import {
  defineCultivar,
  defineSpecies,
  field,
  grow,
  type Matrix4,
  multiplyTransforms,
  pigment,
  rotateZ,
  scale,
  translate,
} from "@/src/core";
import { flowerScene } from "@/src/gl";

function meshes(scene: ReturnType<typeof flowerScene>): readonly Mesh[] {
  const result: Mesh[] = [];
  scene.flower.traverse((object) => {
    if (object instanceof Mesh) result.push(object);
  });
  return result;
}

const fixtureCultivar = defineCultivar({
  id: "plain",
  name: "Plain",
  value: {},
});

const IDENTITY: Matrix4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const TINY_SHEAR: Matrix4 = [
  1e-12, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
];

const sweepFixture = defineSpecies({
  defaultCultivar: fixtureCultivar,
  develop({ anatomy }) {
    const geometry = anatomy.sweep({
      id: "filament",
      path: [
        [0, 0, 0],
        [0, 1, 0],
      ],
      radius: [0.1, 0.02],
    });
    const appearance = anatomy.appearance({
      id: "filament",
      pigment: pigment.layered("#000000", [
        {
          amount: field.coordinate("v"),
          color: "#ffffff",
          id: "length",
        },
      ]),
      tissue: anatomy.tissues.filament(),
    });
    return anatomy.flower({
      appearances: [appearance],
      bounds: { maximum: [0.2, 1.1, 0.2], minimum: [-0.2, -0.1, -0.2] },
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

const deepFixture = defineSpecies({
  defaultCultivar: fixtureCultivar,
  develop({ anatomy }) {
    const geometry = anatomy.ellipsoid({
      id: "ovary",
      radii: [0.1, 0.1, 100],
    });
    const appearance = anatomy.appearance({
      id: "ovary",
      pigment: pigment.solid("#81a34a"),
      tissue: anatomy.tissues.stigma(),
    });
    return anatomy.flower({
      appearances: [appearance],
      bounds: {
        maximum: [0.2, 0.2, 100.1],
        minimum: [-0.2, -0.2, -100.1],
      },
      geometries: [geometry],
      roots: [
        anatomy.organ({
          appearance,
          geometry,
          id: "ovary",
          semantic: "ovary",
        }),
      ],
    });
  },
  id: "deep-fixture",
  sample: () => ({}),
});

const tinyFixture = defineSpecies({
  defaultCultivar: fixtureCultivar,
  develop({ anatomy }) {
    const geometry = anatomy.ellipsoid({
      id: "pollen",
      radii: [0.001, 0.001, 0.001],
    });
    const appearance = anatomy.appearance({
      id: "pollen",
      pigment: pigment.solid("#e8b51f"),
      tissue: anatomy.tissues.pollen(),
    });
    return anatomy.flower({
      appearances: [appearance],
      bounds: {
        maximum: [0.0011, 0.0011, 0.0011],
        minimum: [-0.0011, -0.0011, -0.0011],
      },
      geometries: [geometry],
      roots: [
        anatomy.organ({
          appearance,
          geometry,
          id: "pollen",
          semantic: "pollen",
        }),
      ],
    });
  },
  id: "tiny-fixture",
  sample: () => ({}),
});

const keyedSweepFixture = defineSpecies({
  defaultCultivar: fixtureCultivar,
  develop({ anatomy }) {
    const geometry = anatomy.sweep({
      id: "keyed-filament",
      path: [
        [0, 0, 0],
        [0, 0.1, 0],
        [0, 10, 0],
      ],
      radius: [1, 2, 3],
    });
    const appearance = anatomy.appearance({
      id: "keyed-filament",
      pigment: pigment.solid("#7542a8"),
      tissue: anatomy.tissues.filament(),
    });
    return anatomy.flower({
      appearances: [appearance],
      bounds: { maximum: [3.1, 13.1, 3.1], minimum: [-3.1, -3.1, -3.1] },
      geometries: [geometry],
      roots: [
        anatomy.organ({
          appearance,
          geometry,
          id: "keyed-filament",
          semantic: "filament",
        }),
      ],
    });
  },
  id: "keyed-sweep-fixture",
  sample: () => ({}),
});

const reflectedFixture = defineSpecies({
  defaultCultivar: fixtureCultivar,
  develop({ anatomy }) {
    const geometry = anatomy.ellipsoid({
      id: "pollen",
      radii: [0.2, 0.3, 0.1],
    });
    const appearance = anatomy.appearance({
      id: "pollen",
      pigment: pigment.solid("#e8b51f"),
      tissue: anatomy.tissues.pollen(),
    });
    return anatomy.flower({
      appearances: [appearance],
      bounds: { maximum: [0.4, 0.4, 0.2], minimum: [-0.4, -0.4, -0.2] },
      geometries: [geometry],
      roots: [
        anatomy.instances(
          {
            appearance,
            geometry,
            id: "pollen",
            semantic: "pollen",
          },
          [IDENTITY, scale(-1, 1, 1)]
        ),
      ],
    });
  },
  id: "reflected-fixture",
  sample: () => ({}),
});

const shearedInstanceFixture = defineSpecies({
  defaultCultivar: fixtureCultivar,
  develop({ anatomy }) {
    const geometry = anatomy.ellipsoid({
      id: "sheared-pollen",
      radii: [0.2, 0.3, 0.1],
    });
    const appearance = anatomy.appearance({
      id: "sheared-pollen",
      pigment: pigment.solid("#e8b51f"),
      tissue: anatomy.tissues.pollen(),
    });
    return anatomy.flower({
      appearances: [appearance],
      bounds: { maximum: [0.8, 0.5, 0.2], minimum: [-0.8, -0.5, -0.2] },
      geometries: [geometry],
      roots: [
        anatomy.instances(
          {
            appearance,
            geometry,
            id: "sheared-pollen",
            semantic: "sheared-pollen",
          },
          [multiplyTransforms(scale(2, 1, 1), rotateZ(Math.PI / 4)), TINY_SHEAR]
        ),
      ],
    });
  },
  id: "sheared-instance-fixture",
  sample: () => ({}),
});

const ellipsoidSurfaceVFixture = defineSpecies({
  defaultCultivar: fixtureCultivar,
  develop({ anatomy }) {
    const geometry = anatomy.ellipsoid({
      id: "surface-v-sphere",
      radii: [1, 1, 1],
    });
    const appearance = anatomy.appearance({
      id: "surface-v-paint",
      pigment: pigment.layered("#000000", [
        {
          amount: field.coordinate("v"),
          color: "#ffffff",
          id: "pole-to-pole",
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
          id: "surface-v-sphere",
          semantic: "surface-v-sphere",
        }),
      ],
    });
  },
  id: "ellipsoid-surface-v-fixture",
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

const laminaDepthPigmentFixture = defineSpecies({
  defaultCultivar: fixtureCultivar,
  develop({ anatomy }) {
    const geometry = anatomy.lamina({
      crown: 0,
      id: "depth-petal",
      length: 1,
      thickness: 0.2,
      width: 0.8,
    });
    const appearance = anatomy.appearance({
      id: "depth-paint",
      pigment: pigment.layered("#000000", [
        {
          amount: field.smoothstep(-0.01, 0.01, field.coordinate("z")),
          color: "#ffffff",
          id: "authored-depth",
        },
      ]),
      tissue: anatomy.tissues.petal(),
    });
    return anatomy.flower({
      appearances: [appearance],
      geometries: [geometry],
      roots: [
        anatomy.organ({
          appearance,
          geometry,
          id: "depth-petal",
          semantic: "depth-petal",
        }),
      ],
    });
  },
  id: "lamina-depth-pigment-fixture",
  sample: () => ({}),
});

describe("renderer-neutral Three adapter", () => {
  it.each([
    ["daisy", grow(daisy, { seed: "reference" })],
    ["passionflower", grow(passionflower, { seed: "reference" })],
    ["sunflower", grow(sunflower, { seed: "reference" })],
  ] as const)("compiles the %s anatomy into finite matte geometry", (_name, specimen) => {
    const built = flowerScene(specimen);
    const rendered = meshes(built);

    expect(rendered.length).toBeGreaterThan(0);
    for (const mesh of rendered) {
      const geometry = mesh.geometry as BufferGeometry;
      const material = mesh.material as
        | MeshPhysicalMaterial
        | MeshStandardMaterial;
      expect(
        [...geometry.getAttribute("position").array].every(Number.isFinite)
      ).toBe(true);
      expect(geometry.getAttribute("color").count).toBeGreaterThan(0);
      if ("clearcoat" in material) expect(material.clearcoat).toBe(0);
      expect(material.metalness).toBe(0);
      expect(material.roughness).toBeGreaterThan(0.65);
    }
    built.dispose();
  });

  it("uses instancing for compound flower centers", () => {
    const built = flowerScene(grow(sunflower, { seed: "reference" }));
    const instances = meshes(built).filter(
      (mesh): mesh is InstancedMesh => mesh instanceof InstancedMesh
    );
    const instanceCount = meshes(built).reduce(
      (sum, mesh) => sum + ("count" in mesh ? Number(mesh.count) : 1),
      0
    );
    let disposals = 0;
    for (const instance of instances)
      instance.addEventListener("dispose", () => {
        disposals += 1;
      });

    expect(instanceCount).toBeGreaterThan(700);
    built.dispose();
    expect(disposals).toBe(instances.length);
  });

  it("emits non-degenerate lamina faces with one smooth normal per pole", () => {
    const built = flowerScene(grow(daisy, { seed: "reference" }));
    const geometry = meshes(built).find(
      (mesh) => mesh.userData.organ === "ray-floret"
    )?.geometry as BufferGeometry;
    const positions = geometry.getAttribute("position");
    const normals = geometry.getAttribute("normal");
    const index = geometry.getIndex();
    if (!index) throw new Error("lamina must be indexed");

    for (const face of Array(index.count / 3).keys()) {
      const triangle = face * 3;
      const a = index.getX(triangle);
      const b = index.getX(triangle + 1);
      const c = index.getX(triangle + 2);
      const ab = [
        positions.getX(b) - positions.getX(a),
        positions.getY(b) - positions.getY(a),
        positions.getZ(b) - positions.getZ(a),
      ];
      const ac = [
        positions.getX(c) - positions.getX(a),
        positions.getY(c) - positions.getY(a),
        positions.getZ(c) - positions.getZ(a),
      ];
      const cross = [
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
      ];
      expect(Math.hypot(...cross)).toBeGreaterThan(
        Math.hypot(...ab) * Math.hypot(...ac) * 1e-12
      );
    }

    const columns = 33;
    const rows = positions.count / (columns * 2);
    for (const pole of [
      0,
      (rows - 1) * columns,
      rows * columns,
      (2 * rows - 1) * columns,
    ]) {
      for (const offset of Array(columns - 1).keys()) {
        const column = offset + 1;
        expect(normals.getX(pole + column)).toBeCloseTo(normals.getX(pole), 6);
        expect(normals.getY(pole + column)).toBeCloseTo(normals.getY(pole), 6);
        expect(normals.getZ(pole + column)).toBeCloseTo(normals.getZ(pole), 6);
      }
    }
    built.dispose();
  });

  it("keeps ellipsoid seam and pole normals continuous", () => {
    const built = flowerScene(grow(daisy, { seed: "reference" }));
    const geometry = meshes(built).find(
      (mesh) => mesh.userData.organ === "disk-floret"
    )?.geometry as BufferGeometry;
    const normals = geometry.getAttribute("normal");
    const ring = 21;
    const rows = normals.count / ring;

    for (const row of Array(rows).keys()) {
      const first = row * ring;
      const last = first + ring - 1;
      expect(normals.getX(last)).toBeCloseTo(normals.getX(first), 6);
      expect(normals.getY(last)).toBeCloseTo(normals.getY(first), 6);
      expect(normals.getZ(last)).toBeCloseTo(normals.getZ(first), 6);
    }
    for (const row of [0, rows - 1]) {
      const first = row * ring;
      for (const offset of Array(ring - 1).keys()) {
        const side = offset + 1;
        expect(normals.getX(first + side)).toBeCloseTo(normals.getX(first), 6);
        expect(normals.getY(first + side)).toBeCloseTo(normals.getY(first), 6);
        expect(normals.getZ(first + side)).toBeCloseTo(normals.getZ(first), 6);
      }
    }
    built.dispose();
  });

  it("keeps sweep lighting continuous across its surface seam", () => {
    const built = flowerScene(grow(passionflower, { seed: "reference" }));
    const geometry = meshes(built).find(
      (mesh) => mesh.userData.organ === "corona-filament"
    )?.geometry as BufferGeometry;
    const normals = geometry.getAttribute("normal");
    const ring = 13;

    for (const row of Array(normals.count / ring).keys()) {
      const first = row * ring;
      const last = first + ring - 1;
      expect(normals.getX(last)).toBeCloseTo(normals.getX(first), 6);
      expect(normals.getY(last)).toBeCloseTo(normals.getY(first), 6);
      expect(normals.getZ(last)).toBeCloseTo(normals.getZ(first), 6);
    }
    built.dispose();
  });

  it("evaluates lamina pigment on anatomy rather than relief displacement", () => {
    const built = flowerScene(
      grow(laminaDepthPigmentFixture, { seed: "reference" })
    );
    const geometry = meshes(built)[0].geometry as BufferGeometry;
    const colors = geometry.getAttribute("color");
    const shellSize = colors.count / 2;

    for (const vertex of Array(shellSize).keys()) {
      expect(colors.getX(shellSize + vertex)).toBeCloseTo(
        colors.getX(vertex),
        6
      );
      expect(colors.getY(shellSize + vertex)).toBeCloseTo(
        colors.getY(vertex),
        6
      );
      expect(colors.getZ(shellSize + vertex)).toBeCloseTo(
        colors.getZ(vertex),
        6
      );
    }
    built.dispose();
  });

  it("is a deterministic explicit adapter with idempotent disposal", () => {
    const specimen = grow(daisy, { seed: "reference" });
    const first = flowerScene(specimen);
    const second = flowerScene(specimen);
    const firstPositions = [
      ...(meshes(first)[0].geometry as BufferGeometry).getAttribute("position")
        .array,
    ];
    const secondPositions = [
      ...(meshes(second)[0].geometry as BufferGeometry).getAttribute("position")
        .array,
    ];
    let disposals = 0;
    (meshes(first)[0].geometry as BufferGeometry).addEventListener(
      "dispose",
      () => {
        disposals += 1;
      }
    );

    expect(firstPositions).toEqual(secondPositions);
    first.dispose();
    first.dispose();
    second.dispose();
    expect(disposals).toBe(1);
  });

  it("maps sweep v pigment along the path instead of around each ring", () => {
    const built = flowerScene(grow(sweepFixture, { seed: "reference" }));
    const geometry = meshes(built)[0].geometry as BufferGeometry;
    const colors = geometry.getAttribute("color");
    const ring = 13;
    const average = (from: number) =>
      Array.from({ length: ring }, (_, index) =>
        colors.getX(from + index)
      ).reduce((sum, value) => sum + value, 0) / ring;

    expect(average(colors.count - ring) - average(0)).toBeGreaterThan(0.8);
    built.dispose();
  });

  it("places each sweep radius on its authored path sample", () => {
    const built = flowerScene(grow(keyedSweepFixture, { seed: "reference" }));
    const geometry = meshes(built)[0].geometry as BufferGeometry;
    const positions = geometry.getAttribute("position");
    const ring = 13;
    const uvs = geometry.getAttribute("uv");
    const rows = positions.count / ring;
    const middleRow = Array.from({ length: rows }, (_, row) => row).reduce(
      (selected, row) =>
        Math.abs(uvs.getX(row * ring) - 0.5) <
        Math.abs(uvs.getX(selected * ring) - 0.5)
          ? row
          : selected
    );
    const middleRing = middleRow * ring;
    const centerY =
      Array.from({ length: ring }, (_, side) =>
        positions.getY(middleRing + side)
      ).reduce((sum, value) => sum + value, 0) / ring;
    const radius = Math.max(
      ...Array.from({ length: ring }, (_, side) =>
        Math.hypot(
          positions.getX(middleRing + side),
          positions.getZ(middleRing + side)
        )
      )
    );

    expect(centerY).toBeCloseTo(0.1, 5);
    expect(radius).toBeCloseTo(2, 5);
    built.dispose();
  });

  it("maps ellipsoid surface v from the positive-y pole to the negative-y pole", () => {
    const built = flowerScene(
      grow(ellipsoidSurfaceVFixture, { seed: "reference" })
    );
    const geometry = meshes(built)[0].geometry as BufferGeometry;
    const positions = geometry.getAttribute("position");
    const colors = geometry.getAttribute("color");
    const indices = Array.from(
      { length: positions.count },
      (_, index) => index
    );
    const top = indices.reduce((selected, index) =>
      positions.getY(index) > positions.getY(selected) ? index : selected
    );
    const bottom = indices.reduce((selected, index) =>
      positions.getY(index) < positions.getY(selected) ? index : selected
    );

    expect(colors.getX(bottom) - colors.getX(top)).toBeGreaterThan(0.8);
    built.dispose();
  });

  it("renders reflected instances as ordinary meshes with reflected matrices", () => {
    const built = flowerScene(grow(reflectedFixture, { seed: "reference" }));
    const rendered = meshes(built);
    const instances = rendered.filter((mesh) => mesh instanceof InstancedMesh);
    const reflected = rendered.filter(
      (mesh) =>
        !(mesh instanceof InstancedMesh) && mesh.matrix.determinant() < 0
    );

    expect(instances).toHaveLength(1);
    expect((instances[0] as InstancedMesh).count).toBe(1);
    expect(reflected).toHaveLength(1);
    built.dispose();
  });

  it("renders sheared instance transforms as meshes with correct normal matrices", () => {
    const built = flowerScene(
      grow(shearedInstanceFixture, { seed: "reference" })
    );
    const rendered = meshes(built);

    expect(rendered).toHaveLength(2);
    expect(rendered.every((mesh) => !(mesh instanceof InstancedMesh))).toBe(
      true
    );
    expect(rendered[0].matrix.elements[0]).toBeCloseTo(Math.SQRT2);
    expect(rendered[0].matrix.elements[4]).toBeCloseTo(-Math.SQRT2);
    expect(rendered[1].matrix.elements[0]).toBe(1e-12);
    expect(rendered[1].matrix.elements[4]).toBe(1);
    built.dispose();
  });

  it("keeps structurally ambiguous geometry and appearance ids disjoint", () => {
    const built = flowerScene(
      grow(cacheCollisionFixture, { seed: "reference" })
    );
    const extent = (semantic: string) => {
      const geometry = meshes(built).find(
        (mesh) => mesh.userData.organ === semantic
      )?.geometry as BufferGeometry | undefined;
      if (!geometry) throw new Error(`missing ${semantic} geometry`);
      const positions = geometry.getAttribute("position");
      return Math.max(
        ...Array.from({ length: positions.count }, (_, index) =>
          Math.hypot(
            positions.getX(index),
            positions.getY(index),
            positions.getZ(index)
          )
        )
      );
    };

    expect(extent("large")).toBeGreaterThan(0.9);
    expect(extent("small")).toBeLessThan(0.2);
    built.dispose();
  });

  it("places the portrait camera beyond an unusually deep flower", () => {
    const specimen = grow(deepFixture, { seed: "reference" });
    const built = flowerScene(specimen);
    const minimumZ = specimen.model.portrait.bounds.minimum[2];
    const maximumZ = specimen.model.portrait.bounds.maximum[2];

    expect(built.camera.position.z).toBeGreaterThan(maximumZ);
    expect(built.camera.far).toBeGreaterThan(
      built.camera.position.z - minimumZ
    );
    built.dispose();
  });

  it("sizes the sampled sky shadow from the complete model bounds", () => {
    const deep = flowerScene(grow(deepFixture, { seed: "reference" }));
    const tiny = flowerScene(grow(tinyFixture, { seed: "reference" }));
    const sky = (scene: typeof deep) => {
      const light = scene.scene.children.find(
        (child): child is DirectionalLight =>
          child instanceof DirectionalLight && child.castShadow
      );
      if (!light) throw new Error("studio must contain a sampled sky");
      return light;
    };

    expect(sky(deep).shadow.camera.far).toBeGreaterThan(500);
    expect(sky(tiny).shadow.camera.near).toBeLessThan(0.5);
    const key = deep.scene.children.find(
      (child): child is SpotLight => child instanceof SpotLight
    );
    expect(key?.castShadow).toBe(false);
    deep.dispose();
    tiny.dispose();
  });
});
