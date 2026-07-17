import { defineCultivar, defineSpecies, field, pigment } from "@/src/core";

export type SunflowerCultivar = Readonly<{
  bract: `#${string}`;
  diskCore: `#${string}`;
  diskMiddle: `#${string}`;
  diskOuter: `#${string}`;
  form: "double" | "single";
  pattern: "bicolor" | "solid";
  ray: `#${string}`;
  rayBase: `#${string}`;
  rayEdge: `#${string}`;
  rayLight: `#${string}`;
}>;

export type SunflowerTraits = Readonly<{
  bractColor: `#${string}`;
  diskCore: `#${string}`;
  diskMiddle: `#${string}`;
  diskOuter: `#${string}`;
  diskRadius: number;
  floretCount: number;
  innerRayLayers: number;
  rayBaseColor: `#${string}`;
  rayBaseReach: number;
  rayBaseStrength: number;
  rayColor: `#${string}`;
  rayCount: number;
  rayEdgeColor: `#${string}`;
  rayLength: number;
  rayLightColor: `#${string}`;
}>;

type SunflowerForm = Readonly<{
  disk: readonly [number, number];
  florets: readonly [number, number];
  innerRayLayers: number;
  rayCount: readonly [number, number];
  rayLength: readonly [number, number];
}>;

const FORMS: Readonly<Record<SunflowerCultivar["form"], SunflowerForm>> = {
  double: {
    disk: [0.18, 0.22],
    florets: [120, 160],
    innerRayLayers: 4,
    rayCount: [30, 36],
    rayLength: [0.72, 0.8],
  },
  single: {
    disk: [0.4, 0.45],
    florets: [720, 820],
    innerRayLayers: 0,
    rayCount: [22, 26],
    rayLength: [0.65, 0.72],
  },
};

export const procutWhiteLiteSunflower = defineCultivar<SunflowerCultivar>({
  id: "procut-white-lite",
  name: "ProCut White Lite",
  revision: 1,
  value: {
    bract: "#667a3b",
    diskCore: "#71853b",
    diskMiddle: "#879947",
    diskOuter: "#a7ab58",
    form: "single",
    pattern: "solid",
    ray: "#fff4cf",
    rayBase: "#e6d47a",
    rayEdge: "#d6ca8b",
    rayLight: "#fffdf1",
  },
});

export const lemonQueenSunflower = defineCultivar<SunflowerCultivar>({
  id: "lemon-queen",
  name: "Lemon Queen",
  revision: 1,
  value: {
    bract: "#617632",
    diskCore: "#3e2416",
    diskMiddle: "#6b3b1b",
    diskOuter: "#a8681c",
    form: "single",
    pattern: "solid",
    ray: "#f5d72e",
    rayBase: "#d99b17",
    rayEdge: "#e0b421",
    rayLight: "#fff17b",
  },
});

export const procutOrangeSunflower = defineCultivar<SunflowerCultivar>({
  id: "procut-orange",
  name: "ProCut Orange",
  revision: 1,
  value: {
    bract: "#617632",
    diskCore: "#3f1e12",
    diskMiddle: "#6d3517",
    diskOuter: "#a95b1c",
    form: "single",
    pattern: "solid",
    ray: "#f7b719",
    rayBase: "#d87511",
    rayEdge: "#d98613",
    rayLight: "#ffd75a",
  },
});

export const procutRedLemonBicolorSunflower = defineCultivar<SunflowerCultivar>(
  {
    id: "procut-red-lemon-bicolor",
    name: "ProCut Red Lemon Bicolor",
    revision: 1,
    value: {
      bract: "#5a7133",
      diskCore: "#32170f",
      diskMiddle: "#572517",
      diskOuter: "#7d321d",
      form: "single",
      pattern: "bicolor",
      ray: "#f1c52f",
      rayBase: "#7d2431",
      rayEdge: "#a33a38",
      rayLight: "#ffe36c",
    },
  }
);

export const procutRedSunflower = defineCultivar<SunflowerCultivar>({
  id: "procut-red",
  name: "ProCut Red",
  revision: 1,
  value: {
    bract: "#586d32",
    diskCore: "#2f160f",
    diskMiddle: "#4f2419",
    diskOuter: "#6f3221",
    form: "single",
    pattern: "solid",
    ray: "#9c2936",
    rayBase: "#5c1d25",
    rayEdge: "#741e2b",
    rayLight: "#ca5654",
  },
});

