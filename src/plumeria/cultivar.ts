import { fromHex, type Tone } from "@/src/shared/color";

export type PlumeriaRange =
  | number
  | readonly [minimum: number, maximum: number];

export type PlumeriaColor =
  | `#${string}`
  | readonly [from: `#${string}`, to: `#${string}`];

export type PlumeriaCultivarDefinition = {
  name: string;
  body: {
    base: PlumeriaColor;
    tip?: PlumeriaColor;
  };
  throat: {
    color: PlumeriaColor;
    reach?: PlumeriaRange;
    flame?: PlumeriaRange;
    rays?: PlumeriaRange;
  };
  margin?: {
    color: PlumeriaColor;
    strength?: PlumeriaRange;
  };
  blush?: {
    color: PlumeriaColor;
    at?: PlumeriaRange;
    strength?: PlumeriaRange;
  };
  veins?: {
    color: PlumeriaColor;
    strength?: PlumeriaRange;
  };
  form?: {
    fullness?: PlumeriaRange;
    bend?: PlumeriaRange;
    length?: PlumeriaRange;
    taper?: PlumeriaRange;
  };
};

export type PlumeriaSpan = readonly [from: number, to: number];

export type PlumeriaToneSpan = Readonly<{
  c: PlumeriaSpan;
  h: PlumeriaSpan;
  l: PlumeriaSpan;
}>;

export type PlumeriaCultivarRecipe = Readonly<{
  blush: Readonly<{
    at: PlumeriaSpan;
    strength: PlumeriaSpan;
    tone: PlumeriaToneSpan;
  }>;
  body: Readonly<{
    base: PlumeriaToneSpan;
    tip: PlumeriaToneSpan;
  }>;
  form: Readonly<{
    bend: PlumeriaSpan;
    fullness: PlumeriaSpan;
    length: PlumeriaSpan;
    taper: PlumeriaSpan;
  }>;
  margin: Readonly<{
    strength: PlumeriaSpan;
    tone: PlumeriaToneSpan;
  }>;
  throat: Readonly<{
    flame: PlumeriaSpan;
    rays: PlumeriaSpan;
    reach: PlumeriaSpan;
    tone: PlumeriaToneSpan;
  }>;
  veins: Readonly<{
    strength: PlumeriaSpan;
    tone: PlumeriaToneSpan;
  }>;
}>;

export type PlumeriaCultivar = Readonly<{
  kind: "plumeria-cultivar";
  version: 1;
  name: string;
  recipe: PlumeriaCultivarRecipe;
}>;

const DEFAULTS = {
  blushAt: [0.7, 0.85],
  bend: [-0.2, 0.2],
  flame: [0.55, 0.8],
  fullness: [0.35, 0.8],
  length: [172, 212],
  rays: [0.1, 0.35],
  reach: [0.45, 0.6],
  taper: [0, 0.35],
} as const;

function span(
  value: PlumeriaRange,
  name: string,
  minimum: number,
  maximum: number
): PlumeriaSpan {
  const result = typeof value === "number" ? [value, value] : value;
  if (
    result.length !== 2 ||
    !Number.isFinite(result[0]) ||
    !Number.isFinite(result[1]) ||
    result[0] < minimum ||
    result[1] > maximum ||
    result[0] > result[1]
  ) {
    throw new RangeError(
      `${name} must be an ordered range from ${minimum} to ${maximum}`
    );
  }
  return [result[0], result[1]];
}

function colorSpan(value: PlumeriaColor, name: string): PlumeriaToneSpan {
  const colors = typeof value === "string" ? [value, value] : value;
  if (colors.length !== 2)
    throw new TypeError(`${name} must contain one color or two endpoints`);

  let from: Tone;
  let to: Tone;
  try {
    from = fromHex(colors[0]);
    to = fromHex(colors[1]);
  } catch {
    throw new TypeError(`${name} must use six-digit hex colors`);
  }

  const hueArc = ((((to.h - from.h) % 360) + 540) % 360) - 180;

  return {
    c: [from.c, to.c],
    h: [from.h, from.h + hueArc],
    l: [from.l, to.l],
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Defines a deterministic cultivar that both SVG and GL can grow. */
export function definePlumeriaCultivar(
  definition: PlumeriaCultivarDefinition
): PlumeriaCultivar {
  const name = definition.name.trim();
  if (!name) throw new TypeError("name must not be empty");

  const bodyBase = colorSpan(definition.body.base, "body.base");
  const bodyTip = definition.body.tip
    ? colorSpan(definition.body.tip, "body.tip")
    : bodyBase;
  const throat = colorSpan(definition.throat.color, "throat.color");
  const margin = definition.margin
    ? colorSpan(definition.margin.color, "margin.color")
    : bodyTip;
  const blush = definition.blush
    ? colorSpan(definition.blush.color, "blush.color")
    : bodyBase;
  const veins = definition.veins
    ? colorSpan(definition.veins.color, "veins.color")
    : throat;

  return deepFreeze({
    kind: "plumeria-cultivar",
    name,
    recipe: {
      blush: {
        at: span(definition.blush?.at ?? DEFAULTS.blushAt, "blush.at", 0, 1),
        strength: span(definition.blush?.strength ?? 0, "blush.strength", 0, 1),
        tone: blush,
      },
      body: { base: bodyBase, tip: bodyTip },
      form: {
        bend: span(
          definition.form?.bend ?? DEFAULTS.bend,
          "form.bend",
          -0.5,
          0.5
        ),
        fullness: span(
          definition.form?.fullness ?? DEFAULTS.fullness,
          "form.fullness",
          0,
          1
        ),
        length: span(
          definition.form?.length ?? DEFAULTS.length,
          "form.length",
          100,
          240
        ),
        taper: span(
          definition.form?.taper ?? DEFAULTS.taper,
          "form.taper",
          0,
          1
        ),
      },
      margin: {
        strength: span(
          definition.margin?.strength ?? 0,
          "margin.strength",
          0,
          1
        ),
        tone: margin,
      },
      throat: {
        flame: span(
          definition.throat.flame ?? DEFAULTS.flame,
          "throat.flame",
          0,
          1
        ),
        rays: span(
          definition.throat.rays ?? DEFAULTS.rays,
          "throat.rays",
          0,
          1
        ),
        reach: span(
          definition.throat.reach ?? DEFAULTS.reach,
          "throat.reach",
          0,
          1
        ),
        tone: throat,
      },
      veins: {
        strength: span(definition.veins?.strength ?? 0, "veins.strength", 0, 1),
        tone: veins,
      },
    },
    version: 1,
  });
}

export function cultivarRecipe(
  cultivar: PlumeriaCultivar
): PlumeriaCultivarRecipe {
  if (cultivar.kind !== "plumeria-cultivar" || cultivar.version !== 1)
    throw new TypeError("unsupported plumeria cultivar");
  return cultivar.recipe;
}
