// A plumeria is five petals overlapping like a pinwheel, a cycle no
// painter's order can close. The first four overlaps come for free from
// draw order; the last one is the first petal redrawn clipped inside the
// last, with a contact shadow under every covering edge so petals separate
// without a single drawn outline. Color works in layers, all clipped to
// the petal: an OKLCH-sampled body ramp, anisotropic grain, a throat in two
// registers (a steady shared core plus a flame ellipse per petal, so the
// gold reads as a star) torn by turbulence displacement, a warm glow rising
// from the hub, radial iris fibers woven twice from one set of defs, vein
// fans, a blush, a margin tint that frays into the petal, a cool tip shade
// over a warm subsurface glow where the lamina thins, a satin sheen, one key
// light cast as a per-petal gradient for volume, a cool vignette where the
// dome turns away, and a waxy rim (dark adds a cool counter-rim so the
// shadow side holds off the black). The grade is baked into every color and
// the shadows split cool while highlights stay warm. An opt-in cast
// shadow can seat the corolla on light surfaces. Themes re-tone the
// structure; ids embed the theme so a light and a dark flower share one
// document.

import { mixTone, type Tone, toHex } from "../shared/color";
import { fullMoon } from "../shared/moon";
import { between, createRng, intBetween } from "../shared/prng";
import { type Bloom, bloom as makeBloom, still } from "./bloom";
import { sampleGenome } from "./genome";
import {
  marginBand,
  midrib,
  midribPath,
  petalForm,
  petalOutline,
  veinsPath,
} from "./petal";

export type Theme = "light" | "dark";

export type PlumeriaOptions = {
  seed: string;
  /** ISO day (YYYY-MM-DD); the full moon of that day pales the bloom */
  date?: string;
  /**
   * true labels the petals with the animation hooks the exported BLOOM_CSS
   * drives; the SVG itself stays still. The default is the settled flower.
   */
  bloom?: boolean;
  /** true rests the flower on a soft ground glow; the default is bare */
  glow?: boolean;
  /**
   * true seats the flower on a cast shadow (light theme only). Off by
   * default: the shadow touches the surface outside the silhouette, and the
   * library does not assume the surface - same restraint as glow and bloom.
   */
  shadow?: boolean;
  theme?: Theme;
  size?: number;
};

const VIEWBOX = 480;
const CENTER = VIEWBOX / 2;
const PETALS = 5;
const PETAL_STEP = 360 / PETALS;
// Screen light falls from the top left; a petal pointing at -45° in
// rotate-space faces it
const LIGHT_AT = -45;

function fmt(value: number): number {
  return Math.round(value * 100) / 100;
}

function stop(offset: number, color: string, opacity?: number): string {
  return `<stop offset="${fmt(offset)}" stop-color="${color}"${opacity === undefined ? "" : ` stop-opacity="${fmt(opacity)}"`}/>`;
}