export const teddyBearSunflower = defineCultivar<SunflowerCultivar>({
  id: "teddy-bear",
  name: "Teddy Bear",
  revision: 1,
  value: {
    bract: "#607634",
    diskCore: "#c97912",
    diskMiddle: "#db9215",
    diskOuter: "#e6a618",
    form: "double",
    pattern: "solid",
    ray: "#f4ae16",
    rayBase: "#d8790f",
    rayEdge: "#d88b12",
    rayLight: "#ffd84b",
  },
});

export const sunflowerCultivars = Object.freeze([
  procutWhiteLiteSunflower,
  lemonQueenSunflower,
  procutOrangeSunflower,
  procutRedLemonBicolorSunflower,
  procutRedSunflower,
  teddyBearSunflower,
]);

export const sunflower = defineSpecies<SunflowerTraits, SunflowerCultivar>({
  defaultCultivar: procutOrangeSunflower,
  develop({ anatomy, genome }) {
    const traits = genome.traits;
    const rearRay = anatomy.lamina({
      bend: -0.035,
      crown: 0.18,
      edgeCurl: 0.045,
      id: "rear-ray",
      length: traits.rayLength,
      profile: "lanceolate",
      ruffle: { amplitude: 0.012, phase: 0.2, waves: 2 },
      shoulder: 0.53,
      thickness: 0.055,
      tip: "soft-point",
      width: 0.31,
    });
    const frontRay = anatomy.lamina({
      bend: 0.025,
      crown: 0.21,
      edgeCurl: 0.055,
      id: "front-ray",
      length: traits.rayLength * 0.9,
      profile: "lanceolate",
      ruffle: { amplitude: 0.015, phase: 1.1, waves: 2 },
      shoulder: 0.57,
      thickness: 0.06,
      tip: "soft-point",
      width: 0.34,
    });
    const bract = anatomy.lamina({
      crown: 0.04,
      id: "bract",
      length: traits.rayLength * 0.58,
      profile: "lanceolate",
      shoulder: 0.42,
      thickness: 0.035,
      tip: "pointed",
      width: 0.13,
    });
    const receptacle = anatomy.ellipsoid({
      id: "receptacle",
      radii: [traits.diskRadius, traits.diskRadius, 0.085],
    });
    const floret = anatomy.ellipsoid({
      id: "disk-floret",
      radii: [0.011, 0.015, 0.025],
    });
    const rayPigment = pigment.layered(traits.rayColor, [
      {
        amount: field.multiply(
          traits.rayBaseStrength,
          field.falloff(0.04, traits.rayBaseReach, field.coordinate("v"))
        ),
        color: traits.rayBaseColor,
        id: "ochre-base",
      },
      {
        amount: field.multiply(
          0.18,
          field.falloff(0.008, 0.065, field.feature("midrib"))
        ),
        color: traits.rayLightColor,
        id: "sunlit-midrib",
      },
      {
        amount: field.multiply(
          0.14,
          field.falloff(0.003, 0.028, field.feature("outline"))
        ),
        color: traits.rayEdgeColor,
        id: "amber-edge",
      },
    ]);
    const rearRayPart = anatomy.part({
      geometry: rearRay,
      pigment: rayPigment,
      tissue: anatomy.tissues.petal({
        softness: 0.88,
        thickness: 0.4,
        translucency: 0.32,
      }),
    });
    const frontRayPart = anatomy.part({
      geometry: frontRay,
      pigment: rayPigment,
      tissue: anatomy.tissues.petal({
        softness: 0.9,
        thickness: 0.44,
        translucency: 0.34,
      }),
    });
    const bractPart = anatomy.part({
      geometry: bract,
      pigment: pigment.layered(traits.bractColor, [
        {
          amount: field.multiply(
            0.2,
            field.falloff(0.01, 0.07, field.feature("midrib"))
          ),
          color: "#a5a54b",
          id: "bract-rib",
        },
      ]),
      tissue: anatomy.tissues.sepal(),
    });
    const receptaclePart = anatomy.part({
      geometry: receptacle,
      pigment: pigment.solid(traits.diskMiddle),
      tissue: anatomy.tissues.pollen(),
    });
    const diskPart = (id: string, color: `#${string}`) =>
      anatomy.part({
        geometry: floret,
        id,
        pigment: pigment.solid(color),
        tissue: anatomy.tissues.pollen(),
      });
    const outerDiskPart = diskPart("disk-outer", traits.diskOuter);
    const middleDiskPart = diskPart("disk-middle", traits.diskMiddle);
    const coreDiskPart = diskPart("disk-core", traits.diskCore);
    const outerCount = Math.round(traits.floretCount * 0.36);
    const middleCount = Math.round(traits.floretCount * 0.46);
    const coreCount = traits.floretCount - outerCount - middleCount;
    const innerRay = anatomy.lamina({
      bend: 0.015,
      crown: 0.24,
      edgeCurl: 0.045,
      id: "inner-ray",
      length: traits.rayLength * 0.52,
      profile: "obovate",
      ruffle: { amplitude: 0.02, phase: 0.8, waves: 2 },
      shoulder: 0.62,
      thickness: 0.065,
      tip: "round",
      width: 0.22,
    });
    const innerRayPart = anatomy.part({
      geometry: innerRay,
      pigment: rayPigment,
      tissue: anatomy.tissues.petal({
        softness: 0.92,
        thickness: 0.48,
        translucency: 0.3,
      }),
    });
    const innerRays = Array.from(
      { length: traits.innerRayLayers },
      (_, layer) =>
        anatomy.radial({
          count: traits.rayCount + 2 * layer,
          id: `inner-rays-${layer + 1}`,
          part: innerRayPart,
          radius: Math.max(0.02, traits.diskRadius * (0.78 - 0.18 * layer)),
          semantic: "ray-floret",
          startAngle: Math.PI / 2 + ((layer % 2) * Math.PI) / traits.rayCount,
          tilt: 0.02 + 0.055 * layer,
          z: 0.015 + 0.025 * layer,
        })
    );
    return anatomy.flower({
      keyLight: [-0.85, 0.8, 1],
      parts: [
        rearRayPart,
        frontRayPart,
        ...(traits.innerRayLayers > 0 ? [innerRayPart] : []),
        bractPart,
        receptaclePart,
        outerDiskPart,
        middleDiskPart,
        coreDiskPart,
      ],
      roots: [
        anatomy.radial({
          count: Math.max(18, Math.round(traits.rayCount * 0.72)),
          id: "bracts",
          part: bractPart,
          radius: traits.diskRadius * 0.72,
          semantic: "bract",
          startAngle: Math.PI / 2 + Math.PI / traits.rayCount,
          tilt: -0.16,
          z: -0.09,
        }),
        anatomy.radial({
          count: traits.rayCount,
          id: "rear-rays",
          part: rearRayPart,
          radius: traits.diskRadius * 0.78,
          semantic: "ray-floret",
          startAngle: Math.PI / 2,
          tilt: -0.16,
          z: -0.055,
        }),
        anatomy.radial({
          count: traits.rayCount,
          id: "front-rays",
          part: frontRayPart,
          radius: traits.diskRadius * 0.76,
          semantic: "ray-floret",
          startAngle: Math.PI / 2 + Math.PI / traits.rayCount,
          tilt: -0.08,
          z: -0.02,
        }),
        ...innerRays,
        anatomy.organ({
          id: "receptacle",
          part: receptaclePart,
          semantic: "receptacle",
        }),
        anatomy.phyllotaxis({
          count: outerCount,
          dome: 0.13,
          id: "disk-outer",
          innerRadius: traits.diskRadius * 0.79,
          part: outerDiskPart,
          radius: traits.diskRadius,
          semantic: "disk-floret",
        }),
        anatomy.phyllotaxis({
          count: middleCount,
          dome: 0.15,
          id: "disk-middle",
          innerRadius: traits.diskRadius * 0.48,
          part: middleDiskPart,
          radius: traits.diskRadius * 0.8,
          semantic: "disk-floret",
          startAngle: 1.7,
        }),
        anatomy.phyllotaxis({
          count: coreCount,
          dome: 0.17,
          id: "disk-core",
          part: coreDiskPart,
          radius: traits.diskRadius * 0.5,
          semantic: "disk-floret",
          startAngle: 3.1,
        }),
      ],
    });
  },
  id: "@nbot/flowers:sunflower",
  name: "Sunflower",
  revision: 1,
  sample({ cultivar, random }) {
    const form = FORMS[cultivar.value.form];
    return {
      bractColor: cultivar.value.bract,
      diskCore: cultivar.value.diskCore,
      diskMiddle: cultivar.value.diskMiddle,
      diskOuter: cultivar.value.diskOuter,
      diskRadius: random.range("disk.radius", ...form.disk),
      floretCount: random.integer("disk.floret-count", ...form.florets),
      innerRayLayers: form.innerRayLayers,
      rayBaseColor: cultivar.value.rayBase,
      rayBaseReach: cultivar.value.pattern === "bicolor" ? 0.64 : 0.38,
      rayBaseStrength: cultivar.value.pattern === "bicolor" ? 0.94 : 0.46,
      rayColor: cultivar.value.ray,
      rayCount: random.integer("ray.count", ...form.rayCount),
      rayEdgeColor: cultivar.value.rayEdge,
      rayLength: random.range("ray.length", ...form.rayLength),
      rayLightColor: cultivar.value.rayLight,
    };
  },
});
