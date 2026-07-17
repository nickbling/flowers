import {
  defineCultivar,
  defineSpecies,
  field,
  pigment,
  translate,
} from "@/src/core";

export type PassionflowerCultivar = Readonly<{
  anther: `#${string}`;
  coronaBand: `#${string}`;
  coronaBase: `#${string}`;
  coronaRoot: `#${string}`;
  coronaTip: `#${string}`;
  form: "broad" | "classic" | "slender";
  petal: `#${string}`;
  sepal: `#${string}`;
  stigma: `#${string}`;
  style: `#${string}`;
  tepalAccent: `#${string}`;
}>;

export type PassionflowerTraits = Readonly<{
  antherColor: `#${string}`;
  coronaBand: `#${string}`;
  coronaBase: `#${string}`;
  coronaInnerCount: number;
  coronaLength: number;
  coronaOuterCount: number;
  coronaRoot: `#${string}`;
  coronaTip: `#${string}`;
  petalColor: `#${string}`;
  petalLength: number;
  petalWidth: number;
  sepalColor: `#${string}`;
  sepalLength: number;
  sepalWidth: number;
  stigmaColor: `#${string}`;
  styleColor: `#${string}`;
  tepalAccent: `#${string}`;
}>;

type PassionflowerForm = Readonly<{
  coronaInnerPairs: readonly [number, number];
  coronaLength: readonly [number, number];
  coronaOuterThirds: readonly [number, number];
  petalLength: readonly [number, number];
  petalWidth: readonly [number, number];
  sepalLength: readonly [number, number];
  sepalWidth: readonly [number, number];
}>;

const FORMS: Readonly<
  Record<PassionflowerCultivar["form"], PassionflowerForm>
> = {
  broad: {
    coronaInnerPairs: [15, 17],
    coronaLength: [0.6, 0.68],
    coronaOuterThirds: [23, 26],
    petalLength: [0.82, 0.9],
    petalWidth: [0.44, 0.5],
    sepalLength: [0.87, 0.94],
    sepalWidth: [0.37, 0.43],
  },
  classic: {
    coronaInnerPairs: [14, 16],
    coronaLength: [0.58, 0.64],
    coronaOuterThirds: [22, 25],
    petalLength: [0.81, 0.87],
    petalWidth: [0.4, 0.45],
    sepalLength: [0.86, 0.92],
    sepalWidth: [0.35, 0.4],
  },
  slender: {
    coronaInnerPairs: [15, 17],
    coronaLength: [0.64, 0.72],
    coronaOuterThirds: [24, 27],
    petalLength: [0.88, 0.97],
    petalWidth: [0.31, 0.37],
    sepalLength: [0.92, 1.01],
    sepalWidth: [0.29, 0.35],
  },
};

export const caeruleaPassionflower = defineCultivar<PassionflowerCultivar>({
  id: "caerulea",
  name: "Caerulea",
  revision: 1,
  value: {
    anther: "#d6b63d",
    coronaBand: "#f4f0f5",
    coronaBase: "#fbfaf4",
    coronaRoot: "#42183d",
    coronaTip: "#5141b7",
    form: "classic",
    petal: "#fffdf6",
    sepal: "#edf1dc",
    stigma: "#8bb05a",
    style: "#88a55c",
    tepalAccent: "#cad09a",
  },
});

export const constanceEliottPassionflower =
  defineCultivar<PassionflowerCultivar>({
    id: "constance-eliott",
    name: "Constance Eliott",
    revision: 1,
    value: {
      anther: "#d8bd58",
      coronaBand: "#f4dce9",
      coronaBase: "#fffdfb",
      coronaRoot: "#8c3b70",
      coronaTip: "#fffefd",
      form: "classic",
      petal: "#fffefd",
      sepal: "#f5f3ed",
      stigma: "#9ab767",
      style: "#b8cf83",
      tepalAccent: "#e4cfda",
    },
  });

