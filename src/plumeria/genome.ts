import {
  cultivarRecipe,
  type PlumeriaCultivar,
  type PlumeriaCultivarRecipe,
} from "@/src/plumeria/cultivar";
import {
  type PlumeriaCultivarName,
  type PlumeriaVariant,
  resolvePlumeriaVariant,
} from "@/src/plumeria/variants";
import { mixTone, type Tone } from "@/src/shared/color";
import { between, intBetween, type Rng } from "@/src/shared/prng";

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

type Span = readonly [number, number];
type ToneSpan = { c: Span; h: Span; l: Span };

export type Genome = {
  accent: number;
  blush: { at: number; strength: number; tone: Tone };
  cultivar: string;
  body: { base: Tone; tip: Tone };
  form: {
    bend: number;
    fullness: number;
    length: number;
    taper: number;
  };
  margin: { strength: number; tone: Tone };
  throat: { flame: number; rays: number; reach: number; tone: Tone };
  veins: { strength: number; tone: Tone };
};

type Palette = Omit<Genome, "accent" | "cultivar" | "form">;

type Recipe = {
  blush: { at: Span; strength: Span; tone: ToneSpan };
  name: PlumeriaCultivarName;
  body: { base: ToneSpan; tip: ToneSpan };
  margin: { strength: Span; tone: ToneSpan };
  throat: { flame: Span; rays: Span; reach: Span; tone: ToneSpan };
  veins: { strength: Span; tone: ToneSpan };
  weight: number;
};

type SampleableRecipe = Omit<Recipe, "name" | "weight">;

