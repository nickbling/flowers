import { defineCultivar, defineSpecies, field, pigment } from "@/src/core";

export type DaisyCultivar = Readonly<{
  diskCore: `#${string}`;
  diskOuter: `#${string}`;
  form: "single" | "semi-double" | "frilled-double" | "fluted-double";
  ray: `#${string}`;
  rayBase: `#${string}`;
}>;

export type DaisyTraits = Readonly<{
  diskCore: `#${string}`;
  diskDome: number;
  diskOuter: `#${string}`;
  diskRadius: number;
  floretCount: number;
  rayBaseColor: `#${string}`;
  rayBend: number;
  rayColor: `#${string}`;
  rayCount: number;
  rayCrown: number;
  rayCurl: number;
  rayLayers: number;
  rayLength: number;
  rayRuffle: number;
  rayShoulder: number;
  rayThickness: number;
  rayTwist: number;
  rayWidth: number;
}>;

type Span = readonly [number, number];

type DaisyForm = Readonly<{
  bend: Span;
  count: Span;
  crown: Span;
  curl: Span;
  disk: Span;
  florets: Span;
  layers: number;
  length: Span;
  ruffle: Span;
  shoulder: Span;
  thickness: Span;
  twist: Span;
  width: Span;
}>;

const FORMS: Readonly<Record<DaisyCultivar["form"], DaisyForm>> = {
  "fluted-double": {
    bend: [-0.025, 0.025],
    count: [30, 36],
    crown: [0.2, 0.28],
    curl: [0.08, 0.14],
    disk: [0.2, 0.24],
    florets: [150, 185],
    layers: 2,
    length: [0.7, 0.8],
    ruffle: [0.01, 0.025],
    shoulder: [0.58, 0.66],
    thickness: [0.055, 0.075],
    twist: [0.015, 0.04],
    width: [0.1, 0.14],
  },
  "frilled-double": {
    bend: [-0.04, 0.04],
    count: [29, 36],
    crown: [0.15, 0.23],
    curl: [0.04, 0.09],
    disk: [0.19, 0.23],
    florets: [145, 180],
    layers: 2,
    length: [0.69, 0.78],
    ruffle: [0.05, 0.09],
    shoulder: [0.5, 0.58],
    thickness: [0.045, 0.065],
    twist: [0.04, 0.09],
    width: [0.105, 0.16],
  },
  "semi-double": {
    bend: [-0.03, 0.03],
    count: [24, 29],
    crown: [0.15, 0.22],
    curl: [0.03, 0.07],
    disk: [0.22, 0.25],
    florets: [160, 190],
    layers: 2,
    length: [0.72, 0.82],
    ruffle: [0.012, 0.028],
    shoulder: [0.53, 0.61],
    thickness: [0.048, 0.065],
    twist: [-0.02, 0.02],
    width: [0.16, 0.21],
  },
  single: {
    bend: [-0.025, 0.025],
    count: [24, 30],
    crown: [0.13, 0.19],
    curl: [0.025, 0.055],
    disk: [0.23, 0.27],
    florets: [168, 196],
    layers: 1,
    length: [0.75, 0.86],
    ruffle: [0.008, 0.022],
    shoulder: [0.52, 0.6],
    thickness: [0.045, 0.06],
    twist: [-0.015, 0.015],
    width: [0.18, 0.23],
  },
};

export const alaskaDaisy = defineCultivar<DaisyCultivar>({
  id: "alaska",
  name: "Alaska",
  revision: 1,
  value: {
    diskCore: "#d99b12",
    diskOuter: "#f2c72b",
    form: "single",
    ray: "#fffdf7",
    rayBase: "#f4d66a",
  },
});

export const bananaCreamDaisy = defineCultivar<DaisyCultivar>({
  id: "banana-cream",
  name: "Banana Cream",
  revision: 1,
  value: {
    diskCore: "#c87912",
    diskOuter: "#e7a51d",
    form: "semi-double",
    ray: "#f8edac",
    rayBase: "#efbd3a",
  },
});

export const crazyDaisy = defineCultivar<DaisyCultivar>({
  id: "crazy-daisy",
  name: "Crazy Daisy",
  revision: 1,
  value: {
    diskCore: "#cf8d11",
    diskOuter: "#efbd27",
    form: "frilled-double",
    ray: "#fffdf8",
    rayBase: "#f4d878",
  },
});

export const realNeatDaisy = defineCultivar<DaisyCultivar>({
  id: "real-neat",
  name: "Real Neat",
  revision: 1,
  value: {
    diskCore: "#d7910e",
    diskOuter: "#f0bd1f",
    form: "fluted-double",
    ray: "#fffefb",
    rayBase: "#f3d76b",
  },
});

export const daisyCultivars = Object.freeze([
  alaskaDaisy,
  bananaCreamDaisy,
  crazyDaisy,
  realNeatDaisy,
]);