export const amethystPassionflower = defineCultivar<PassionflowerCultivar>({
  id: "amethyst",
  name: "Amethyst",
  revision: 1,
  value: {
    anther: "#d6b643",
    coronaBand: "#b083c7",
    coronaBase: "#d9bddf",
    coronaRoot: "#4a194a",
    coronaTip: "#59308f",
    form: "broad",
    petal: "#c98ac8",
    sepal: "#ad6ab5",
    stigma: "#91ad60",
    style: "#8fa75f",
    tepalAccent: "#8a438d",
  },
});

export const incensePassionflower = defineCultivar<PassionflowerCultivar>({
  id: "incense",
  name: "Incense",
  revision: 1,
  value: {
    anther: "#d5b940",
    coronaBand: "#c8a9e5",
    coronaBase: "#ddd0ef",
    coronaRoot: "#3b153f",
    coronaTip: "#6840ae",
    form: "broad",
    petal: "#9c67bb",
    sepal: "#8052a0",
    stigma: "#8ead5a",
    style: "#769952",
    tepalAccent: "#613477",
  },
});

export const ladyMargaretPassionflower = defineCultivar<PassionflowerCultivar>({
  id: "lady-margaret",
  name: "Lady Margaret",
  revision: 1,
  value: {
    anther: "#e3bc42",
    coronaBand: "#f6dce8",
    coronaBase: "#d33d66",
    coronaRoot: "#40102f",
    coronaTip: "#7250a0",
    form: "slender",
    petal: "#df416f",
    sepal: "#c52e59",
    stigma: "#9fbe5d",
    style: "#b7d176",
    tepalAccent: "#79183e",
  },
});

export const passionflowerCultivars = Object.freeze([
  caeruleaPassionflower,
  constanceEliottPassionflower,
  amethystPassionflower,
  incensePassionflower,
  ladyMargaretPassionflower,
]);

export const passionflower = defineSpecies<
  PassionflowerTraits,
  PassionflowerCultivar
