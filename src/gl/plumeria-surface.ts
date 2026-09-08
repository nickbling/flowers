import { plumeriaHalfDepth, smootherstep } from "@/src/gl/plumeria-shell";
import { laminaPoint, midrib, type PetalForm } from "@/src/plumeria/petal";
import { between, type Rng } from "@/src/shared/prng";

export type Vec3 = readonly [number, number, number];
export type Relief = Readonly<{
  crownHeight: number;
  cupRise: number;
  rimHalfThickness: number;
  spoonCurl: number;
}>;

export function sampleRelief(rng: Rng, fullness: number): Relief {
  return {
    crownHeight: 0.17 + 0.08 * fullness,
    cupRise: between(rng, 0.08, 0.11),
    rimHalfThickness: between(rng, 0.035, 0.05),
    spoonCurl: between(rng, 0.035, 0.055) * (1.1 - 0.2 * fullness),
  };
}

// C3 profile transitions leave the differentiated meridian normal C2.
function transition(value: number): number {
  const x = Math.min(1, Math.max(0, value));
  return x ** 4 * (35 + x * (-84 + x * (70 - 20 * x)));
}

function slope(value: number): number {
  const x = Math.min(1, Math.max(0, value));
  return 140 * x ** 3 * (1 - x) ** 3;
}

function mix(a: number, b: number, weight: number): number {
  return a + (b - a) * weight;
}

/** One complete petal chart, from its own basal strip (t=0) to its tip (t=1).
 * The meridian is a coordinate system, never a tube/cup mesh. Each ribbon has
 * its own angular interval and depth: neighboring rotations overlap without
 * sharing a rim, fusing their edges, or changing topology at the opening.
 */
export function preparePlumeriaPetal(
  form: PetalForm,
  relief: Relief,
  development = 1
) {
  const length = form.length;
  const stage = smootherstep(development);
  const growth = stage + 0.4 * stage * (1 - stage);
  const scale = 0.82 + 0.18 * stage;
  const meridian = (v: number, opened: number) => {
    const s = v * v;
    const bend = form.bend * s;
    // Begin as a genuinely narrow strip; widening starts in the lower run,
    // rather than keeping a constant shaft followed by an abrupt flare.
    const root = 0.011 + 0.03 * transition(v / 0.5);
    const rootSlope = 0.06 * slope(v / 0.5);
    const canonical = s * Math.hypot(1, bend);
    const canonicalSlope =
      (2 * v * (1 + 2 * bend * bend)) / Math.hypot(1, bend);
    const release = transition((v - 0.25) / 0.4);
    const openRadius = mix(root, canonical, release);
    const openSlope =
      mix(rootSlope, canonicalSlope, release) +
      ((canonical - root) * slope((v - 0.25) / 0.4)) / 0.4;
    const untapered = mix(
      0.011 + 0.05 * Math.sin(Math.PI * v),
      openRadius,
      opened
    );
    const untaperedSlope = mix(
      0.05 * Math.PI * Math.cos(Math.PI * v),
      openSlope,
      opened
    );
    // All five complete ribbons meet at their basal tips. The C3 taper closes
    // the lower outlet with petal tissue, not a separate cap or support mesh.
    const remaining = Math.max(0, 1 - v / 0.18);
    const taper = 1 - remaining ** 4;
    const radius = untapered * taper;
    const dr = untaperedSlope * taper + (untapered * 4 * remaining ** 3) / 0.18;
    const arch = relief.cupRise + 0.1 * relief.crownHeight;
    const tip = transition((v - 0.8) / 0.2);
    const openZ =
      -0.72 * (1 - v) ** 2 +
      arch * Math.sin(Math.PI * s) ** 2 +
      relief.spoonCurl * tip;
    const openDz =
      1.44 * (1 - v) +
      2 * Math.PI * arch * v * Math.sin(2 * Math.PI * s) +
      (relief.spoonCurl * slope((v - 0.8) / 0.2)) / 0.2;
    const z = mix(-0.72 + 1.05 * v, openZ, opened);
    const dz = mix(1.05, openDz, opened);
    const speed = Math.hypot(dr, dz);
    const angle =
      Math.PI / 2 +
      form.lean -
      Math.atan(bend) -
      0.32 * (1 - transition((v - 0.2) / 0.43));
    const pitch =
      radius *
      mix(0.32, Math.tan((9 * Math.PI) / 180), transition((v - 0.3) / 0.3)) *
      (1 - transition((v - 0.85) / 0.15));
    return { angle, radius, z, nr: -dz / speed, nz: dr / speed, pitch };
  };

  return (t: number) => {
    const along = t * t;
    const opening = growth * smootherstep((t - 0.25) / 0.43);
    const base = meridian(t, growth);
    const [mx, my] = midrib(form, along);
    const low = laminaPoint(form, -1, along, 1);
    const high = laminaPoint(form, 1, along, 1);
    const canonicalWidth =
      (Math.hypot(low[0] - mx, low[1] - my) +
        Math.hypot(high[0] - mx, high[1] - my)) /
      2;
    // Close the wrapped tip linearly, without collapsing whole rows of skin.
    const tip = Math.max(0, 1 - (1 - t) / 0.07);
    const halfAngle =
      (0.88 + 0.27 * (1 - smootherstep((t - 0.12) / 0.13))) * (1 - tip ** 4);
    const halfWidth = mix(
      length * base.radius * halfAngle,
      canonicalWidth,
      opening
    );
    const point = (u: number): Vec3 => {
      const edge = u < 0 ? low : high;
      const x = mix(mx, edge[0], Math.abs(u));
      const y = -mix(my, edge[1], Math.abs(u));
      const targetAngle = Math.atan2(y, x);
      let matureV = t;
      if (opening > 0) {
        const radius = Math.hypot(x, y) / length;
        // Inverse normal coordinates retain canonical blade x/y. One bounded
        // scalar solve, not per-seed geometry corrections or a second surface.
        // The asymmetric outline can extend beyond the midrib tip. Past v=1,
        // pitch is zero and radius >= v², so this bound always brackets it.
        let lower = 0,
          upper = Math.max(1, Math.sqrt(radius));
        for (let iteration = 0; iteration < 32; iteration += 1) {
          const v = (lower + upper) / 2;
          const m = meridian(v, 1);
          const r = m.radius + m.nr * m.pitch * (m.angle - targetAngle);
          if (r < radius) lower = v;
          else upper = v;
        }
        matureV = (lower + upper) / 2;
      }
      const v = mix(t, matureV, opening);
      const m = meridian(v, growth);
      const theta = mix(m.angle - halfAngle * u, targetAngle, opening);
      const layer = m.pitch * (m.angle - theta);
      const radius = length * (m.radius + m.nr * layer);
      return [
        radius * Math.cos(theta),
        radius * Math.sin(theta),
        length * (m.z + m.nz * layer),
      ];
    };
    const depthAt = (u: number) => {
      const rim = Math.sqrt(Math.max(0, 1 - u * u));
      const basal = 0.3 * relief.rimHalfThickness * halfWidth * rim;
      const blade = plumeriaHalfDepth(
        along,
        u,
        halfWidth,
        relief.rimHalfThickness
      );
      return (
        Math.sqrt(Math.max(0, Math.sin(Math.PI * t))) *
        mix(basal, blade, opening)
      );
    };
    return {
      along,
      t,
      opening,
      halfWidth,
      depthAt,
      point,
      scale,
      center: point(0),
      normal: [
        base.nr * Math.cos(base.angle),
        base.nr * Math.sin(base.angle),
        base.nz,
      ] as Vec3,
    };
  };
}
