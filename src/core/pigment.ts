import { cloneJson, deepFreeze, type JsonValue } from "@/src/core/json";
import { type Tone as ColorTone, fromHex } from "@/src/shared/color";

export type ScalarField =
  | Readonly<{ kind: "constant"; value: number }>
  | Readonly<{ axis: "u" | "v" | "x" | "y" | "z"; kind: "coordinate" }>
  | Readonly<{ kind: "radial-distance"; space: "flower" | "organ" | "surface" }>
  | Readonly<{ feature: string; kind: "feature-distance" }>
  | Readonly<{
      edge0: ScalarField;
      edge1: ScalarField;
      input: ScalarField;
      kind: "smoothstep";
    }>
  | Readonly<{
      input: ScalarField;
      kind: "curve";
      points: readonly (readonly [input: number, output: number])[];
    }>
  | Readonly<{
      frequency: number;
      kind: "noise";
      octaves: number;
      seedPath: string;
      space: "flower" | "organ" | "surface";
    }>
  | Readonly<{
      inputs: readonly ScalarField[];
      kind: "add" | "maximum" | "minimum" | "multiply";
    }>
  | Readonly<{
      amount: ScalarField;
      from: ScalarField;
      kind: "mix";
      to: ScalarField;
    }>;

export type Tone = Readonly<{
  chroma: ScalarField;
  hue: ScalarField;
  kind: "oklch";
  lightness: ScalarField;
}>;

export type PigmentLayer = Readonly<{
  amount: ScalarField;
  blend: "mix" | "multiply";
  id: string;
  tone: Tone;
}>;

export type Pigment = Readonly<{
  base: Tone;
  layers: readonly PigmentLayer[];
}>;

export type ScalarInput = number | ScalarField;
export type ToneInput = `#${string}` | ColorTone | Tone;

function immutableCopy<T>(value: T): T {
  return deepFreeze(cloneJson(value as unknown as JsonValue)) as T;
}

function toneFields(value: Tone): readonly ScalarField[] {
  return [value.lightness, value.chroma, value.hue];
}

export function fieldUsesSpace(
  field: ScalarField,
  space: "flower" | "organ" | "surface"
): boolean {
  if (field.kind === "radial-distance" || field.kind === "noise")
    return field.space === space;
  if (field.kind === "coordinate")
    return space === "surface"
      ? field.axis === "u" || field.axis === "v"
      : space === "organ" &&
          (field.axis === "x" || field.axis === "y" || field.axis === "z");
  if (field.kind === "feature-distance") return space === "surface";
  if (field.kind === "smoothstep")
    return (
      fieldUsesSpace(field.edge0, space) ||
      fieldUsesSpace(field.edge1, space) ||
      fieldUsesSpace(field.input, space)
    );
  if (field.kind === "curve") return fieldUsesSpace(field.input, space);
  if (field.kind === "mix")
    return (
      fieldUsesSpace(field.from, space) ||
      fieldUsesSpace(field.to, space) ||
      fieldUsesSpace(field.amount, space)
    );
  if (
    field.kind === "add" ||
    field.kind === "multiply" ||
    field.kind === "minimum" ||
    field.kind === "maximum"
  )
    return field.inputs.some((input) => fieldUsesSpace(input, space));
  return false;
}

export function pigmentUsesSpace(
  pigment: Pigment,
  space: "flower" | "organ" | "surface"
): boolean {
  return [
    ...toneFields(pigment.base),
    ...pigment.layers.flatMap((layer) => [
      layer.amount,
      ...toneFields(layer.tone),
    ]),
  ].some((field) => fieldUsesSpace(field, space));
}

