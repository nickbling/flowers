export type Tone = { l: number; c: number; h: number };

type LinearRgb = [number, number, number];

function gammaDecode(channel: number): number {
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

export function fromHex(hex: string): Tone {
  if (!/^#[0-9a-f]{6}$/i.test(hex))
    throw new TypeError("color must be a six-digit hex value");

  const channels = [1, 3, 5].map((start) =>
    gammaDecode(Number.parseInt(hex.slice(start, start + 2), 16) / 255)
  );
  const [r, g, b] = channels;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const labB = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const chroma = Math.hypot(a, labB);

  return {
    c: chroma < 1e-7 ? 0 : chroma,
    h: chroma < 1e-7 ? 0 : ((Math.atan2(labB, a) * 180) / Math.PI + 360) % 360,
    l: lightness,
  };
}

function oklabToLinearSrgb(l: number, a: number, b: number): LinearRgb {
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

function inGamut([r, g, b]: LinearRgb): boolean {
  // Floating-point rounding can place an in-gamut channel just outside [0, 1].
  const eps = 1e-6;
  return (
    r >= -eps &&
    r <= 1 + eps &&
    g >= -eps &&
    g <= 1 + eps &&
    b >= -eps &&
    b <= 1 + eps
  );
}

function gammaEncode(channel: number): number {
  const c = Math.min(1, Math.max(0, channel));
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

function toHexChannel(channel: number): string {
  return Math.round(gammaEncode(channel) * 255)
    .toString(16)
    .padStart(2, "0");
}

export function oklch(lightness: number, chroma: number, hue: number): string {
  if (![lightness, chroma, hue].every(Number.isFinite))
    throw new TypeError("OKLCH channels must be finite");
  const l = Math.min(1, Math.max(0, lightness));
  const hr = (((hue % 360) + 360) % 360) * (Math.PI / 180);
  // Cap pathological inputs without changing the established 0.004 gamut walk.
  let c = Math.min(0.5, Math.max(0, chroma));
  let rgb = oklabToLinearSrgb(l, c * Math.cos(hr), c * Math.sin(hr));

  while (c > 0 && !inGamut(rgb)) {
    c = Math.max(0, c - 0.004);
    rgb = oklabToLinearSrgb(l, c * Math.cos(hr), c * Math.sin(hr));
  }

  return `#${rgb.map(toHexChannel).join("")}`;
}

export function toHex({ l, c, h }: Tone): string {
  return oklch(l, c, h);
}

// Use the shortest hue arc so neutral-to-pink blends do not pass through green.
export function mixTone(a: Tone, b: Tone, t: number): Tone {
  const arc = (((b.h - a.h) % 360) + 540) % 360;
  return {
    c: a.c + (b.c - a.c) * t,
    h: a.h + (arc - 180) * t,
    l: a.l + (b.l - a.l) * t,
  };
}