// Continuous hue spans such as 348..372 cross the zero-degree seam.
const CULTIVARS: readonly Recipe[] = [
  {
    blush: {
      at: [0.7, 0.9],
      strength: [0, 0.3],
      tone: { c: [0.03, 0.07], h: [350, 375], l: [0.9, 0.94] },
    },
    body: {
      base: { c: [0.015, 0.035], h: [74, 88], l: [0.945, 0.965] },
      tip: { c: [0.002, 0.008], h: [72, 86], l: [0.955, 0.972] },
    },
    margin: {
      strength: [0.12, 0.3],
      tone: { c: [0.02, 0.05], h: [80, 91], l: [0.92, 0.95] },
    },
    name: "celadine",
    throat: {
      flame: [0.55, 0.85],
      rays: [0, 0.3],
      reach: [0.48, 0.68],
      tone: { c: [0.19, 0.22], h: [82, 92], l: [0.85, 0.89] },
    },
    veins: {
      strength: [0, 0.22],
      tone: { c: [0.09, 0.13], h: [80, 90], l: [0.86, 0.9] },
    },
    weight: 3,
  },
  {
    blush: {
      at: [0.5, 0.78],
      strength: [0.25, 0.55],
      tone: { c: [0.06, 0.1], h: [348, 368], l: [0.86, 0.9] },
    },
    body: {
      base: { c: [0.02, 0.05], h: [60, 90], l: [0.93, 0.96] },
      tip: { c: [0.06, 0.12], h: [348, 372], l: [0.88, 0.94] },
    },
    margin: {
      strength: [0.45, 0.75],
      tone: { c: [0.07, 0.12], h: [348, 368], l: [0.82, 0.88] },
    },
    name: "rainbow",
    throat: {
      flame: [0.65, 1],
      rays: [0.5, 0.9],
      reach: [0.5, 0.68],
      tone: { c: [0.16, 0.19], h: [55, 72], l: [0.78, 0.84] },
    },
    veins: {
      strength: [0.4, 0.7],
      tone: { c: [0.12, 0.16], h: [35, 52], l: [0.72, 0.8] },
    },
    weight: 3,
  },
  {
    blush: {
      at: [0.4, 0.7],
      strength: [0.2, 0.5],
      tone: { c: [0.09, 0.12], h: [350, 365], l: [0.78, 0.84] },
    },
    body: {
      base: { c: [0.09, 0.14], h: [352, 372], l: [0.84, 0.9] },
      tip: { c: [0.1, 0.15], h: [348, 368], l: [0.8, 0.87] },
    },
    margin: {
      strength: [0.35, 0.65],
      tone: { c: [0.1, 0.15], h: [346, 362], l: [0.74, 0.82] },
    },
    name: "pink pearl",
    throat: {
      flame: [0.5, 0.8],
      rays: [0.15, 0.5],
      reach: [0.36, 0.5],
      tone: { c: [0.155, 0.185], h: [55, 75], l: [0.74, 0.8] },
    },
    veins: {
      strength: [0.25, 0.55],
      tone: { c: [0.11, 0.15], h: [350, 365], l: [0.6, 0.7] },
    },
    weight: 2.2,
  },
  {
    blush: {
      at: [0.5, 0.75],
      strength: [0.25, 0.5],
      tone: { c: [0.08, 0.11], h: [18, 35], l: [0.82, 0.87] },
    },
    body: {
      base: { c: [0.1, 0.14], h: [38, 58], l: [0.86, 0.91] },
      tip: { c: [0.1, 0.15], h: [12, 35], l: [0.78, 0.86] },
    },
    margin: {
      strength: [0.25, 0.5],
      tone: { c: [0.04, 0.08], h: [45, 70], l: [0.9, 0.94] },
    },
    name: "sunset",
    throat: {
      flame: [0.6, 0.9],
      rays: [0.25, 0.55],
      reach: [0.4, 0.58],
      tone: { c: [0.155, 0.185], h: [58, 74], l: [0.74, 0.8] },
    },
    veins: {
      strength: [0.18, 0.45],
      tone: { c: [0.11, 0.14], h: [38, 55], l: [0.66, 0.76] },
    },
    weight: 1.8,
  },
  {
    blush: {
      at: [0.55, 0.8],
      strength: [0.3, 0.55],
      tone: { c: [0.03, 0.06], h: [348, 370], l: [0.9, 0.94] },
    },
    body: {
      base: { c: [0.13, 0.18], h: [344, 358], l: [0.7, 0.79] },
      tip: { c: [0.1, 0.14], h: [340, 355], l: [0.76, 0.85] },
    },
    margin: {
      strength: [0.3, 0.6],
      tone: { c: [0.05, 0.09], h: [340, 355], l: [0.85, 0.91] },
    },
    name: "fuchsia",
    throat: {
      flame: [0.5, 0.8],
      rays: [0.35, 0.7],
      reach: [0.34, 0.48],
      tone: { c: [0.15, 0.185], h: [42, 60], l: [0.72, 0.78] },
    },
    veins: {
      strength: [0.3, 0.6],
      tone: { c: [0.13, 0.17], h: [344, 360], l: [0.5, 0.62] },
    },
    weight: 1.5,
  },
  {
    blush: {
      at: [0.45, 0.7],
      strength: [0.12, 0.35],
      tone: { c: [0.06, 0.09], h: [55, 72], l: [0.86, 0.9] },
    },
    body: {
      base: { c: [0.1, 0.14], h: [78, 90], l: [0.9, 0.94] },
      tip: { c: [0.012, 0.028], h: [72, 86], l: [0.955, 0.985] },
    },
    margin: {
      strength: [0.4, 0.7],
      tone: { c: [0.01, 0.03], h: [85, 99], l: [0.95, 0.975] },
    },
    name: "gold",
    throat: {
      flame: [0.55, 0.85],
      rays: [0.2, 0.5],
      reach: [0.5, 0.7],
      tone: { c: [0.16, 0.19], h: [68, 82], l: [0.86, 0.91] },
    },
    veins: {
      strength: [0.12, 0.35],
      tone: { c: [0.11, 0.14], h: [72, 85], l: [0.8, 0.86] },
    },
    weight: 1.5,
  },
  {
    blush: {
      at: [0.75, 0.95],
      strength: [0.18, 0.4],
      tone: { c: [0.07, 0.1], h: [348, 365], l: [0.82, 0.87] },
    },
    body: {
      base: { c: [0.015, 0.03], h: [78, 100], l: [0.935, 0.96] },
      tip: { c: [0.02, 0.05], h: [0, 20], l: [0.92, 0.95] },
    },
    margin: {
      strength: [0.55, 0.85],
      tone: { c: [0.12, 0.17], h: [344, 360], l: [0.66, 0.75] },
    },
    name: "candy stripe",
    throat: {
      flame: [0.3, 0.55],
      rays: [0.1, 0.4],
      reach: [0.62, 0.82],
      tone: { c: [0.15, 0.18], h: [84, 94], l: [0.84, 0.88] },
    },
    veins: {
      strength: [0.08, 0.3],
      tone: { c: [0.06, 0.1], h: [350, 365], l: [0.78, 0.84] },
    },
    weight: 1,
  },
  {
    blush: {
      at: [0.6, 0.85],
      strength: [0.2, 0.45],
      tone: { c: [0.06, 0.1], h: [350, 370], l: [0.8, 0.88] },
    },
    body: {
      base: { c: [0.18, 0.22], h: [12, 26], l: [0.55, 0.66] },
      tip: { c: [0.15, 0.19], h: [8, 20], l: [0.6, 0.72] },
    },
    margin: {
      strength: [0.25, 0.5],
      tone: { c: [0.08, 0.12], h: [355, 372], l: [0.78, 0.86] },
    },
    name: "carmine",
    throat: {
      flame: [0.45, 0.7],
      rays: [0.4, 0.7],
      reach: [0.22, 0.35],
      tone: { c: [0.17, 0.2], h: [40, 55], l: [0.7, 0.76] },
    },
    veins: {
      strength: [0.3, 0.6],
      tone: { c: [0.16, 0.2], h: [10, 24], l: [0.42, 0.52] },
    },
    weight: 1.2,
  },
];