function collectFieldFeatures(field: ScalarField, features: Set<string>): void {
  if (field.kind === "feature-distance") {
    features.add(field.feature);
    return;
  }
  if (field.kind === "smoothstep") {
    collectFieldFeatures(field.edge0, features);
    collectFieldFeatures(field.edge1, features);
    collectFieldFeatures(field.input, features);
    return;
  }
  if (field.kind === "curve") {
    collectFieldFeatures(field.input, features);
    return;
  }
  if (field.kind === "mix") {
    collectFieldFeatures(field.from, features);
    collectFieldFeatures(field.to, features);
    collectFieldFeatures(field.amount, features);
    return;
  }
  if (
    field.kind === "add" ||
    field.kind === "multiply" ||
    field.kind === "minimum" ||
    field.kind === "maximum"
  )
    for (const input of field.inputs) collectFieldFeatures(input, features);
}

export function pigmentFeatures(pigment: Pigment): ReadonlySet<string> {
  const features = new Set<string>();
  for (const field of [
    ...toneFields(pigment.base),
    ...pigment.layers.flatMap((layer) => [
      layer.amount,
      ...toneFields(layer.tone),
    ]),
  ])
    collectFieldFeatures(field, features);
  return features;
}

function finite(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}

function oneOf<const Value extends string>(
  value: string,
  allowed: readonly Value[],
  name: string
): Value {
  if (!allowed.includes(value as Value))
    throw new TypeError(`${name} must be ${allowed.join(", ")}`);
  return value as Value;
}

function validateField(
  value: unknown,
  path: string,
  ancestors = new WeakSet<object>()
): asserts value is ScalarField {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`${path} must be a scalar field`);
  if (ancestors.has(value)) throw new TypeError(`${path} must not be circular`);
  ancestors.add(value);
  try {
    const definition = value as Record<string, unknown>;
    const kind = definition.kind;
    if (typeof kind !== "string")
      throw new TypeError(`${path}.kind must identify a scalar field`);
    if (kind === "constant") {
      if (typeof definition.value !== "number")
        throw new TypeError(`${path}.value must be a number`);
      finite(definition.value, `${path}.value`);
      return;
    }
    if (kind === "coordinate") {
      if (typeof definition.axis !== "string")
        throw new TypeError(`${path}.axis must identify a coordinate`);
      oneOf(definition.axis, ["u", "v", "x", "y", "z"], `${path}.axis`);
      return;
    }
    if (kind === "radial-distance") {
      if (typeof definition.space !== "string")
        throw new TypeError(`${path}.space must identify a coordinate space`);
      oneOf(definition.space, ["flower", "organ", "surface"], `${path}.space`);
      return;
    }
    if (kind === "feature-distance") {
      if (typeof definition.feature !== "string" || !definition.feature.trim())
        throw new TypeError(`${path}.feature must not be empty`);
      return;
    }
    if (kind === "smoothstep") {
      validateField(definition.edge0, `${path}.edge0`, ancestors);
      validateField(definition.edge1, `${path}.edge1`, ancestors);
      validateField(definition.input, `${path}.input`, ancestors);
      return;
    }
    if (kind === "curve") {
      validateField(definition.input, `${path}.input`, ancestors);
      if (!Array.isArray(definition.points) || definition.points.length < 2)
        throw new RangeError(`${path}.points needs at least two points`);
      let previous = Number.NEGATIVE_INFINITY;
      for (const [index, point] of definition.points.entries()) {
        if (
          !Array.isArray(point) ||
          point.length !== 2 ||
          point.some((coordinate) =>
            typeof coordinate === "number" ? !Number.isFinite(coordinate) : true
          )
        )
          throw new TypeError(
            `${path}.points[${index}] must contain two finite numbers`
          );
        if (point[0] <= previous)
          throw new RangeError(
            `${path}.points inputs must be strictly increasing`
          );
        previous = point[0];
      }
      return;
    }
    if (kind === "noise") {
      if (typeof definition.frequency !== "number")
        throw new TypeError(`${path}.frequency must be a number`);
      if (!(definition.frequency > 0) || !Number.isFinite(definition.frequency))
        throw new RangeError(`${path}.frequency must be finite and positive`);
      if (
        !Number.isSafeInteger(definition.octaves) ||
        Number(definition.octaves) < 1 ||
        Number(definition.octaves) > 8
      )
        throw new RangeError(`${path}.octaves must be an integer from 1 to 8`);
      if (
        typeof definition.seedPath !== "string" ||
        !definition.seedPath.trim()
      )
        throw new TypeError(`${path}.seedPath must not be empty`);
      if (typeof definition.space !== "string")
        throw new TypeError(`${path}.space must identify a coordinate space`);
      oneOf(definition.space, ["flower", "organ", "surface"], `${path}.space`);
      return;
    }
    if (["add", "maximum", "minimum", "multiply"].includes(kind)) {
      if (!Array.isArray(definition.inputs) || definition.inputs.length === 0)
        throw new RangeError(`${path}.${kind} needs at least one input`);
      definition.inputs.forEach((input, index) => {
        validateField(input, `${path}.inputs[${index}]`, ancestors);
      });
      return;
    }
    if (kind === "mix") {
      validateField(definition.from, `${path}.from`, ancestors);
      validateField(definition.to, `${path}.to`, ancestors);
      validateField(definition.amount, `${path}.amount`, ancestors);
      return;
    }
    throw new TypeError(`${path}.kind ${kind} is not supported`);
  } finally {
    ancestors.delete(value);
  }
}