// The final grade, baked into every color at generation time instead of a
// whole-flower filter: the same saturate → linear contrast → gamma chain the
// SVG filter ran, applied per color in sRGB. WebKit rasterizes SVG filters in
// software and renders this chain visibly paler than Chromium; baking makes
// the two engines match and drops the costliest filter.
function bakeGrade(hex: string, slope: number, intercept: number): string {
  const sat = 1.15;
  const [r, g, b] = [1, 3, 5].map(
    (i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255
  );
  // encodes a value already in sRGB space: color.ts's toHexChannel would
  // gamma-encode a second time
  const channel = (v: number) => {
    const lifted = Math.min(1, Math.max(0, v * slope + intercept));
    return Math.round(lifted ** 0.9 * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${[
    (0.213 + 0.787 * sat) * r + 0.715 * (1 - sat) * g + 0.072 * (1 - sat) * b,
    0.213 * (1 - sat) * r + (0.715 + 0.285 * sat) * g + 0.072 * (1 - sat) * b,
    0.213 * (1 - sat) * r + 0.715 * (1 - sat) * g + (0.072 + 0.928 * sat) * b,
  ]
    .map(channel)
    .join("")}`;
}

// The cultivar a seed will grow, without rendering it. Draws the same rng
// prefix as plumeria(), so keep the two in step.
export function cultivar({ seed }: Pick<PlumeriaOptions, "seed">): string {
  const rng = createRng(seed);
  rng();
  return sampleGenome(rng).cultivar;
}

export function plumeria({
  seed,
  date,
  bloom = false,
  glow = false,
  shadow = false,
  theme = "light",
  size = VIEWBOX,
}: PlumeriaOptions): string {
  const rng = createRng(seed);
  // The theme is part of the id: two flowers of the same seed can share one
  // document, and SVG resolves url(#...) against the whole of it, so
  // colliding ids would paint both from one palette.
  const uid = `${theme === "dark" ? "d" : "l"}${Math.floor(rng() * 1e9).toString(36)}`;
  const genome = sampleGenome(rng, date ? fullMoon(date) : 0);
  const { blush, margin, throat, veins } = genome;
  const L = genome.form.length;

  // On light paper a pure white body has no contrast left to read with: cap
  // the body tones to a warm ivory (a floor of chroma, a ceiling of
  // lightness), so even the whitest cultivar keeps a step of OKLCH lightness
  // between petal and paper. The rim and the glows derive from these tones
  // afterward, so they stay a register brighter than the lamina they sit on.
  const ivory = (t: Tone): Tone =>
    theme === "light"
      ? { c: Math.max(t.c, 0.033), h: t.h, l: Math.min(t.l, 0.945) }
      : t;
  const body = {
    base: ivory(genome.body.base),
    tip: ivory(genome.body.tip),
  };

  // Vibrance, not brightness: chroma rides toward the gamut edge (the
  // additive term lifts pale tones proportionally hardest, the multiplier
  // pushes the saturated ones and gamut mapping walks any overshoot back).
  // On dark, lightness eases down so the bloom burns with color against the
  // black. On light the body stays luminous, since anything darker than its
  // own bright paper reads as standing in shade; the rim and the heart (and
  // the opt-in cast shadow) push harder on this theme to hold the reading.
  const themed = (t: Tone): Tone =>
    theme === "dark"
      ? { c: t.c * 1.38 + 0.048, h: t.h, l: t.l * 0.97 }
      : { c: t.c * 1.62 + 0.05, h: t.h, l: t.l * 0.982 };
  // Split-toning: every shade register slides toward the cool side while the
  // highlights stay warm, the complementary push a film grade would make.
  const cool = (t: Tone): Tone => ({ c: t.c + 0.012, h: t.h - 24, l: t.l });
  // hexRaw skips the grade: the tube, the eye and the ground sat outside the
  // graded group and keep their ungraded tones.
  const hexRaw = (t: Tone): string => toHex(themed(t));
  const hex = (t: Tone): string => bake(hexRaw(t));

  // A five-pointed star reaches L upward but only cos(36°)·L ≈ 0.81·L down:
  // centering the hub leaves the flower sitting high in the box. Center the
  // visual mass instead.
  const CY = CENTER + 0.0955 * L;

  const id = (key: string) => `${uid}${key}`;
  const url = (key: string) => `url(#${id(key)})`;
  const href = (key: string) => `href="#${id(key)}"`;

  const flameMix = (t: number) => mixTone(throat.tone, body.base, t);
  const rayTone: Tone = {
    c: throat.tone.c + 0.01,
    h: throat.tone.h - 12,
    l: throat.tone.l - 0.1,
  };
  const creaseTone: Tone = cool({
    c: body.base.c + 0.02,
    h: body.base.h,
    l: body.base.l - 0.14,
  });
  // Contact AO is chromatic on light: a crevice between petals is dense
  // color, never grey - a grey shade is what reads as a spent flower.
  const shadowTone: Tone =
    theme === "light"
      ? cool({ c: 0.14, h: body.base.h, l: 0.3 })
      : cool({ c: 0.045, h: body.base.h, l: 0.3 });
  // Waxy petals catch light along their rim, the thin bright line that
  // separates overlapping petals without drawing an outline
  const rimTone = mixTone(body.tip, { c: 0.005, h: body.tip.h, l: 0.99 }, 0.7);
  const eyeTone: Tone = {
    c: throat.tone.c * 0.9,
    h: throat.tone.h - 25,
    l: 0.42,
  };
  // How pale the petal body is, 0..1: pale cultivars (white, yellow, light
  // pink) take a lighter contact shadow and lean on the ivory floor to
  // separate on paper; saturated bodies keep the full contact shadow their
  // overlaps need. Broad enough to catch the light pinks, not only whites.
  const pale = Math.max(0, Math.min(1, (body.base.l - 0.8) / 0.14));
  // The grade lifts highlights for pop, but a pale petal is already near
  // white, so a full lift blows it into the paper and the lit (top-left)
  // petals vanish. Soften the curve toward pale bodies; saturated ones keep
  // the full contrast. Pivot held near 0.43 so shadows still deepen.
  const gradeSlope = 1.2 - 0.15 * pale;
  const gradeIntercept = -0.43 * (gradeSlope - 1);
  const bake = (raw: string): string =>
    bakeGrade(raw, gradeSlope, gradeIntercept);
  // Pale over pale paper needs only a whisper of cast shadow at the
  // overlaps, or the petal beneath reads as a heavy crease. On dark the
  // contact shadow is the petals' one boundary and must stay full, or pale
  // petals merge on black.
  const shadowOpacity = theme === "dark" ? 0.34 : 0.49 * (1 - 0.42 * pale);
  const rimOpacity = theme === "dark" ? 0.32 : 0.6;
  // the amber pool at the hub pushes harder on light, where paper eats glow
  const golaBoost = theme === "dark" ? 1 : 1.35;
  // A white petal's far end is not warm-grey but cool-white-in-shadow: a
  // faint blue-grey deepening toward the tip pulls the pale lamina off the
  // warm paper and reads as pure white turning away, not a yellow-green cast.
  const tipCool: Tone = { c: 0.012, h: 248, l: body.tip.l - 0.08 };
  const tipShadeOp = pale * (theme === "dark" ? 0.15 : 0.14);
  // The luminous throat: a warm near-white glow pooled at the hub, bleeding a
  // little way up each petal, so the heart reads lit from within.
  // Amber light, not milk: the hub's glow stays close to the throat's own
  // gold, so the heart reads lit by color, never veiled by white haze
  const golaGlow = hex(
    mixTone(throat.tone, { c: 0.02, h: throat.tone.h, l: 0.98 }, 0.3)
  );
  // Low frequency + strong scale tears the throat gradient into long
  // tongues of color instead of a fine shimmer
  const baseFrequency = Math.round(between(rng, 0.008, 0.014) * 1e4) / 1e4;
  const flowSeed = intBetween(rng, 1, 999999);
  // Extra liveries, all tones derived from the genome so combinations stay
  // in the family: a picotee halo where the throat ends, rare lengthwise
  // stripes, a second harmonic blush, gilded iris beams
  const halo = rng() < 0.4 ? between(rng, 0.12, 0.22) : 0;
  const haloTone = mixTone(throat.tone, margin.tone, 0.55);
  const stripy = rng() < 0.18;
  const blush2 =
    rng() < 0.45
      ? mixTone(body.tip, throat.tone, between(rng, 0.3, 0.7))
      : null;
  const beamTone =
    rng() < 0.5
      ? "#fff"
      : hex(mixTone(throat.tone, { c: 0.02, h: throat.tone.h, l: 0.97 }, 0.45));

  // The soft ground the flower rests on, opt-in via `glow`: a warm shade on
  // paper, a faint throat-colored glow on dark. The default is bare, since a
  // library should not impose the surface its flower lands on.
  const ground = glow
    ? {
        hex:
          theme === "dark"
            ? hexRaw(throat.tone)
            : toHex(mixTone(body.base, { c: 0.05, h: 55, l: 0.25 }, 0.8)),
        peak: theme === "dark" ? 0.06 : 0.085,
      }
    : null;

  const defs: string[] = [
    `<linearGradient id="${id("ramp")}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${fmt(-L)}">${[0, 0.3, 0.55, 0.78, 1].map((t) => stop(t, hex(mixTone(body.base, body.tip, t)))).join("")}</linearGradient>`,
    // Two-layer throat: a steady core the displacement never touches, and a
    // wider flame whose torn edge does the dancing
    `<radialGradient id="${id("core")}" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="${fmt(throat.reach * L * 0.5)}">${stop(0, hex(throat.tone), 1)}${stop(0.5, hex(throat.tone), 0.95)}${stop(0.8, hex(flameMix(0.15)), 0.45)}${stop(0.94, hex(flameMix(0.22)), 0.12)}${stop(1, hex(flameMix(0.25)), 0)}</radialGradient>`,
    `<radialGradient id="${id("flame")}">${stop(0, hex(throat.tone), 1)}${stop(0.5, hex(flameMix(0.08)), 1)}${stop(0.72, hex(flameMix(0.28)), 0.6)}${stop(0.9, hex(flameMix(0.5)), 0.25)}${stop(1, hex(flameMix(0.65)), 0)}</radialGradient>`,
    `<radialGradient id="${id("hub")}" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="${fmt(0.44 * L)}">${stop(0, "#000")}${stop(0.4, "#3a3a3a")}${stop(0.62, "#888")}${stop(0.82, "#ccc")}${stop(0.93, "#f2f2f2")}${stop(1, "#fff")}</radialGradient>`,
    `<linearGradient id="${id("crease")}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${fmt(-L)}">${stop(0, hex(creaseTone), 0.5)}${stop(0.6, hex(creaseTone), 0)}</linearGradient>`,
    `<linearGradient id="${id("veinfade")}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${fmt(-L)}">${stop(0, hex(veins.tone), 0.9)}${stop(0.5, hex(veins.tone), 0.6)}${stop(0.8, hex(veins.tone), 0)}</linearGradient>`,
    `<linearGradient id="${id("rayfade")}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${fmt(-L)}">${stop(0, hex(rayTone), 0.95)}${stop(0.55, hex(rayTone), 0.55)}${stop(0.85, hex(rayTone), 0)}</linearGradient>`,
    `<radialGradient id="${id("blush")}">${stop(0, hex(blush.tone), 0.8)}${stop(0.6, hex(blush.tone), 0.35)}${stop(1, hex(blush.tone), 0)}</radialGradient>`,
    `<radialGradient id="${id("tube")}" gradientUnits="userSpaceOnUse" cx="${CENTER}" cy="${fmt(CY)}" r="${fmt(0.1 * L)}">${stop(0, hexRaw({ c: throat.tone.c + 0.04, h: throat.tone.h, l: throat.tone.l - 0.16 }), 1)}${stop(0.35, hexRaw({ c: throat.tone.c + 0.02, h: throat.tone.h, l: throat.tone.l - 0.08 }), 0.7)}${stop(0.6, hexRaw(throat.tone), 0.35)}${stop(0.85, hexRaw(throat.tone), 0.1)}${stop(1, hexRaw(throat.tone), 0)}</radialGradient>`,
    ground
      ? `<radialGradient id="${id("ambient")}">${stop(0, ground.hex, ground.peak)}${stop(0.7, ground.hex, ground.peak * 0.66)}${stop(1, ground.hex, 0)}</radialGradient>`
      : "",
    // Contact shadows fade out near the hub: in a real corolla the center
    // glows, it never sits in its own shade
    `<mask id="${id("hubmask")}" maskUnits="userSpaceOnUse" x="${fmt(-1.1 * L)}" y="${fmt(-1.1 * L)}" width="${fmt(2.2 * L)}" height="${fmt(2.2 * L)}"><rect x="${fmt(-1.1 * L)}" y="${fmt(-1.1 * L)}" width="${fmt(2.2 * L)}" height="${fmt(2.2 * L)}" fill="${url("hub")}"/></mask>`,
    `<filter id="${id("soft")}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.8"/></filter>`,
    `<filter id="${id("near")}" x="-25%" y="-25%" width="150%" height="150%"><feGaussianBlur stdDeviation="2.5"/></filter>`,
    `<filter id="${id("fine")}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1"/></filter>`,
    `<filter id="${id("contact")}" x="-25%" y="-25%" width="150%" height="150%"><feGaussianBlur stdDeviation="6"/></filter>`,
    (() => {
      // The warm half of the split-tone: satin highlights lean gold
      const w = toHex({ c: 0.02, h: 85, l: 0.985 });
      return `<radialGradient id="${id("sheen")}">${stop(0, w, 0.66)}${stop(0.42, w, 0.3)}${stop(0.76, w, 0.08)}${stop(1, w, 0)}</radialGradient>`;
    })(),
    // Cool tip shade, pooling toward the petal end (whites only via opacity)
    `<linearGradient id="${id("tipshade")}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${fmt(-L)}">${stop(0, bake(toHex(tipCool)), 0)}${stop(0.5, bake(toHex(tipCool)), 0)}${stop(0.82, bake(toHex(tipCool)), tipShadeOp * 0.5)}${stop(1, bake(toHex(tipCool)), tipShadeOp)}</linearGradient>`,
    // A petal's tip is thin enough to transmit light: a saturated warm glow
    // pooling at the very end, the subsurface translucency of real petals.
    (() => {
      const t = mixTone(body.tip, throat.tone, 0.4);
      const s = hex({ c: t.c * 1.5, h: t.h, l: Math.min(0.93, t.l + 0.03) });
      return `<linearGradient id="${id("sss")}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${fmt(-L)}">${stop(0.7, s, 0)}${stop(0.88, s, 0.18)}${stop(1, s, 0.4)}</linearGradient>`;
    })(),
    // A cool vignette on the outer reach of the corolla: ambient occlusion
    // where the dome turns away, so the flower reads round, not flat
    (() => {
      const v = toHex(cool({ c: 0.03, h: body.base.h, l: 0.25 }));
      return `<radialGradient id="${id("vig")}" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="${fmt(1.06 * L)}">${stop(0, v, 0)}${stop(0.72, v, 0)}${stop(1, v, theme === "dark" ? 0.16 : 0.03)}</radialGradient>`;
    })(),
    // Luminous throat: warm near-white glow from the hub, fading up the petal
    `<radialGradient id="${id("gola")}" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="${fmt(0.55 * L)}">${stop(0, golaGlow, (0.42 + 0.1 * pale) * golaBoost)}${stop(0.42, golaGlow, (0.2 + 0.05 * pale) * golaBoost)}${stop(0.72, golaGlow, 0.05 * golaBoost)}${stop(1, golaGlow, 0)}</radialGradient>`,
    // The iris-fiber field flows under a displacement far gentler than the
    // flame's tear, so fine strokes survive it
    `<filter id="${id("flow")}" x="-15%" y="-15%" width="130%" height="130%"><feTurbulence type="fractalNoise" baseFrequency="0.012 0.02" numOctaves="2" seed="${flowSeed}"/><feDisplacementMap in="SourceGraphic" scale="12"/></filter>`,
    `<filter id="${id("grain")}" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.09 0.004" numOctaves="2" seed="${intBetween(rng, 1, 999999)}"/><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.16 0 0 0 -0.03"/><feComposite in2="SourceGraphic" operator="in"/></filter>`,
  ];

  // Real contact shade is a crisp line opening into penumbra, so every
  // covering petal casts twice: tight and wide
  const castShadow = (key: string, rotation: number): string =>
    `<use ${href(key)} transform="rotate(${fmt(rotation)})" fill="${hex(shadowTone)}" opacity="${fmt(shadowOpacity * 0.85)}" filter="${url("contact")}"/>` +
    `<use ${href(key)} transform="rotate(${fmt(rotation)})" fill="${hex(shadowTone)}" opacity="${fmt(shadowOpacity * 0.6)}" filter="${url("near")}"/>`;

  const anim: Bloom = bloom ? makeBloom(CENTER, CY, PETALS) : still;

  // The iris detail draws from its own rng stream, forked off the seed, so
  // adding or tuning it never shifts the draws the rest of the flower makes.
  const irng = createRng(`${seed}|iris`);

  const petals: string[] = [];

  // One form for the whole flower: real petals grow from one genetic
  // program, identical shape and size, symmetric corolla. Per-petal life
  // lives in the paint (flame, fibers, blush), never the geometry. The form
  // is born straight, so the corolla is an exact star: one petal upright,
  // the rest at clean multiples of 72°.
  const form = petalForm(genome.form, rng);
  const angles = Array.from({ length: PETALS }, (_, i) => i * PETAL_STEP);

  defs.push(
    `<path id="${id("p")}" d="${petalOutline(form)}"/>`,
    `<clipPath id="${id("c")}"><use ${href("p")}/></clipPath>`
  );

  // The silky radiation of a rendered eye: one 72° sector of hair-fine rays
  // converging on the hub, defined once and rotated five times. Two gold
  // registers alternate (bright and deep, both from the throat), lengths and
  // angles jittered just enough to read organic, and a shared radial fade
  // pools the light right around the dark center the way an iris glows at
  // the pupil's rim before melting into the petals.
  defs.push(
    `<radialGradient id="${id("radf")}" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="${fmt(0.5 * L)}">${stop(0.08, "#fff", 0.18)}${stop(0.2, "#fff", 0.22)}${stop(0.38, "#fff", 0.14)}${stop(0.7, "#fff", 0.05)}${stop(1, "#fff", 0)}</radialGradient>`,
    `<mask id="${id("radm")}" maskUnits="userSpaceOnUse" x="${fmt(-0.5 * L)}" y="${fmt(-0.5 * L)}" width="${fmt(L)}" height="${fmt(L)}"><rect x="${fmt(-0.5 * L)}" y="${fmt(-0.5 * L)}" width="${fmt(L)}" height="${fmt(L)}" fill="${url("radf")}"/></mask>`,
    (() => {
      const bright = hex({
        c: throat.tone.c + 0.02,
        h: throat.tone.h + 8,
        l: Math.min(0.95, throat.tone.l + 0.12),
      });
      const deep = hex({
        c: throat.tone.c + 0.03,
        h: throat.tone.h - 18,
        l: throat.tone.l - 0.18,
      });
      const rays = Array.from({ length: 26 }, (_, k) => {
        const a =
          ((-36 + ((k + between(irng, -0.35, 0.35)) * 72) / 26) * Math.PI) /
          180;
        // scattered roots and reaches: no crisp inner circle to read as a rim
        const r0 = L * between(irng, 0.05, 0.085);
        const r1 = L * between(irng, 0.26, 0.5);
        const rm = (r0 + r1) / 2;
        // a whisper of bow per ray: silk, never a technical starburst
        const bow = between(irng, -0.022, 0.022) * L;
        const cx = rm * Math.sin(a) + bow * Math.cos(a);
        const cy = -rm * Math.cos(a) + bow * Math.sin(a);
        return `<path d="M ${fmt(r0 * Math.sin(a))} ${fmt(-r0 * Math.cos(a))} Q ${fmt(cx)} ${fmt(cy)} ${fmt(r1 * Math.sin(a))} ${fmt(-r1 * Math.cos(a))}" stroke="${irng() < 0.5 ? deep : bright}" stroke-width="${fmt(between(irng, 0.4, 0.75))}" stroke-opacity="${fmt(between(irng, 0.55, 1))}"/>`;
      }).join("");
      return `<g id="${id("ir")}" fill="none" stroke-linecap="round">${rays}</g>`;
    })()
  );

  const tipShadeLayer =
    tipShadeOp > 0.02 ? `<use ${href("p")} fill="${url("tipshade")}"/>` : "";
  const sssLayer = `<use ${href("p")} fill="${url("sss")}"/>`;
  const vigLayer = `<use ${href("p")} fill="${url("vig")}"/>`;
  const gola = `<use ${href("p")} fill="${url("gola")}"/>`;

  // The key light is not white: on light paper a pure-white lift buys
  // brightness by draining saturation. The highlight carries the body's own
  // hue warmed toward the sun's gold, so a shoulder brightens inside its
  // color. Dark keeps the neutral white, where a small lift never washes.
  const sunHex =
    theme === "light"
      ? toHex({
          c: Math.max(0.08, body.base.c * 0.72),
          h: body.base.h * 0.6 + 83 * 0.4,
          l: 0.985,
        })
      : "#fff";

  for (let i = 0; i < PETALS; i++) {
    const next = (i + 1) % PETALS;

    defs.push(
      `<filter id="${id(`f${i}`)}" x="-25%" y="-25%" width="150%" height="150%"><feTurbulence type="fractalNoise" baseFrequency="${baseFrequency}" numOctaves="3" seed="${intBetween(rng, 1, 999999)}"/><feDisplacementMap in="SourceGraphic" scale="${fmt(between(rng, 0.85, 1.15) * (34 + 50 * throat.flame))}" xChannelSelector="R" yChannelSelector="G"/></filter>`
    );

    const core = `<use ${href("p")} fill="${url("core")}"/>`;
    const flameR = throat.reach * L * between(rng, 0.94, 1.06);
    const flameLayers = [
      `<ellipse cy="${fmt(-0.42 * flameR)}" rx="${fmt(0.72 * flameR)}" ry="${fmt(0.86 * flameR)}" fill="${url("flame")}"/>`,
    ];

    if (throat.rays > 0.05) {
      flameLayers.push(
        `<path d="${veinsPath(form, rng, intBetween(rng, 2, 3), throat.reach * 1.05, 0.55)}" fill="none" stroke="${url("rayfade")}" stroke-width="4.5" stroke-linecap="round" opacity="${fmt(0.6 * throat.rays)}"/>`
      );
    }
    // Veins stay out of the displacement group: its strong warp would smear
    // thin strokes into fog, a whisper of blur is enough
    const veinLayer =
      veins.strength > 0.05
        ? `<path d="${veinsPath(form, rng, intBetween(rng, 4, 6), 0.82, 0.95)}" fill="none" stroke="${url("veinfade")}" stroke-width="2.5" stroke-linecap="round" opacity="${fmt(Math.min(0.5, 0.75 * veins.strength))}" filter="${url("fine")}"/>`
        : "";

    // Soft longitudinal billows, silk catching light, then the margin wash
    // pooling at the head
    const billows =
      `<path d="${veinsPath(form, rng, 2, 0.88, 0.85)}" fill="none" stroke="#fff" stroke-width="17" stroke-linecap="round" opacity="0.055" filter="${url("soft")}"/>` +
      `<path d="${veinsPath(form, rng, 2, 0.85, 0.8)}" fill="none" stroke="${hex(creaseTone)}" stroke-width="13" stroke-linecap="round" opacity="0.05" filter="${url("soft")}"/>`;
    const marginLayer =
      margin.strength > 0.05
        ? `<path d="${marginBand(form, rng, margin.strength)}" fill="${hex(margin.tone)}" opacity="${fmt(0.28 + 0.34 * margin.strength)}" filter="${url("soft")}"/>`
        : "";

    // The iris field: fine radial fibers in two registers flowing along the
    // petal, a few wide light beams, and dark crypts near the throat, the
    // eye-like dynamism real petals carry
    // Pale bodies carry almost no fiber contrast on their own, so the iris
    // detail vanishes; deepen the dark register and lift the light one on the
    // whites and pastels to bring the radial weave back, while saturated
    // bodies keep their gentle grain (their color already reads the texture).
    const fiberDark: Tone = cool({
      c: body.base.c + 0.015,
      h: body.base.h,
      l: body.base.l - (0.075 + 0.05 * pale),
    });
    const fiberLight: Tone = {
      c: Math.max(0.005, body.base.c - 0.005),
      h: body.base.h,
      l: Math.min(0.98, body.base.l + 0.045 + 0.03 * pale),
    };
    const crypts = Array.from({ length: 2 }, () => {
      const t = between(rng, 0.14, 0.3);
      const off = between(rng, -0.55, 0.55) * form.over.width;
      return `<ellipse cx="${fmt(form.bend * L * t * t + off)}" cy="${fmt(-L * t)}" rx="${fmt(between(rng, 2, 3.6))}" ry="${fmt(between(rng, 3, 5.5))}" fill="${hex(fiberDark)}" opacity="0.12"/>`;
    }).join("");
    // The fiber field lives in the defs so a mirrored, fainter copy comes for
    // one <use> more: double the weave at almost no bytes, the reuse trick
    // that keeps the texture dense and the document small.
    defs.push(
      `<g id="${id(`fb${i}`)}"><path d="${veinsPath(form, rng, intBetween(rng, 7, 10), 0.9, 1.04)}" fill="none" stroke="${hex(fiberDark)}" stroke-width="1.1" stroke-linecap="round" opacity="${fmt(0.19 + 0.12 * pale)}"/><path d="${veinsPath(form, rng, intBetween(rng, 6, 9), 0.92, 1.08)}" fill="none" stroke="${hex(fiberLight)}" stroke-width="1" stroke-linecap="round" opacity="${fmt(0.2 + 0.09 * pale)}"/></g>`
    );
    const fibers =
      `<g filter="${url("flow")}">` +
      `<use ${href(`fb${i}`)}/>` +
      `<use ${href(`fb${i}`)} transform="scale(-1 1)" opacity="0.4"/>` +
      `<path d="${veinsPath(form, rng, 2, 0.8, 0.5)}" fill="none" stroke="${beamTone}" stroke-width="5.5" stroke-linecap="round" opacity="${beamTone === "#fff" ? "0.055" : "0.09"}"/>` +
      crypts +
      `<use ${href("ir")} mask="${url("radm")}"/>` +
      `</g>`;

    const haloR = throat.reach * L * between(rng, 0.96, 1.05);
    const haloLayer = halo
      ? `<ellipse cy="${fmt(-0.42 * haloR)}" rx="${fmt(0.74 * haloR)}" ry="${fmt(0.88 * haloR)}" fill="none" stroke="${hex(haloTone)}" stroke-width="${fmt(between(rng, 8, 13))}" opacity="${fmt(halo)}" filter="${url("soft")}"/>`
      : "";
    const stripeLayer =
      stripy && rng() < 0.45
        ? (() => {
            const side = between(rng, -0.6, 0.6);
            const t = between(rng, 0.45, 0.6);
            const [sx, sy] = midrib(form, t);
            return `<ellipse transform="translate(${fmt(sx + side * form.over.width * 0.7)} ${fmt(sy)}) rotate(${fmt((Math.atan(2 * form.bend * t) - form.lean) * (180 / Math.PI))})" rx="${fmt(L * between(rng, 0.05, 0.09))}" ry="${fmt(L * between(rng, 0.28, 0.4))}" fill="${hex({ c: margin.tone.c + 0.02, h: margin.tone.h, l: margin.tone.l - 0.06 })}" opacity="${fmt(between(rng, 0.12, 0.2))}" filter="${url("soft")}"/>`;
          })()
        : "";
    const blush2Layer = blush2
      ? (() => {
          const t = between(rng, 0.35, 0.7);
          const [bx2, by2] = midrib(form, t);
          return `<ellipse transform="translate(${fmt(bx2)} ${fmt(by2)})" rx="${fmt(L * between(rng, 0.14, 0.22))}" ry="${fmt(L * between(rng, 0.09, 0.15))}" fill="${hex(blush2)}" opacity="${fmt(between(rng, 0.1, 0.2))}" filter="${url("soft")}"/>`;
        })()
      : "";

    const blushT = Math.min(0.92, blush.at * between(rng, 0.92, 1.08));
    const [bx, by] = midrib(form, blushT);
    const blushBoost = i === genome.accent ? 1.5 : 1;
    const blushRx = L * (0.16 + 0.14 * blush.strength) * between(rng, 0.9, 1.1);
    const tilt = Math.atan(2 * form.bend * blushT) * (180 / Math.PI);

    const facing = Math.cos(((angles[i] - LIGHT_AT) * Math.PI) / 180);
    // Volume: a soft light→shadow gradient per petal, all aligned to the
    // screen's top-left key light (the petal's own rotation undone), so the
    // corolla reads as one lit, rounded dome instead of five flat cut-outs.
    // The half toward the light whitens, the far half dims, the middle keeps
    // the body color. Petals facing the light get a brighter shoulder; those
    // turned away get a deeper shadow.
    const lightAngle = (angles[i] * Math.PI) / 180;
    const ux = (Math.cos(lightAngle) + Math.sin(lightAngle)) / Math.SQRT2;
    const uy = (Math.cos(lightAngle) - Math.sin(lightAngle)) / Math.SQRT2;
    const [vcx, vcy] = midrib(form, 0.45);
    const vSpan = 0.92 * L;
    // White point is theme-aware: lower in dark, where a lit tip pops hard
    // against black, a little higher in light, where warm paper swallows it.
    // Saturated bodies (carmine) take a touch less, so their tips don't go
    // chalky.
    // On light the lit shoulders bloom well past the paper tone - the paper
    // sits near 0.97 and pure white is the headroom - while the self-shade
    // drops to half: the flower reads sunlit, never standing in its own
    // shadow. Dark keeps the deeper modelling that black can afford.
    const vHi =
      theme === "dark"
        ? (0.2 + 0.1 * Math.max(0, facing)) * (1 - 0.6 * pale)
        : (0.58 + 0.12 * Math.max(0, facing)) * (1 - 0.25 * pale);
    // The shade side of a petal is dense color too: a deep saturated cast
    // of the body itself, applied with real weight, is what inflates the
    // lamina into a 3D slab - a black veil at low alpha only dirtied it.
    const vLo =
      theme === "dark"
        ? (0.08 + 0.045 * Math.max(0, -facing)) * (1 - 0.6 * pale)
        : (0.22 + 0.13 * Math.max(0, -facing)) * (1 - 0.25 * pale);
    const deepHex =
      theme === "light"
        ? toHex({
            c: body.base.c * 1.4 + 0.06,
            h: body.base.h - 15,
            l: body.base.l * 0.52,
          })
        : "#000";
    defs.push(
      `<linearGradient id="${id(`v${i}`)}" gradientUnits="userSpaceOnUse" x1="${fmt(vcx - (ux * vSpan) / 2)}" y1="${fmt(vcy - (uy * vSpan) / 2)}" x2="${fmt(vcx + (ux * vSpan) / 2)}" y2="${fmt(vcy + (uy * vSpan) / 2)}">${stop(0, sunHex, vHi)}${stop(0.42, sunHex, 0)}${stop(0.6, deepHex, 0)}${stop(1, deepHex, vLo)}</linearGradient>`
    );
    const light = `<use ${href("p")} fill="${url(`v${i}`)}"/>`;

    // The specular hugs the curvature instead of sitting on the lamina: the
    // petal's own outline stroked wide and soft with the volume gradient, so
    // the lit shoulder catches a band of light that dies around the
    // silhouette. A band tied to the edge cannot strand mid-petal the way a
    // free-standing highlight shape would.
    const gloss = `<use ${href("p")} fill="none" stroke="${url(`v${i}`)}" stroke-width="13" opacity="${fmt(0.5 + 0.25 * Math.max(0, facing))}" filter="${url("soft")}"/>`;

    const [hx, hy] = midrib(form, 0.55);
    // A faint, broad satin, just enough sheen to keep the petal from reading
    // matte. Kept low and wide so it never pools into a white halo, and no
    // local catchlight, which read as strange spots stranded on the petals.
    const sheen = `<ellipse transform="translate(${fmt(hx)} ${fmt(hy)}) rotate(${fmt(Math.atan(2 * form.bend * 0.55) * (180 / Math.PI))})" rx="${fmt(0.38 * L * between(rng, 0.85, 1.1))}" ry="${fmt(0.22 * L * between(rng, 0.85, 1.1))}" fill="${url("sheen")}" opacity="${fmt((theme === "dark" ? 0.05 : 0.12) + (theme === "dark" ? 0.07 : 0.12) * Math.max(0, facing))}"/>`;

    petals.push(
      `<g${anim.petal(i)}>` +
        `<g id="${id(`g${i}`)}" transform="translate(${CENTER} ${fmt(CY)}) rotate(${fmt(angles[i])})" clip-path="${url("c")}">` +
        `<use ${href("p")} fill="${url("ramp")}"/>` +
        `<use ${href("p")} fill="#000" filter="${url("grain")}" opacity="${fmt((theme === "dark" ? 0.3 : 0.28) * (1 - 0.45 * pale))}"/>` +
        core +
        `<g filter="${url(`f${i}`)}">${flameLayers.join("")}</g>` +
        gola +
        fibers +
        haloLayer +
        stripeLayer +
        blush2Layer +
        `<path d="${midribPath(form)}" fill="none" stroke="${url("crease")}" stroke-width="8" filter="${url("soft")}"/>` +
        veinLayer +
        billows +
        marginLayer +
        tipShadeLayer +
        sssLayer +
        `<ellipse transform="translate(${fmt(bx)} ${fmt(by)}) rotate(${fmt(tilt)})" rx="${fmt(blushRx)}" ry="${fmt(blushRx * between(rng, 0.55, 0.8))}" fill="${url("blush")}" opacity="${fmt(Math.min(1, 0.75 * blush.strength * blushBoost))}"/>` +
        sheen +
        light +
        gloss +
        vigLayer +
        `<use ${href("p")} fill="none" stroke="${hex(rimTone)}" stroke-width="2.7" opacity="${fmt(rimOpacity + (theme === "dark" ? 0.24 : 0.32) * Math.max(0, facing))}"/>` +
        // On black the shadow side of the dome vanishes; a faint cool rim on
        // the petals turned from the light bounces them back off the dark,
        // the counter-light a film key would place
        (theme === "dark"
          ? `<use ${href("p")} fill="none" stroke="${toHex({ c: 0.025, h: 250, l: 0.8 })}" stroke-width="2.2" opacity="${fmt(0.048 + 0.16 * Math.max(0, -facing))}"/>`
          : "") +
        "</g></g>"
    );

    // The contact shadow on the seam with the next petal belongs to that
    // petal (it laps over this one and casts onto it), so it enters with
    // the caster's delay, clipped to this petal and stacked just under the
    // neighbour. In a bottom-up bloom no shadow ever precedes the petal
    // that throws it. (The 4 to 0 seam is closed by the wedge below.)
    if (i < PETALS - 1) {
      petals.push(
        `<g${anim.petal(next)}>` +
          `<g transform="translate(${CENTER} ${fmt(CY)}) rotate(${fmt(angles[i])})" clip-path="${url("c")}">` +
          `<g mask="${url("hubmask")}">${castShadow("p", angles[next] - angles[i])}</g>` +
          "</g></g>"
      );
    }
  }

  // The pinwheel's missing overlap: petal 0 shown again only where it
  // crosses petal 4, shadow first, so the cycle closes seamlessly
  defs.push(
    // Slightly inflated: a clip tracing petal 4's exact outline leaves a
    // 1px antialiasing seam where petal 4's bright rim bleeds through the
    // redrawn petal 0; past the edge the redraw lands on petal 0 itself, so
    // the seam dissolves into identical pixels
    `<clipPath id="${id("wedge")}"><use ${href("p")} transform="translate(${CENTER} ${fmt(CY)}) rotate(${fmt(angles[4])}) scale(1.012)"/></clipPath>`
  );
  // Petal 0 sits over petal 4 here, so the seam can only close once both
  // are on stage: the wedge enters with petal 4, the last to bloom.
  const wedge =
    `<g${anim.petal(4)}>` +
    `<g clip-path="${url("wedge")}">` +
    `<g transform="translate(${CENTER} ${fmt(CY)})"><g mask="${url("hubmask")}">${castShadow("p", angles[0])}</g></g>` +
    `<use ${href("g0")}/>` +
    "</g></g>";

  const ambient = ground
    ? theme === "dark"
      ? `<ellipse cx="${CENTER}" cy="${fmt(CY)}" rx="${fmt(L * 1.18)}" ry="${fmt(L * 1.12)}" fill="${url("ambient")}"${anim.fade}/>`
      : `<ellipse cx="${CENTER}" cy="${fmt(CY + 10)}" rx="${fmt(L * 0.95)}" ry="${fmt(L * 0.88)}" fill="${url("ambient")}"${anim.fade}/>`
    : "";
  // On light paper the flower needs a cast shadow to sit on the surface
  // instead of floating: the corolla's own silhouette, blurred once, dropped
  // toward the bottom right (away from the key light). Pale cultivars leaning
  // on it hardest take it a touch stronger. On dark the petals already
  // separate from the ground, and a shadow on black is no shadow at all.
  let dropLayer = "";
  if (theme === "light" && shadow) {
    // Anchored, never a halo: the silhouette shrinks a notch, drops well
    // below and blurs little, so the shadow pools under the corolla and the
    // top edges stay crisp against the paper instead of dissolving into it.
    const dropOp = 0.3 + 0.1 * pale;
    defs.push(
      `<filter id="${id("dropf")}" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="5.5"/></filter>`
    );
    dropLayer = `<g transform="translate(${CENTER + 4} ${fmt(CY + 18)}) scale(0.9)" fill="${toHex({ c: 0.028, h: 55, l: 0.42 })}" filter="${url("dropf")}" opacity="${fmt(dropOp)}"${anim.fade}>${angles.map((a) => `<use ${href("p")} transform="rotate(${fmt(a)})"/>`).join("")}</g>`;
  }

  const tube = `<circle cx="${CENTER}" cy="${fmt(CY)}" r="${fmt(0.1 * L)}" fill="${url("tube")}"${anim.fade}/>`;
  const eye = `<circle cx="${CENTER}" cy="${fmt(CY)}" r="${fmt(between(rng, 3, 4.5))}" fill="${hexRaw(eyeTone)}"${anim.fade}/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}" width="${size}" height="${size}" role="img" aria-label="A ${genome.cultivar} plumeria"><defs>${defs.join("")}</defs>${ambient}${dropLayer}${anim.openTag}${petals.join("")}${wedge}${anim.closeTag}${tube}${eye}</svg>`;
}
