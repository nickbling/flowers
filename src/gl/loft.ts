import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
} from "three";
import type { Genome } from "@/src/plumeria/genome";
import type { PetalForm } from "@/src/plumeria/petal";
import {
  ivoryTone,
  lightTone,
  throatExtent,
  throatRayExtent,
} from "@/src/plumeria/pigment";
import { mixTone, type Tone, toHex } from "@/src/shared/color";
import { between, type Rng } from "@/src/shared/prng";

export type Relief = {
  crownHeight: number;
  cupRise: number;
  rimHalfThickness: number;
  spoonCurl: number;
};

export type PetalLivery = {
  blush2At: number;
  blush2Mix: number | null;
  blush2Opacity: number;
  blush2Width: number;
  halo: number;
  stripeSide: number;
  stripy: boolean;
};

export function sampleRelief(rng: Rng, fullness: number): Relief {
  return {
    cupRise: between(rng, 0.25, 0.31),
    // Fullness controls both cross-section and the S-bend it must clear.
    crownHeight: 0.24 + 0.14 * fullness,
    spoonCurl: between(rng, 0.45, 0.58) * (1.15 - 0.3 * fullness),
    // Keep shell thickness legible at the silhouette.
    rimHalfThickness: between(rng, 0.28, 0.34),
  };
}

// At maximum overlap, sAlong·slope·avgHW must clear crownHeight·avgHW. A factor of
// two also clears the rim before its √(1−u²) profile reaches zero.
const SLOPE_K = 2.0;

// Smooth normals carry shading; this grid keeps silhouette sagitta sub-pixel
// and follows the shared cubic closely at icon scale.
const T_SEGS = 96;
const U_SEGS = 14;

type Flank = PetalForm["over"];

// The normalized Beta kernel and its logarithmic derivative. The peak
// normalization is a constant, so it cancels in ker'/ker = a/t − b/(1−t).
function ker(t: number, f: Flank): number {
  const peak = f.a / (f.a + f.b);
  return (t ** f.a * (1 - t) ** f.b) / (peak ** f.a * (1 - peak) ** f.b);
}
function ripple(form: PetalForm, flank: Flank, t: number): number {
  const body = ker(t, flank);
  return (
    form.wave *
    Math.sin(5 * Math.PI * t + flank.phase) *
    Math.sin(Math.PI * t) *
    (1 - 0.65 * body * body)
  );
}

// Albedo contains only pigment; the studio supplies all illumination.
export function throatWeight(
  reach: number,
  rays: number,
  t: number,
  v: number,
  r: number
): number {
  const u = Math.abs(v);
  const poolExtent = throatExtent(reach);
  const edge = Math.min(
    1,
    Math.max(0, (r - 0.06 * poolExtent) / (0.94 * poolExtent))
  );
  const pool = 1 - edge * edge * (3 - 2 * edge);
  const extent = throatRayExtent(reach, rays);
  const along = Math.min(1, Math.max(0, t / extent));
  const tongueFade = 1 - along * along * (3 - 2 * along);
  const tongue = tongueFade * Math.max(0, 1 - u * u) ** 0.78;
  return 1 - (1 - pool) * (1 - tongue);
}