const scalar = (value: ScalarInput): ScalarField => {
  if (typeof value === "number")
    return Object.freeze({
      kind: "constant",
      value: finite(value, "field value"),
    });
  validateField(value, "field");
  return immutableCopy(value);
};

function operation(
  kind: "add" | "maximum" | "minimum" | "multiply",
  inputs: readonly ScalarInput[]
): ScalarField {
  if (inputs.length === 0)
    throw new RangeError(`${kind} needs at least one input`);
  return deepFreeze({
    inputs: inputs.map(scalar),
    kind,
  });
}

function smoothstepField(
  edge0: ScalarInput,
  edge1: ScalarInput,
  input: ScalarField
): ScalarField {
  return deepFreeze({
    edge0: scalar(edge0),
    edge1: scalar(edge1),
    input: scalar(input),
    kind: "smoothstep",
  });
}

function invertField(input: ScalarInput): ScalarField {
  return operation("add", [1, operation("multiply", [-1, input])]);
}

export const field = Object.freeze({
  constant(value: number): ScalarField {
    return Object.freeze({
      kind: "constant",
      value: finite(value, "field value"),
    });
  },
  coordinate(axis: "u" | "v" | "x" | "y" | "z"): ScalarField {
    oneOf(axis, ["u", "v", "x", "y", "z"], "coordinate axis");
    return Object.freeze({ axis, kind: "coordinate" });
  },
  radial(space: "flower" | "organ" | "surface" = "surface"): ScalarField {
    oneOf(space, ["flower", "organ", "surface"], "radial space");
    return Object.freeze({ kind: "radial-distance", space });
  },
  feature(name: string): ScalarField {
    if (!name.trim()) throw new TypeError("feature name must not be empty");
    return Object.freeze({ feature: name, kind: "feature-distance" });
  },
  smoothstep(
    edge0: ScalarInput,
    edge1: ScalarInput,
    input: ScalarField
  ): ScalarField {
    return smoothstepField(edge0, edge1, input);
  },
  invert(input: ScalarInput): ScalarField {
    return invertField(input);
  },
  falloff(
    edge0: ScalarInput,
    edge1: ScalarInput,
    input: ScalarField
  ): ScalarField {
    return invertField(smoothstepField(edge0, edge1, input));
  },
  band(
    input: ScalarField,
    riseFrom: ScalarInput,
    riseTo: ScalarInput,
    fallFrom: ScalarInput,
    fallTo: ScalarInput
  ): ScalarField {
    return operation("multiply", [
      smoothstepField(riseFrom, riseTo, input),
      invertField(smoothstepField(fallFrom, fallTo, input)),
    ]);
  },
  curve(
    input: ScalarField,
    points: readonly (readonly [number, number])[]
  ): ScalarField {
    if (points.length < 2)
      throw new RangeError("curve needs at least two points");
    points.forEach(([pointInput, pointOutput], index) => {
      finite(pointInput, `curve input ${index}`);
      finite(pointOutput, `curve output ${index}`);
      if (index > 0 && pointInput <= points[index - 1][0])
        throw new RangeError("curve inputs must be strictly increasing");
    });
    return deepFreeze({
      input: scalar(input),
      kind: "curve",
      points: points.map(([pointInput, pointOutput]) => [
        pointInput,
        pointOutput,
      ]),
    });
  },
  noise(
    seedPath: string,
    options: Readonly<{
      frequency?: number;
      octaves?: number;
      space?: "flower" | "organ" | "surface";
    }> = {}
  ): ScalarField {
    if (!seedPath.trim())
      throw new TypeError("noise seedPath must not be empty");
    const frequency = options.frequency ?? 1;
    const octaves = options.octaves ?? 3;
    if (!(frequency > 0) || !Number.isFinite(frequency))
      throw new RangeError("noise frequency must be finite and positive");
    if (!Number.isSafeInteger(octaves) || octaves < 1 || octaves > 8)
      throw new RangeError("noise octaves must be an integer from 1 to 8");
    const space = options.space ?? "surface";
    oneOf(space, ["flower", "organ", "surface"], "noise space");
    return deepFreeze({
      frequency,
      kind: "noise",
      octaves,
      seedPath,
      space,
    });
  },
  add(...inputs: readonly ScalarInput[]): ScalarField {
    return operation("add", inputs);
  },
  multiply(...inputs: readonly ScalarInput[]): ScalarField {
    return operation("multiply", inputs);
  },
  minimum(...inputs: readonly ScalarInput[]): ScalarField {
    return operation("minimum", inputs);
  },
  maximum(...inputs: readonly ScalarInput[]): ScalarField {
    return operation("maximum", inputs);
  },
  mix(from: ScalarInput, to: ScalarInput, amount: ScalarInput): ScalarField {
    return deepFreeze({
      amount: scalar(amount),
      from: scalar(from),
      kind: "mix",
      to: scalar(to),
    });
  },
});

