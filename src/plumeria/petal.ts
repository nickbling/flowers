// A petal starts at the origin, points toward −y and follows x = bend·L·t².
// Beta-kernel flanks offset its midrib; unequal `over` and `under` flanks
// produce the shared pinwheel overlap.

import type { Genome } from "@/src/plumeria/genome";
import { between, type Rng } from "@/src/shared/prng";

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

type Flank = { a: number; b: number; phase: number; width: number };

export type PetalForm = {
  bend: number;
  // Counter-rotation that aligns the asymmetric silhouette to portrait-up.
  lean: number;
  length: number;
  over: Flank;
  under: Flank;
  wave: number;
};

export function petalForm(form: Genome["form"], rng: Rng): PetalForm {
  const length = form.length * between(rng, 0.95, 1.05);
  const flank = (a: number, b: number, width: number): Flank => ({
    a: a * between(rng, 0.92, 1.08),
    b: b * between(rng, 0.92, 1.08),
    phase: between(rng, 0, Math.PI * 2),
    width: length * width * between(rng, 0.96, 1.04),
  });

  const raw: PetalForm = {
    bend: form.bend * between(rng, 0.85, 1.15),
    lean: 0,
    length,
    over: flank(
      0.9,
      lerp(0.5, 0.92, form.taper),
      lerp(0.3, 0.48, form.fullness)
    ),
    under: flank(
      1.15,
      lerp(0.54, 0.98, form.taper),
      lerp(0.21, 0.39, form.fullness)
    ),
    wave: between(rng, 0.9, 1.7),
  };

  raw.lean = corollaLean(raw);
  return raw;
}

// Normalize the Beta kernel at its closed-form maximum t* = a/(a+b).
function kernel(t: number, { a, b }: Flank): number {
  const peak = a / (a + b);
  return (t ** a * (1 - t) ** b) / (peak ** a * (1 - peak) ** b);
}

function aligned(f: PetalForm, x: number, y: number): [number, number] {
  const cos = Math.cos(-f.lean);
  const sin = Math.sin(-f.lean);
  return [x * cos - y * sin, x * sin + y * cos];
}

export function midrib(f: PetalForm, t: number): [number, number] {
  return aligned(f, f.bend * f.length * t * t, -f.length * t);
}

function normal(f: PetalForm, t: number): [number, number] {
  const slope = 2 * f.bend * t;
  const len = Math.hypot(1, slope);
  return aligned(f, 1 / len, slope / len);
}

// Dampen the 2.5-wave margin ripple at the silhouette-defining shoulder.
function ripple(f: PetalForm, flank: Flank, t: number): number {
  return (
    f.wave *
    Math.sin(t * 5 * Math.PI + flank.phase) *
    Math.sin(Math.PI * t) *
    (1 - 0.65 * kernel(t, flank) ** 2)
  );
}

// Lamina half-width combines the Beta body and margin ripple.
function flankOffset(f: PetalForm, flank: Flank, t: number): number {
  return flank.width * kernel(t, flank) + ripple(f, flank, t);
}

function flankPoint(
  f: PetalForm,
  flank: Flank,
  side: 1 | -1,
  t: number,
  inset = 0
): [number, number] {
  const [mx, my] = midrib(f, t);
  const [nx, ny] = normal(f, t);
  const w = side * (flankOffset(f, flank, t) - inset);
  return [mx + nx * w, my + ny * w];
}

// `u` spans the local half-width from midrib (0) to outline (1).
export function laminaPoint(
  f: PetalForm,
  side: 1 | -1,
  t: number,
  u: number
): [number, number] {
  const flank = side === 1 ? f.over : f.under;
  const [mx, my] = midrib(f, t);
  const [nx, ny] = normal(f, t);
  const w = side * u * flankOffset(f, flank, t);
  return [mx + nx * w, my + ny * w];
}

export function laminaBand(
  f: PetalForm,
  side: 1 | -1,
  inner: number,
  outer: number,
  from = 0.08,
  to = 0.94,
  samples = 18
): string {
  const edge = (u: number, reverse: boolean) =>
    Array.from({ length: samples + 1 }, (_, index) => {
      const step = reverse ? samples - index : index;
      const phase = (1 - Math.cos((Math.PI * step) / samples)) / 2;
      return laminaPoint(f, side, from + (to - from) * phase, u);
    });
  return [...edge(outer, false), ...edge(inner, true)]
    .map(([x, y], index) => `${index === 0 ? "M" : "L"} ${fmt(x)} ${fmt(y)}`)
    .join(" ")
    .concat(" Z");
}