export const daisy = defineSpecies<DaisyTraits, DaisyCultivar>({
  defaultCultivar: alaskaDaisy,
  develop({ anatomy, genome }) {
    const traits = genome.traits;
    const ray = anatomy.lamina({
      bend: traits.rayBend,
      crown: traits.rayCrown,
      edgeCurl: traits.rayCurl,
      id: "ray",
      length: traits.rayLength,
      profile: "strap",
      ruffle: { amplitude: traits.rayRuffle, phase: 0.7, waves: 3 },
      shoulder: traits.rayShoulder,
      thickness: traits.rayThickness,
      tip: "round",
      twist: traits.rayTwist,
      width: traits.rayWidth,
    });
    const receptacle = anatomy.ellipsoid({
      id: "receptacle",
      radii: [
        traits.diskRadius * 0.98,
        traits.diskRadius * 0.98,
        traits.diskDome * 0.75,
      ],
    });
    const floret = anatomy.ellipsoid({
      id: "disk-floret",
      radii: [0.018, 0.022, 0.032],
    });
    const rayPart = anatomy.part({
      geometry: ray,
      pigment: pigment.layered(traits.rayColor, [
        {
          amount: field.multiply(
            0.42,
            field.falloff(0.05, 0.42, field.coordinate("v"))
          ),
          color: traits.rayBaseColor,
          id: "warm-base",
        },
        {
          amount: field.multiply(
            0.13,
            field.falloff(0.008, 0.065, field.feature("midrib"))
          ),
          color: "#fff9d9",
          id: "midrib-light",
        },
        {
          amount: field.multiply(
            0.1,
            field.falloff(0.003, 0.025, field.feature("outline"))
          ),
          color: "#e4ded2",
          id: "edge-separation",
        },
      ]),
      tissue: anatomy.tissues.petal({
        softness: 0.92,
        thickness: 0.34,
        translucency: 0.4,
      }),
    });
    const receptaclePart = anatomy.part({
      geometry: receptacle,
      pigment: pigment.solid(traits.diskOuter),
      tissue: anatomy.tissues.pollen(),
    });
    const outerDiskPart = anatomy.part({
      geometry: floret,
      id: "disk-outer",
      pigment: pigment.solid(traits.diskOuter),
      tissue: anatomy.tissues.pollen(),
    });
    const coreDiskPart = anatomy.part({
      geometry: floret,
      id: "disk-core",
      pigment: pigment.solid(traits.diskCore),
      tissue: anatomy.tissues.pollen(),
    });
    const outerFlorets = Math.round(traits.floretCount * 0.62);
    const rays = Array.from({ length: traits.rayLayers }, (_, layer) =>
      anatomy.radial({
        count: traits.rayCount,
        id: `rays-${layer + 1}`,
        part: rayPart,
        radius: traits.diskRadius * (0.68 - 0.05 * layer),
        semantic: "ray-floret",
        startAngle: Math.PI / 2 + (layer * Math.PI) / traits.rayCount,
        tilt: -0.15 + 0.035 * layer,
        z: -0.05 + 0.02 * layer,
      })
    );
    return anatomy.flower({
      keyLight: [-0.7, 0.85, 1],
      parts: [rayPart, receptaclePart, outerDiskPart, coreDiskPart],
      roots: [
        ...rays,
        anatomy.organ({
          id: "receptacle",
          part: receptaclePart,
          semantic: "receptacle",
        }),
        anatomy.phyllotaxis({
          count: outerFlorets,
          dome: traits.diskDome * 0.8,
          id: "disk-outer",
          innerRadius: traits.diskRadius * 0.56,
          part: outerDiskPart,
          radius: traits.diskRadius,
          semantic: "disk-floret",
        }),
        anatomy.phyllotaxis({
          count: traits.floretCount - outerFlorets,
          dome: traits.diskDome,
          id: "disk-core",
          part: coreDiskPart,
          radius: traits.diskRadius * 0.58,
          semantic: "disk-floret",
          startAngle: Math.PI * 0.37,
        }),
      ],
    });
  },
  id: "@nbot/flowers:daisy",
  name: "Shasta Daisy",
  revision: 1,
  sample({ cultivar, random }) {
    const form = FORMS[cultivar.value.form];
    return {
      diskCore: cultivar.value.diskCore,
      diskDome: random.range("disk.dome", 0.085, 0.12),
      diskOuter: cultivar.value.diskOuter,
      diskRadius: random.range("disk.radius", ...form.disk),
      floretCount: random.integer("disk.floret-count", ...form.florets),
      rayBaseColor: cultivar.value.rayBase,
      rayBend: random.range("ray.bend", ...form.bend),
      rayColor: cultivar.value.ray,
      rayCount: random.integer("ray.count", ...form.count),
      rayCrown: random.range("ray.crown", ...form.crown),
      rayCurl: random.range("ray.curl", ...form.curl),
      rayLayers: form.layers,
      rayLength: random.range("ray.length", ...form.length),
      rayRuffle: random.range("ray.ruffle", ...form.ruffle),
      rayShoulder: random.range("ray.shoulder", ...form.shoulder),
      rayThickness: random.range("ray.thickness", ...form.thickness),
      rayTwist: random.range("ray.twist", ...form.twist),
      rayWidth: random.range("ray.width", ...form.width),
    };
  },
});