const TOTAL_WEIGHT = CULTIVARS.reduce((sum, c) => sum + c.weight, 0);
const CULTIVARS_BY_NAME = new Map(
  CULTIVARS.map((cultivar) => [cultivar.name, cultivar])
);

function namedCultivar(name: PlumeriaCultivarName): Recipe {
  const cultivar = CULTIVARS_BY_NAME.get(name);
  if (!cultivar) throw new TypeError(`unsupported plumeria cultivar ${name}`);
  return cultivar;
}

function pickCultivar(rng: Rng): Recipe {
  let target = rng() * TOTAL_WEIGHT;

  for (const cultivar of CULTIVARS) {
    target -= cultivar.weight;
    if (target <= 0) return cultivar;
  }

  // The loop is exhaustive because rng() is below one and the weights sum to TOTAL_WEIGHT.
  return CULTIVARS[0];
}

function sampleTone(rng: Rng, span: ToneSpan): Tone {
  return {
    c: between(rng, ...span.c),
    h: between(rng, ...span.h),
    l: between(rng, ...span.l),
  };
}

function samplePalette(rng: Rng, recipe: SampleableRecipe): Palette {
  return {
    blush: {
      at: between(rng, ...recipe.blush.at),
      strength: between(rng, ...recipe.blush.strength),
      tone: sampleTone(rng, recipe.blush.tone),
    },
    body: {
      base: sampleTone(rng, recipe.body.base),
      tip: sampleTone(rng, recipe.body.tip),
    },
    margin: {
      strength: between(rng, ...recipe.margin.strength),
      tone: sampleTone(rng, recipe.margin.tone),
    },
    throat: {
      flame: between(rng, ...recipe.throat.flame),
      rays: between(rng, ...recipe.throat.rays),
      reach: between(rng, ...recipe.throat.reach),
      tone: sampleTone(rng, recipe.throat.tone),
    },
    veins: {
      strength: between(rng, ...recipe.veins.strength),
      tone: sampleTone(rng, recipe.veins.tone),
    },
  };
}

function mixPalette(a: Palette, b: Palette, t: number): Palette {
  return {
    blush: {
      at: lerp(a.blush.at, b.blush.at, t),
      strength: lerp(a.blush.strength, b.blush.strength, t),
      tone: mixTone(a.blush.tone, b.blush.tone, t),
    },
    body: {
      base: mixTone(a.body.base, b.body.base, t),
      tip: mixTone(a.body.tip, b.body.tip, t),
    },
    margin: {
      strength: lerp(a.margin.strength, b.margin.strength, t),
      tone: mixTone(a.margin.tone, b.margin.tone, t),
    },
    throat: {
      flame: lerp(a.throat.flame, b.throat.flame, t),
      rays: lerp(a.throat.rays, b.throat.rays, t),
      reach: lerp(a.throat.reach, b.throat.reach, t),
      tone: mixTone(a.throat.tone, b.throat.tone, t),
    },
    veins: {
      strength: lerp(a.veins.strength, b.veins.strength, t),
      tone: mixTone(a.veins.tone, b.veins.tone, t),
    },
  };
}