function vertexTone(
  genome: Genome,
  livery: PetalLivery,
  t: number,
  v: number,
  r: number
): Tone {
  const u = Math.abs(v);
  const body = mixTone(
    ivoryTone(genome.body.base),
    ivoryTone(genome.body.tip),
    t
  );
  const gold = genome.throat;
  // One flower-space pool crosses petal boundaries without polygonal seams.
  const poolExtent = throatExtent(gold.reach);
  const edge = Math.min(
    1,
    Math.max(0, (r - 0.06 * poolExtent) / (0.94 * poolExtent))
  );
  const pool = 1 - edge * edge * (3 - 2 * edge);
  const throat = throatWeight(gold.reach, gold.rays, t, v, r);
  // The tongue extends pigment along the midrib without enlarging the pool.
  let tone = mixTone(
    body,
    {
      c: gold.tone.c * (1 + 0.15 * pool + 0.25 * pool * pool),
      h: gold.tone.h,
      l: gold.tone.l - 0.05 * pool,
    },
    throat
  );
  const blush = Math.min(
    1,
    0.95 *
      genome.blush.strength *
      Math.exp(-(((t - genome.blush.at) / 0.22) ** 2)) *
      (1 - 0.35 * u * u)
  );
  tone = mixTone(tone, genome.blush.tone, blush);
  if (livery.blush2Mix !== null) {
    const secondary = mixTone(genome.body.tip, gold.tone, livery.blush2Mix);
    const strength =
      livery.blush2Opacity *
      Math.exp(-(((t - livery.blush2At) / livery.blush2Width) ** 2)) *
      Math.max(0, 1 - 0.7 * u * u);
    tone = mixTone(tone, secondary, strength);
  }
  if (livery.halo > 0) {
    const center = Math.min(0.82, 0.92 * gold.reach);
    const band = Math.exp(-(((r - center) / 0.065) ** 2));
    tone = mixTone(
      tone,
      mixTone(gold.tone, genome.margin.tone, 0.55),
      Math.min(0.3, 1.25 * livery.halo * band)
    );
  }
  if (livery.stripy) {
    const stripe =
      Math.exp(-(((v - livery.stripeSide) / 0.16) ** 2)) *
      Math.exp(-(((t - 0.58) / 0.3) ** 2));
    tone = mixTone(
      tone,
      {
        c: genome.margin.tone.c + 0.02,
        h: genome.margin.tone.h,
        l: genome.margin.tone.l - 0.06,
      },
      0.18 * stripe
    );
  }
  // Margin pigment broadens toward the tip while remaining continuous.
  const rim =
    Math.min(1, u ** 2.8 + t ** 14) *
    (0.2 + 0.8 * Math.min(1, Math.max(0, (t - 0.25) / 0.7)));
  // A narrow pale rim separates overlapping petals in both media.
  const separation = Math.min(1, u ** 9 + t ** 22);
  tone = mixTone(tone, { c: 0.012, h: tone.h, l: 0.985 }, 0.42 * separation);
  tone = mixTone(
    tone,
    {
      ...genome.margin.tone,
      l: Math.max(genome.margin.tone.l, tone.l - 0.015),
    },
    Math.min(0.52, 0.8 * genome.margin.strength * rim)
  );
  // Gamut-map pigment before the studio adds physical light.
  return lightTone(tone);
}

function paint(colors: Float32Array, at: number, tone: Tone): void {
  const color = new Color(toHex(tone));
  colors[3 * at] = color.r;
  colors[3 * at + 1] = color.g;
  colors[3 * at + 2] = color.b;
}

export function radialCupProfile(radius: number): number {
  const x = Math.min(1, Math.max(0, radius / 0.78));
  return x * x * (3 - 2 * x);
}