function fmt(value: number): number {
  return Math.round(value * 10) / 10;
}

function closedPath(points: [number, number][]): string {
  const n = points.length;
  const at = (i: number) => points[((i % n) + n) % n];
  let d = `M ${fmt(points[0][0])} ${fmt(points[0][1])}`;

  for (const [i] of points.entries()) {
    const [p0x, p0y] = at(i - 1);
    const [p1x, p1y] = at(i);
    const [p2x, p2y] = at(i + 1);
    const [p3x, p3y] = at(i + 2);

    d += ` C ${fmt(p1x + (p2x - p0x) / 6)} ${fmt(p1y + (p2y - p0y) / 6)} ${fmt(p2x - (p3x - p1x) / 6)} ${fmt(p2y - (p3y - p1y) / 6)} ${fmt(p2x)} ${fmt(p2y)}`;
  }

  return `${d} Z`;
}

export function petalOutline(f: PetalForm, samples = 20): string {
  const points: [number, number][] = [];

  // Cosine spacing resolves the high-curvature base and tip.
  const ease = (i: number) => (1 - Math.cos((Math.PI * i) / samples)) / 2;

  for (let i = 0; i <= samples; i += 1) {
    points.push(flankPoint(f, f.over, 1, ease(i)));
  }
  for (let i = samples - 1; i >= 1; i -= 1) {
    points.push(flankPoint(f, f.under, -1, ease(i)));
  }

  return closedPath(points);
}

// A five-petal silhouette is star-shaped around the hub. Its fifth complex
// area moment has phase ∫eⁱ⁵θR(θ)⁷dθ: the exact orientation of the visible
// five-fold mass. Aligning that phase to -π/2 puts a lobe at twelve o'clock
// without trusting either the curved tip or the asymmetric petal centroid.
export function corollaLean(f: PetalForm): number {
  const bins = 3600;
  const reach = new Float64Array(bins);
  const cast = ([x, y]: [number, number]) => {
    const angle = Math.atan2(y, x);
    const bin = Math.round(((angle + Math.PI) / (2 * Math.PI)) * bins) % bins;
    reach[bin] = Math.max(reach[bin], Math.hypot(x, y));
  };

  for (let i = 0; i <= bins; i += 1) {
    const t = (1 - Math.cos((Math.PI * i) / bins)) / 2;
    cast(laminaPoint(f, 1, t, 1));
    cast(laminaPoint(f, -1, t, 1));
  }

  let real = 0;
  let imaginary = 0;
  const step = bins / 5;
  for (let bin = 0; bin < bins; bin += 1) {
    let radius = 0;
    for (let petal = 0; petal < 5; petal += 1)
      radius = Math.max(radius, reach[(bin + petal * step) % bins]);
    const angle = -Math.PI + ((bin + 0.5) * 2 * Math.PI) / bins;
    const weight = radius ** 7;
    real += weight * Math.cos(5 * angle);
    imaginary += weight * Math.sin(5 * angle);
  }

  const lean = (Math.atan2(imaginary, real) + Math.PI / 2) / 5;
  const period = (2 * Math.PI) / 5;
  return ((lean + period / 2) % period) - period / 2;
}

export type CorollaFrame = {
  centerX: number;
  centerY: number;
  scale: number;
};

// Fit the complete five-petal silhouette once for both renderers.
export function corollaFrame(
  f: PetalForm,
  viewport = 480,
  padding = 18
): CorollaFrame {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  const measure = (x: number, y: number) => {
    for (let k = 0; k < 5; k += 1) {
      const angle = (k * 2 * Math.PI) / 5;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const rx = x * cos - y * sin;
      const ry = x * sin + y * cos;
      minX = Math.min(minX, rx);
      minY = Math.min(minY, ry);
      maxX = Math.max(maxX, rx);
      maxY = Math.max(maxY, ry);
    }
  };

  for (let i = 0; i <= 180; i += 1) {
    const t = (1 - Math.cos((Math.PI * i) / 180)) / 2;
    measure(...laminaPoint(f, 1, t, 1));
    measure(...laminaPoint(f, -1, t, 1));
  }

  return {
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    scale: (viewport - 2 * padding) / Math.max(maxX - minX, maxY - minY),
  };
}