// Correlated shifts keep the sampled palette coherent.
function expose(
  palette: Palette,
  sun: number,
  punch: number,
  drift: number
): Palette {
  const tone = (t: Tone, k = 1): Tone => ({
    c: t.c * (1 + (punch - 1) * k),
    h: t.h + drift * k,
    l: Math.min(0.978, Math.max(0.3, t.l + sun * k)),
  });

  return {
    blush: { ...palette.blush, tone: tone(palette.blush.tone) },
    body: { base: tone(palette.body.base), tip: tone(palette.body.tip) },
    margin: { ...palette.margin, tone: tone(palette.margin.tone) },
    // Restrained throat exposure preserves the focal point in pale blooms.
    throat: { ...palette.throat, tone: tone(palette.throat.tone, 0.35) },
    veins: { ...palette.veins, tone: tone(palette.veins.tone) },
  };
}

export function sampleGenome(
  rng: Rng,
  moon = 0,
  custom?: PlumeriaCultivar,
  requestedVariant?: PlumeriaVariant
): Genome {
  if (custom && requestedVariant)
    throw new TypeError("plumeria cultivar and variant are mutually exclusive");
  const variant = requestedVariant
    ? resolvePlumeriaVariant(requestedVariant)
    : undefined;
  const customRecipe = custom ? cultivarRecipe(custom) : null;
  const builtInRecipe = customRecipe
    ? null
    : variant
      ? namedCultivar(variant.parents[0])
      : pickCultivar(rng);
  const recipe = customRecipe ?? builtInRecipe;
  if (!recipe) throw new Error("a plumeria recipe is required");
  const palette = samplePalette(rng, recipe);
  let cultivar = custom?.name ?? builtInRecipe?.name ?? "custom";
  let hybrid = palette;

  if (builtInRecipe && variant?.kind === "hybrid") {
    const mate = namedCultivar(variant.parents[1]);
    const matePalette = samplePalette(rng, mate);
    hybrid = mixPalette(palette, matePalette, between(rng, 0.3, 0.49));
    cultivar = variant.name;
  } else if (builtInRecipe && !variant && rng() < 0.22) {
    const mate = pickCultivar(rng);
    const matePalette = samplePalette(rng, mate);
    const t = between(rng, 0.3, 0.7);
    hybrid = mixPalette(palette, matePalette, t);

    if (mate.name !== builtInRecipe.name) {
      cultivar =
        t < 0.5
          ? `${builtInRecipe.name} × ${mate.name}`
          : `${mate.name} × ${builtInRecipe.name}`;
    }
  }

  const exposed = expose(
    hybrid,
    between(rng, -0.045, 0.045) + 0.035 * moon,
    between(rng, 0.72, 1.12) * (1 - 0.14 * moon),
    between(rng, -6, 6)
  );

  const fullness = customRecipe
    ? between(rng, ...customRecipe.form.fullness)
    : 1 - rng() ** 0.8 * 0.9;

  const form = customRecipe
    ? sampleCustomForm(rng, customRecipe, fullness)
    : {
        bend:
          lerp(0.26, 0.09, fullness) *
          between(rng, 0.8, 1.2) *
          (rng() < 0.5 ? -1 : 1),
        fullness,
        length: between(rng, 172, 212) - 14 * fullness,
        taper: Math.max(
          rng() < 0.22 ? between(rng, 0.4, 0.8) : between(rng, 0, 0.35),
          0.24 * fullness
        ),
      };
  // Form precedes accent in the seed-to-specimen contract.
  const accent = rng() < 0.35 ? intBetween(rng, 0, 4) : -1;

  return {
    ...exposed,
    accent,
    cultivar,
    form,
  };
}

function sampleCustomForm(
  rng: Rng,
  recipe: PlumeriaCultivarRecipe,
  fullness: number
): Genome["form"] {
  return {
    bend: between(rng, ...recipe.form.bend),
    fullness,
    length: between(rng, ...recipe.form.length),
    taper: between(rng, ...recipe.form.taper),
  };
}
