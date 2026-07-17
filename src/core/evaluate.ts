import type { Pigment, ScalarField, Tone } from "@/src/core/pigment";
import { type Tone as ColorTone, mixTone } from "@/src/shared/color";

export type FieldSample = Readonly<{
  features?: Readonly<Record<string, number>>;
  flower: Readonly<{ x: number; y: number; z: number }>;
  organ: Readonly<{ x: number; y: number; z: number }>;
  seed: string;
  surface: Readonly<{ u: number; v: number }>;
}>;

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function hash(text: string): number {
  let value = 2_166_136_261;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16_777_619);
  }
  value ^= value >>> 16;
  return (value >>> 0) / 4_294_967_295;
}

function fade(value: number): number {
  return value * value * (3 - 2 * value);
}

function valueNoise(seed: string, x: number, y: number, z: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const tx = fade(x - x0);
  const ty = fade(y - y0);
  const tz = fade(z - z0);
  const at = (dx: number, dy: number, dz: number) =>
    hash(`${seed}/${x0 + dx}/${y0 + dy}/${z0 + dz}`);
  const mix = (from: number, to: number, amount: number) =>
    from + (to - from) * amount;
  const lower = mix(
    mix(at(0, 0, 0), at(1, 0, 0), tx),
    mix(at(0, 1, 0), at(1, 1, 0), tx),
    ty
  );
  const upper = mix(
    mix(at(0, 0, 1), at(1, 0, 1), tx),
    mix(at(0, 1, 1), at(1, 1, 1), tx),
    ty
  );
  return mix(lower, upper, tz);
}

function noise(
  field: Extract<ScalarField, { kind: "noise" }>,
  sample: FieldSample
) {
  const coordinates =
    field.space === "surface"
      ? { x: sample.surface.u, y: sample.surface.v, z: 0 }
      : sample[field.space];
  let amplitude = 1;
  let frequency = field.frequency;
  let sum = 0;
  let weight = 0;
  for (let octave = 0; octave < field.octaves; octave += 1) {
    sum +=
      amplitude *
      valueNoise(
        `${sample.seed}/${field.seedPath}/${octave}`,
        coordinates.x * frequency,
        coordinates.y * frequency,
        coordinates.z * frequency
      );
    weight += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return sum / weight;
}

export function evaluateField(field: ScalarField, sample: FieldSample): number {
  switch (field.kind) {
    case "constant":
      return field.value;
    case "coordinate":
      return field.axis === "u" || field.axis === "v"
        ? sample.surface[field.axis]
        : sample.organ[field.axis];
    case "radial-distance": {
      if (field.space === "surface")
        return Math.hypot(sample.surface.u, sample.surface.v);
      const point = sample[field.space];
      return Math.hypot(point.x, point.y, point.z);
    }
    case "feature-distance": {
      if (!sample.features || !Object.hasOwn(sample.features, field.feature))
        throw new Error(`surface feature ${field.feature} is unavailable`);
      return sample.features[field.feature];
    }
    case "smoothstep": {
      const edge0 = evaluateField(field.edge0, sample);
      const edge1 = evaluateField(field.edge1, sample);
      const input = evaluateField(field.input, sample);
      if (edge0 === edge1) return input < edge0 ? 0 : 1;
      const amount = clamp((input - edge0) / (edge1 - edge0));
      return amount * amount * (3 - 2 * amount);
    }
    case "curve": {
      const input = evaluateField(field.input, sample);
      if (input <= field.points[0][0]) return field.points[0][1];
      const last = field.points[field.points.length - 1];
      if (input >= last[0]) return last[1];
      for (let index = 1; index < field.points.length; index += 1) {
        const from = field.points[index - 1];
        const to = field.points[index];
        if (input <= to[0]) {
          const amount = (input - from[0]) / (to[0] - from[0]);
          return from[1] + (to[1] - from[1]) * amount;
        }
      }
      return last[1];
    }
    case "noise":
      return noise(field, sample);
    case "add":
      return field.inputs.reduce(
        (sum, input) => sum + evaluateField(input, sample),
        0
      );
    case "multiply":
      return field.inputs.reduce(
        (product, input) => product * evaluateField(input, sample),
        1
      );
    case "minimum":
      return Math.min(
        ...field.inputs.map((input) => evaluateField(input, sample))
      );
    case "maximum":
      return Math.max(
        ...field.inputs.map((input) => evaluateField(input, sample))
      );
    case "mix": {
      const amount = evaluateField(field.amount, sample);
      const from = evaluateField(field.from, sample);
      return from + (evaluateField(field.to, sample) - from) * amount;
    }
  }
}

export function evaluateTone(tone: Tone, sample: FieldSample): ColorTone {
  const lightness = evaluateField(tone.lightness, sample);
  const chroma = evaluateField(tone.chroma, sample);
  const hue = evaluateField(tone.hue, sample);
  if (![lightness, chroma, hue].every(Number.isFinite))
    throw new RangeError("evaluated OKLCH channels must be finite");
  return {
    c: Math.max(0, chroma),
    h: hue,
    l: clamp(lightness),
  };
}

function multiplyTone(base: ColorTone, layer: ColorTone): ColorTone {
  return {
    c: Math.max(base.c * layer.l, layer.c * base.l),
    h: layer.c > 1e-6 ? layer.h : base.h,
    l: base.l * layer.l,
  };
}

export function evaluatePigment(
  pigment: Pigment,
  sample: FieldSample
): ColorTone {
  let result = evaluateTone(pigment.base, sample);
  for (const layer of pigment.layers) {
    const amount = clamp(evaluateField(layer.amount, sample));
    const layerTone = evaluateTone(layer.tone, sample);
    result = mixTone(
      result,
      layer.blend === "multiply" ? multiplyTone(result, layerTone) : layerTone,
      amount
    );
  }
  return result;
}