>({
  defaultCultivar: caeruleaPassionflower,
  develop({ anatomy, genome }) {
    const traits = genome.traits;
    const sepal = anatomy.lamina({
      crown: 0.24,
      edgeCurl: 0.06,
      id: "sepal",
      length: traits.sepalLength,
      profile: "lanceolate",
      shoulder: 0.56,
      thickness: 0.075,
      tip: "soft-point",
      twist: 0.012,
      width: traits.sepalWidth,
    });
    const petal = anatomy.lamina({
      crown: 0.25,
      edgeCurl: 0.07,
      id: "petal",
      length: traits.petalLength,
      profile: "obovate",
      ruffle: { amplitude: 0.012, phase: 0.4, waves: 2 },
      shoulder: 0.64,
      thickness: 0.08,
      tip: "round",
      twist: -0.01,
      width: traits.petalWidth,
    });
    const outerCoronaA = anatomy.sweep({
      id: "corona-outer-a",
      path: [
        [0, 0, 0.02],
        [0.008, traits.coronaLength * 0.22, 0.13],
        [-0.012, traits.coronaLength * 0.5, 0.19],
        [0.014, traits.coronaLength * 0.78, 0.14],
        [0.026, traits.coronaLength, 0.048],
      ],
      radius: [0.018, 0.0165, 0.014, 0.0115, 0.009],
    });
    const outerCoronaB = anatomy.sweep({
      id: "corona-outer-b",
      path: [
        [0, 0, 0.025],
        [-0.01, traits.coronaLength * 0.23, 0.145],
        [0.014, traits.coronaLength * 0.51, 0.21],
        [-0.02, traits.coronaLength * 0.78, 0.145],
        [-0.03, traits.coronaLength * 0.99, 0.058],
      ],
      radius: [0.0185, 0.017, 0.0145, 0.012, 0.0095],
    });
    const outerCoronaC = anatomy.sweep({
      id: "corona-outer-c",
      path: [
        [0, 0, 0.018],
        [0.006, traits.coronaLength * 0.23, 0.125],
        [0.022, traits.coronaLength * 0.52, 0.18],
        [-0.008, traits.coronaLength * 0.8, 0.12],
        [-0.02, traits.coronaLength * 1.02, 0.042],
      ],
      radius: [0.0175, 0.016, 0.0135, 0.011, 0.0085],
    });
    const innerCorona = anatomy.sweep({
      id: "corona-inner",
      path: [
        [0, 0, 0.03],
        [0.008, traits.coronaLength * 0.18, 0.145],
        [-0.012, traits.coronaLength * 0.36, 0.205],
        [0.015, traits.coronaLength * 0.56, 0.165],
        [0.022, traits.coronaLength * 0.71, 0.1],
      ],
      radius: [0.019, 0.017, 0.0145, 0.0115, 0.009],
    });
    const androgynophore = anatomy.sweep({
      id: "androgynophore",
      path: [
        [0, 0, 0],
        [0.006, -0.004, 0.18],
        [-0.005, 0.003, 0.36],
        [0, 0, 0.5],
      ],
      radius: [0.072, 0.062, 0.048, 0.037],
    });
    const stamen = anatomy.sweep({
      id: "stamen",
      path: [
        [0, 0, 0],
        [0.008, 0.1, 0.055],
        [-0.01, 0.215, 0.09],
        [0.012, 0.285, 0.055],
      ],
      radius: [0.023, 0.019, 0.014, 0.01],
    });
    const style = anatomy.sweep({
      id: "style",
      path: [
        [0, 0, 0],
        [-0.008, 0.07, 0.06],
        [0.012, 0.15, 0.125],
        [-0.006, 0.225, 0.165],
      ],
      radius: [0.023, 0.02, 0.014, 0.01],
    });
    const nectary = anatomy.ellipsoid({
      id: "nectary",
      radii: [0.21, 0.21, 0.055],
    });
    const ovary = anatomy.sweep({
      id: "ovary",
      path: [
        [0, 0, 0],
        [0.004, -0.002, 0.055],
        [-0.003, 0.003, 0.13],
        [0, 0, 0.205],
      ],
      radius: [0.052, 0.092, 0.078, 0.038],
    });
    const anther = anatomy.ellipsoid({
      id: "anther",
      radii: [0.074, 0.018, 0.024],
    });
    const stigma = anatomy.sweep({
      id: "stigma",
      path: [
        [-0.046, -0.004, 0],
        [-0.018, 0.008, 0.008],
        [0.02, -0.006, 0.01],
        [0.05, 0.003, 0.002],
      ],
      radius: [0.021, 0.045, 0.043, 0.02],
    });
    const tepalPigment = (base: `#${string}`, id: string) =>
      anatomy.appearance({
        id,
        pigment: pigment.layered(base, [
          {
            amount: field.multiply(
              0.26,
              field.falloff(0.02, 0.46, field.coordinate("v"))
            ),
            color: traits.tepalAccent,
            id: "violet-base",
          },
          {
            amount: field.multiply(
              0.12,
              field.falloff(0.004, 0.032, field.feature("outline"))
            ),
            color: traits.tepalAccent,
            id: "violet-margin",
          },
          {
            amount: field.multiply(
              0.18,
              field.multiply(
                field.falloff(0.008, 0.075, field.feature("midrib")),
                field.falloff(0.1, 0.68, field.coordinate("v"))
              )
            ),
            color: traits.tepalAccent,
            id: "violet-midrib",
          },
        ]),
        tissue: anatomy.tissues.petal({
          softness: 0.92,
          thickness: 0.44,
          translucency: 0.4,
        }),
      });
    const sepalPaint = tepalPigment(traits.sepalColor, "sepal");
    const petalPaint = tepalPigment(traits.petalColor, "petal");
    const coronaPigment = pigment.layered(traits.coronaRoot, [
      {
        amount: field.band(field.coordinate("v"), 0.18, 0.29, 0.58, 0.7),
        color: traits.coronaBase,
        id: "ivory-band",
      },
      {
        amount: field.band(field.coordinate("v"), 0.56, 0.67, 0.74, 0.84),
        color: traits.coronaBand,
        id: "amethyst-band",
      },
      {
        amount: field.smoothstep(0.74, 0.91, field.coordinate("v")),
        color: traits.coronaTip,
        id: "violet-tip",
      },
    ]);
    const outerCoronaPaint = anatomy.appearance({
      id: "corona-outer",
      pigment: coronaPigment,
      tissue: anatomy.tissues.filament({
        softness: 0.88,
        thickness: 0.62,
        translucency: 0.2,
      }),
    });
    const innerCoronaPaint = anatomy.appearance({
      id: "corona-inner",
      pigment: pigment.layered(traits.coronaRoot, [
        {
          amount: field.band(field.coordinate("v"), 0.16, 0.28, 0.46, 0.6),
          color: traits.coronaBase,
          id: "inner-ivory",
        },
        {
          amount: field.smoothstep(0.56, 0.82, field.coordinate("v")),
          color: traits.coronaTip,
          id: "inner-tip",
        },
      ]),
      tissue: anatomy.tissues.filament({
        softness: 0.9,
        thickness: 0.66,
        translucency: 0.2,
      }),
    });
    const nectaryPaint = anatomy.appearance({
      id: "nectary",
      pigment: pigment.solid("#dce6ab"),
      tissue: anatomy.tissues.custom("nectary", {
        softness: 0.72,
        thickness: 0.55,
        translucency: 0.1,
      }),
    });
    const columnPaint = anatomy.appearance({
      id: "column",
      pigment: pigment.solid("#bad27a"),
      tissue: anatomy.tissues.custom("column", {
        softness: 0.7,
        thickness: 0.58,
        translucency: 0.12,
      }),
    });
    const ovaryPaint = anatomy.appearance({
      id: "ovary",
      pigment: pigment.solid(traits.stigmaColor),
      tissue: anatomy.tissues.custom("ovary", {
        softness: 0.68,
        thickness: 0.66,
        translucency: 0.08,
      }),
    });
    const antherPaint = anatomy.appearance({
      id: "anther",
      pigment: pigment.solid(traits.antherColor),
      tissue: anatomy.tissues.anther(),
    });
    const stigmaPaint = anatomy.appearance({
      id: "stigma",
      pigment: pigment.solid(traits.stigmaColor),
      tissue: anatomy.tissues.stigma({ softness: 0.66, thickness: 0.62 }),
    });
    const stylePaint = anatomy.appearance({
      id: "style",
      pigment: pigment.solid(traits.styleColor),
      tissue: anatomy.tissues.stigma({ softness: 0.72, thickness: 0.58 }),
    });
    const outerThird = traits.coronaOuterCount / 3;
    return anatomy.flower({
      appearances: [
        sepalPaint,
        petalPaint,
        outerCoronaPaint,
        innerCoronaPaint,
        nectaryPaint,
        columnPaint,
        ovaryPaint,
        antherPaint,
        stigmaPaint,
        stylePaint,
      ],
      geometries: [
        sepal,
        petal,
        outerCoronaA,
        outerCoronaB,
        outerCoronaC,
        innerCorona,
        nectary,
        androgynophore,
        stamen,
        style,
        ovary,
        anther,
        stigma,
      ],
      keyLight: [-0.65, 0.8, 1],
      roots: [
        anatomy.group({
          children: [
            anatomy.radial({
              appearance: sepalPaint,
              count: 5,
              geometry: sepal,
              id: "sepals",
              radius: 0.055,
              semantic: "sepal",
              startAngle: Math.PI / 2,
              tilt: -0.22,
              z: -0.1,
            }),
            anatomy.radial({
              appearance: petalPaint,
              count: 5,
              geometry: petal,
              id: "petals",
              radius: 0.06,
              semantic: "petal",
              startAngle: Math.PI / 2 + Math.PI / 5,
              tilt: -0.13,
              z: -0.045,
            }),
            anatomy.radial({
              appearance: outerCoronaPaint,
              count: outerThird,
              geometry: outerCoronaA,
              id: "corona-outer-a",
              radius: 0.16,
              semantic: "corona-filament",
              startAngle: Math.PI / 2,
              z: 0.055,
            }),
            anatomy.radial({
              appearance: outerCoronaPaint,
              count: outerThird,
              geometry: outerCoronaB,
              id: "corona-outer-b",
              radius: 0.16,
              semantic: "corona-filament",
              startAngle: Math.PI / 2 + (2 * Math.PI) / traits.coronaOuterCount,
              z: 0.055,
            }),
            anatomy.radial({
              appearance: outerCoronaPaint,
              count: outerThird,
              geometry: outerCoronaC,
              id: "corona-outer-c",
              radius: 0.16,
              semantic: "corona-filament",
              startAngle: Math.PI / 2 + (4 * Math.PI) / traits.coronaOuterCount,
              z: 0.055,
            }),
            anatomy.radial({
              appearance: innerCoronaPaint,
              count: traits.coronaInnerCount,
              geometry: innerCorona,
              id: "corona-inner",
              radius: 0.13,
              semantic: "corona-filament",
              startAngle: Math.PI / 2 + 0.031,
              z: 0.075,
            }),
            anatomy.organ({
              appearance: nectaryPaint,
              geometry: nectary,
              id: "nectary",
              semantic: "nectary",
              transform: translate(0, 0, 0.09),
            }),
            anatomy.organ({
              appearance: columnPaint,
              geometry: androgynophore,
              id: "androgynophore",
              semantic: "androgynophore",
              transform: translate(0, 0, 0.09),
            }),
            anatomy.organ({
              appearance: ovaryPaint,
              geometry: ovary,
              id: "ovary",
              semantic: "ovary",
              transform: translate(0, 0, 0.51),
            }),
            anatomy.radial({
              appearance: columnPaint,
              count: 5,
              geometry: stamen,
              id: "stamens",
              radius: 0.03,
              semantic: "stamen-filament",
              startAngle: Math.PI / 2,
              z: 0.44,
            }),
            anatomy.radial({
              appearance: antherPaint,
              count: 5,
              geometry: anther,
              id: "anther-inner-lobes",
              radius: 0.284,
              semantic: "anther",
              startAngle: Math.PI / 2,
              tilt: -0.16,
              z: 0.52,
            }),
            anatomy.radial({
              appearance: antherPaint,
              count: 5,
              geometry: anther,
              id: "anther-outer-lobes",
              radius: 0.316,
              semantic: "anther",
              startAngle: Math.PI / 2,
              tilt: -0.16,
              z: 0.52,
            }),
            anatomy.radial({
              appearance: stylePaint,
              count: 3,
              geometry: style,
              id: "styles",
              radius: 0.015,
              semantic: "style",
              startAngle: Math.PI / 2,
              z: 0.6,
            }),
            anatomy.radial({
              appearance: stigmaPaint,
              count: 3,
              geometry: stigma,
              id: "stigmas",
              radius: 0.235,
              semantic: "stigma",
              startAngle: Math.PI / 2,
              tilt: -0.12,
              z: 0.76,
            }),
          ],
          id: "flower-head",
        }),
      ],
    });
  },
  id: "@nbot/flowers:passionflower",
  name: "Passionflower",
  revision: 1,
  sample({ cultivar, random }) {
    const form = FORMS[cultivar.value.form];
    return {
      antherColor: cultivar.value.anther,
      coronaBand: cultivar.value.coronaBand,
      coronaBase: cultivar.value.coronaBase,
      coronaInnerCount:
        2 * random.integer("corona.inner-pairs", ...form.coronaInnerPairs),
      coronaLength: random.range("corona.length", ...form.coronaLength),
      coronaOuterCount:
        3 * random.integer("corona.outer-thirds", ...form.coronaOuterThirds),
      coronaRoot: cultivar.value.coronaRoot,
      coronaTip: cultivar.value.coronaTip,
      petalColor: cultivar.value.petal,
      petalLength: random.range("petal.length", ...form.petalLength),
      petalWidth: random.range("petal.width", ...form.petalWidth),
      sepalColor: cultivar.value.sepal,
      sepalLength: random.range("sepal.length", ...form.sepalLength),
      sepalWidth: random.range("sepal.width", ...form.sepalWidth),
      stigmaColor: cultivar.value.stigma,
      styleColor: cultivar.value.style,
      tepalAccent: cultivar.value.tepalAccent,
    };
  },
});