// x = bend·L·t², y = −L·t is a quadratic Bézier with control (0, −L/2).
export function midribPath(f: PetalForm): string {
  const [cx, cy] = aligned(f, 0, -f.length / 2);
  const [ex, ey] = aligned(f, f.bend * f.length, -f.length);
  return `M 0 0 Q ${fmt(cx)} ${fmt(cy)} ${fmt(ex)} ${fmt(ey)}`;
}

// Build the nonparallel margin as a ring between the outline and a varying inset.
export function marginBand(f: PetalForm, rng: Rng, strength: number): string {
  const from = 0.3;
  const steps = 14;
  const depth = f.length * (0.045 + 0.075 * strength);
  const raw = Array.from({ length: steps + 1 }, () => between(rng, 0.45, 1.55));
  // Neighbor averaging keeps the inset continuous.
  const wander = raw.map(
    (v, i) => (v + raw[Math.max(0, i - 1)] + raw[Math.min(steps, i + 1)]) / 3
  );

  const outer: [number, number][] = [];
  const inner: [number, number][] = [];

  for (const [flank, side] of [
    [f.under, -1],
    [f.over, 1],
  ] as const) {
    for (let i = 0; i <= steps; i += 1) {
      const k = side === -1 ? i : steps - i;
      const t = from + ((1 - from) * k) / steps;
      const head = Math.min(1, (t - from) / (0.96 - from)) ** 1.6;

      outer.push(flankPoint(f, flank, side, t));
      inner.push(flankPoint(f, flank, side, t, depth * head * wander[k]));
    }
  }

  const ring = [...outer, ...inner.reverse()];
  return `${ring
    .map(([x, y], i) => `${i === 0 ? "M" : "L"} ${fmt(x)} ${fmt(y)}`)
    .join(" ")} Z`;
}

// A narrow margin roll projects the GL flank without becoming a painted lobe.
export function curlBand(f: PetalForm): string {
  const steps = 18;
  const outer: [number, number][] = [];
  const inner: [number, number][] = [];

  for (let i = 0; i <= steps; i += 1) {
    const t = (1 - Math.cos((Math.PI * i) / steps)) / 2;
    outer.push(laminaPoint(f, -1, t, 1));
    inner.push(laminaPoint(f, -1, t, 0.88 - 0.04 * Math.sin(Math.PI * t) ** 2));
  }

  return `${[...outer, ...inner.reverse()]
    .map(([x, y], i) => `${i === 0 ? "M" : "L"} ${fmt(x)} ${fmt(y)}`)
    .join(" ")} Z`;
}

// Each vein is a quadratic from the lower midrib toward one flank.
export function veinsPath(
  f: PetalForm,
  rng: Rng,
  perFlank: number,
  reach: number,
  spread: number
): string {
  const parts: string[] = [];

  for (const side of [1, -1] as const) {
    const flank = side === 1 ? f.over : f.under;

    for (let k = 1; k <= perFlank; k += 1) {
      const tEnd = Math.min(0.9, reach * between(rng, 0.78, 1.06));
      const frac = (spread * (k - between(rng, 0, 0.35))) / (perFlank + 0.5);

      const vein = (t: number): [number, number] => {
        const [mx, my] = midrib(f, t);
        const [nx, ny] = normal(f, t);
        const w =
          side *
          flank.width *
          kernel(t, flank) *
          frac ** 0.85 *
          (t / tEnd) ** 0.6;
        return [mx + nx * w, my + ny * w];
      };

      const [sx, sy] = vein(0.05);
      const [mx, my] = vein(tEnd * 0.55);
      const [ex, ey] = vein(tEnd);

      parts.push(
        `M ${fmt(sx)} ${fmt(sy)} Q ${fmt(2 * mx - (sx + ex) / 2)} ${fmt(2 * my - (sy + ey) / 2)} ${fmt(ex)} ${fmt(ey)}`
      );
    }
  }

  return parts.join(" ");
}
