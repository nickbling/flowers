import { BufferAttribute, BufferGeometry, Color } from "three";
import type { Genome } from "@/src/plumeria/genome";
import { laminaPoint, midrib, type PetalForm } from "@/src/plumeria/petal";
import { evaluatePlumeriaPigment, lightTone } from "@/src/plumeria/pigment";
import type { PlumeriaLivery } from "@/src/plumeria/specimen";
import { type Tone, toHex } from "@/src/shared/color";
import { between, type Rng } from "@/src/shared/prng";

export type Relief = {
  crownHeight: number;
  cupRise: number;
  overlapSlope: number;
  rimHalfThickness: number;
  spoonCurl: number;
};

export function sampleRelief(rng: Rng, fullness: number): Relief {
  const crownHeight = 0.12 + 0.06 * fullness;
  const rimHalfThickness = between(rng, 0.045, 0.065);
  const spoonCurl = between(rng, 0.08, 0.13) * (1.1 - 0.2 * fullness);
  return {
    crownHeight,
    cupRise: between(rng, 0.1, 0.14),
    overlapSlope: crownHeight + spoonCurl + 2 * rimHalfThickness,
    rimHalfThickness,
    spoonCurl,
  };
}

const T_SEGS = 96;
const U_SEGS = 14;

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
  livery: PlumeriaLivery
): BufferGeometry {
  const cols = 2 * U_SEGS + 1;
  const rows = T_SEGS + 1;
  const positions = new Float32Array(2 * rows * cols * 3);
  const colors = new Float32Array(2 * rows * cols * 3);
  const uvs = new Float32Array(2 * rows * cols * 2);
  const thinness = new Float32Array(2 * rows * cols);
  const bellyAt = rows * cols;
  const L = form.length;
  const { crownHeight, cupRise, overlapSlope, rimHalfThickness, spoonCurl } =
    relief;

  for (const i of Array(rows).keys()) {
    const linearProgress = i / T_SEGS;
    const t =
      0.5 * linearProgress +
      0.5 * ((1 - Math.cos(Math.PI * linearProgress)) / 2);
    const [midribX, midribY] = midrib(form, t);
    const [overX, overY] = laminaPoint(form, 1, t, 1);
    const [underX, underY] = laminaPoint(form, -1, t, 1);
    const overWidth = Math.hypot(overX - midribX, overY - midribY);
    const underWidth = Math.hypot(underX - midribX, underY - midribY);
    const averageWidth = (overWidth + underWidth) / 2;
    const bendProgress = Math.min(1, t / 0.92);
    const bendEnvelope =
      0.35 + 0.65 * (0.5 * (1 + Math.cos(Math.PI * bendProgress)));

    for (const j of Array(cols).keys()) {
      const raw = j / U_SEGS - 1;
      const side = raw < 0 ? -1 : 1;
      const u = Math.sin((Math.abs(raw) * Math.PI) / 2);
      const v = side * u;
      const width = side === 1 ? overWidth : underWidth;
      const [px, svgY] = laminaPoint(form, side, t, u);
      const py = -svgY;
      const w = v * width;

      // The flower-space cup gives overlapping petals equal radial height.
      const q = (px * px + py * py) / (L * L);
      const rho = Math.sqrt(Math.max(0, q));
      const throatPocket = 0.025;
      const radialRise = radialCupProfile(rho);
      const zDome =
        cupRise * L * radialRise - throatPocket * L * (1 - radialRise);
      // crownHeight·avgHW·(1 − v²)
      const zCrown = crownHeight * averageWidth * (1 - v * v);
      const zBend = -bendEnvelope * overlapSlope * w;
      const curlAlong = Math.sin(Math.PI * t) ** 2;
      const u2 = u * u;
      const u4 = u2 * u2;
      const rollWeight = 0.7 - 0.3 * v;
      const zCurl = spoonCurl * averageWidth * curlAlong * u4 * rollWeight;

      const zBase = zDome + zCrown + zBend + zCurl;

      // √(1−u²) closes face and belly with a tangent rounded rim.
      const root = Math.sqrt(Math.max(0, 1 - u * u));
      const th = rimHalfThickness * averageWidth * root;

      const k = i * cols + j;
      const tone = lightTone(
        evaluatePlumeriaPigment(genome, livery, t, v, Math.hypot(px, py) / L)
      );
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