export function petalGeometry(
  form: PetalForm,
  relief: Relief,
  genome: Genome,
  livery: PetalLivery
): BufferGeometry {
  const cols = 2 * U_SEGS + 1;
  const rows = T_SEGS + 1;
  const positions = new Float32Array(2 * rows * cols * 3);
  const colors = new Float32Array(2 * rows * cols * 3);
  const uvs = new Float32Array(2 * rows * cols * 2);
  const thinness = new Float32Array(2 * rows * cols);
  const bellyAt = rows * cols;
  const L = form.length;
  const { crownHeight, cupRise, rimHalfThickness, spoonCurl } = relief;
  const slope = SLOPE_K * crownHeight;

  // Apply the shared portrait alignment once before lofting.
  const cl = Math.cos(-form.lean);
  const sl = Math.sin(-form.lean);
  const rot = (x: number, y: number): [number, number] => [
    x * cl - y * sl,
    x * sl + y * cl,
  ];

  for (const i of Array(rows).keys()) {
    // Half-cosine spacing resolves the base and tip without starving the shoulder.
    const lin = i / T_SEGS;
    const t = 0.5 * lin + 0.5 * ((1 - Math.cos(Math.PI * lin)) / 2);
    // Midrib and its unit normal in the pre-lean frame.
    const [mx, my] = rot(form.bend * L * t * t, -L * t);
    const positionSlope = 2 * form.bend * t;
    const positionLength = Math.hypot(1, positionSlope);
    const [positionNx, positionNy] = rot(
      1 / positionLength,
      positionSlope / positionLength
    );
    // Both flank widths place the lamina and set its shared crown/thickness.
    const gOverP =
      form.over.width * ker(t, form.over) + ripple(form, form.over, t);
    const gUnderP =
      form.under.width * ker(t, form.under) + ripple(form, form.under, t);
    const avgHW = (gOverP + gUnderP) / 2;

    // Retain 35% of the S-bend at the tip so the helical posture remains visible.
    const ts = Math.min(1, t / 0.92);
    const sAlong = 0.35 + 0.65 * (0.5 * (1 + Math.cos(Math.PI * ts)));

    for (const j of Array(cols).keys()) {
      const raw = j / U_SEGS - 1;
      const side = raw < 0 ? -1 : 1;
      // Sine spacing resolves the rounded rim.
      const u = Math.sin((Math.abs(raw) * Math.PI) / 2);
      const v = side * u;
      const gP = side === 1 ? gOverP : gUnderP;

      // Flat lamina point, with SVG's downward y flipped into three's frame.
      const w = v * gP;
      const px = mx + positionNx * w;
      const py = -(my + positionNy * w);

      // The flower-space cup gives overlapping petals equal radial height.
      const q = (px * px + py * py) / (L * L);
      const rho = Math.sqrt(Math.max(0, q));
      const throatPocket = 0.025;
      const radialRise = radialCupProfile(rho);
      const zDome =
        cupRise * L * radialRise - throatPocket * L * (1 - radialRise);
      // crownHeight·avgHW·(1 − v²)
      const crownA = crownHeight * avgHW;
      const zCrown = crownA * (1 - v * v);
      // −sAlong·slope·w
      const zBend = -sAlong * slope * w;

      // Spoon curl turns the middle margins toward the camera.
      const curlAlong = Math.sin(Math.PI * t) ** 2;
      const u2 = u * u;
      const u4 = u2 * u2;
      // The tucked flank rolls farther to preserve the pinwheel overlap.
      const rollWeight = 0.7 - 0.3 * v;
      const zCurl = spoonCurl * avgHW * curlAlong * u4 * rollWeight;

      const zBase = zDome + zCrown + zBend + zCurl;

      // √(1−u²) closes face and belly with a tangent rounded rim.
      const root = Math.sqrt(Math.max(0, 1 - u * u));
      const th = rimHalfThickness * avgHW * root;

      const k = i * cols + j;
      const tone = vertexTone(genome, livery, t, v, Math.hypot(px, py) / L);
      // Translucency follows the thin side wall instead of the petal tip.
      const thin = Math.min(1, 0.55 * (1 - root));

      // Most thickness grows behind the visible face, preserving overlap
      // order while giving the rolled edge and belly real mass.
      for (const [at, shell] of [
        [k, 0.6],
        [bellyAt + k, -1.4],
      ] as const) {
        const z = zBase + shell * th;
        positions[3 * at] = px;
        positions[3 * at + 1] = py;
        positions[3 * at + 2] = z;
        paint(colors, at, tone);
        uvs[2 * at] = (side * u + 1) / 2;
        uvs[2 * at + 1] = t;
        thinness[at] = thin;
      }
    }
  }

  const index: number[] = [];
  for (const i of Array(T_SEGS).keys()) {
    for (const j of Array(cols - 1).keys()) {
      const a = i * cols + j;
      const b = a + cols;
      // Reverse belly winding so both shells face outward.
      index.push(a, a + 1, b, b, a + 1, b + 1);
      const c = bellyAt + a;
      const e = bellyAt + b;
      index.push(c, e, c + 1, e, e + 1, c + 1);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setIndex(index);
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
  geometry.setAttribute("thinness", new BufferAttribute(thinness, 1));
  geometry.computeVertexNormals();

  // Face and belly meet at the same rim positions but use separate indices.
  // Share their averaged normal so the rounded edge lights as one surface.
  const smoothNormals = geometry.getAttribute("normal");
  for (let row = 0; row < rows; row += 1) {
    for (const column of [0, cols - 1]) {
      const face = row * cols + column;
      const belly = bellyAt + face;
      let x = smoothNormals.getX(face) + smoothNormals.getX(belly);
      let y = smoothNormals.getY(face) + smoothNormals.getY(belly);
      let z = smoothNormals.getZ(face) + smoothNormals.getZ(belly);
      let length = Math.hypot(x, y, z);
      if (length < 1e-6) {
        x = smoothNormals.getX(face);
        y = smoothNormals.getY(face);
        z = 0;
        length = Math.hypot(x, y) || 1;
      }
      smoothNormals.setXYZ(face, x / length, y / length, z / length);
      smoothNormals.setXYZ(belly, x / length, y / length, z / length);
    }
  }

  // Each collapsed row is one geometric pole. Continue the adjacent row's
  // surface direction through it instead of forcing an axial highlight.
  for (const row of [0, rows - 1]) {
    const neighbor = row === 0 ? 1 : rows - 2;
    const average = (shellOffset: number) => {
      let x = 0;
      let y = 0;
      let z = 0;
      for (let j = 0; j < cols; j += 1) {
        const at = shellOffset + neighbor * cols + j;
        x += smoothNormals.getX(at);
        y += smoothNormals.getY(at);
        z += smoothNormals.getZ(at);
      }
      const length = Math.hypot(x, y, z) || 1;
      return [x / length, y / length, z / length] as const;
    };
    const faceNormal = average(0);
    const bellyNormal = average(bellyAt);
    for (let j = 0; j < cols; j += 1) {
      const face = row * cols + j;
      smoothNormals.setXYZ(face, ...faceNormal);
      smoothNormals.setXYZ(bellyAt + face, ...bellyNormal);
    }
  }
  smoothNormals.needsUpdate = true;
  return geometry;
}

// Irregular longitudinal grooves form one deterministic relief map per flower.
export function fiberTexture(rng: Rng): DataTexture {
  const S = 256;
  // Fine interrupted striations ride over a weaker broad relief register.
  const spacedOffsets = (count: number, minGap: number, maxGap: number) => {
    const gaps = Array.from({ length: count }, () =>
      between(rng, minGap, maxGap)
    );
    const total = gaps.reduce((sum, gap) => sum + gap, 0);
    let cursor = 0;
    return gaps.map((gap) => {
      cursor += gap / 2;
      const offset = cursor / total - 0.5;
      cursor += gap / 2;
      return offset;
    });
  };
  const fineCount = 72;
  const fine = spacedOffsets(fineCount, 0.32, 1.9).map((offset) => ({
    offset: offset + between(rng, -0.1, 0.1) / fineCount,
    width: between(rng, 0.58, 1.55),
    depth: between(rng, 0.055, 0.145),
    meander: between(rng, 0.6, 2.7),
    freq: between(rng, 0.5, 1.65),
    phase: between(rng, 0, 2 * Math.PI),
    start: between(rng, 0, 0.3),
    end: between(rng, 0.68, 1),
    breatheFreq: between(rng, 0.5, 1.8),
    breathePhase: between(rng, 0, 2 * Math.PI),
  }));
  const broad = spacedOffsets(14, 0.5, 1.7).map((offset) => ({
    offset,
    width: between(rng, 3.2, 7.5),
    depth: between(rng, 0.035, 0.08),
    meander: between(rng, 1.5, 5),
    freq: between(rng, 0.25, 0.85),
    phase: between(rng, 0, 2 * Math.PI),
    start: between(rng, 0, 0.18),
    end: between(rng, 0.82, 1),
    breatheFreq: between(rng, 0.35, 0.9),
    breathePhase: between(rng, 0, 2 * Math.PI),
  }));
  const fibers = [...broad, ...fine];
  const data = new Uint8Array(S * S * 4);
  const row = new Float32Array(S);
  for (let y = 0; y < S; y += 1) {
    const v = y / (S - 1);
    const fade =
      Math.min(1, Math.max(0, (v - 0.035) / 0.13)) *
      Math.min(1, Math.max(0, (0.995 - v) / 0.06));
    const spread = 0.62 + 0.38 * v;
    row.fill(0);
    for (const f of fibers) {
      if (v < f.start || v > f.end) continue;
      const span = (v - f.start) / (f.end - f.start);
      const ends = Math.min(1, 6 * span * (1 - span));
      const breathe =
        0.78 +
        0.22 * Math.sin(2 * Math.PI * v * f.breatheFreq + f.breathePhase);
      const depth = f.depth * ends * breathe;
      if (depth < 0.004) continue;
      const cx =
        S * (0.5 + f.offset * spread) +
        f.meander * Math.sin(2 * Math.PI * v * f.freq + f.phase);
      const lo = Math.max(0, Math.floor(cx - 3 * f.width));
      const hi = Math.min(S - 1, Math.ceil(cx + 3 * f.width));
      for (let x = lo; x <= hi; x += 1) {
        row[x] += depth * Math.exp(-(((x - cx) / f.width) ** 2));
      }
    }
    for (let x = 0; x < S; x += 1) {
      const dip = row[x] * fade;
      const value = Math.round(255 * Math.min(1, Math.max(0, 1 - dip)));
      const at = 4 * (y * S + x);
      data[at] = value;
      data[at + 1] = value;
      data[at + 2] = value;
      data[at + 3] = 255;
    }
  }

  const texture = new DataTexture(data, S, S);
  texture.generateMipmaps = true;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.needsUpdate = true;
  return texture;
}