export function tone(input: ToneInput): Tone {
  if (typeof input === "object" && "kind" in input) {
    if (input.kind !== "oklch") throw new TypeError("tone kind must be oklch");
    return deepFreeze({
      chroma: scalar(input.chroma),
      hue: scalar(input.hue),
      kind: "oklch",
      lightness: scalar(input.lightness),
    });
  }
  const color = typeof input === "string" ? fromHex(input) : input;
  finite(color.l, "tone lightness");
  finite(color.c, "tone chroma");
  finite(color.h, "tone hue");
  return deepFreeze({
    chroma: scalar(color.c),
    hue: scalar(color.h),
    kind: "oklch",
    lightness: scalar(color.l),
  });
}

export const pigment = Object.freeze({
  solid(color: ToneInput): Pigment {
    return deepFreeze({ base: tone(color), layers: [] });
  },
  layered(
    base: ToneInput,
    layers: readonly Readonly<{
      amount: ScalarInput;
      blend?: "mix" | "multiply";
      color: ToneInput;
      id: string;
    }>[]
  ): Pigment {
    const ids = new Set<string>();
    for (const layer of layers) {
      if (!layer.id.trim())
        throw new TypeError("pigment layer id must not be empty");
      if (ids.has(layer.id))
        throw new Error(`duplicate pigment layer id ${layer.id}`);
      if (layer.blend !== undefined)
        oneOf(layer.blend, ["mix", "multiply"], "pigment layer blend");
      ids.add(layer.id);
    }
    return deepFreeze({
      base: tone(base),
      layers: layers.map((layer) =>
        Object.freeze({
          amount: scalar(layer.amount),
          blend: layer.blend ?? "mix",
          id: layer.id,
          tone: tone(layer.color),
        })
      ),
    });
  },
});
