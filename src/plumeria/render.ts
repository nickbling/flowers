import { type Bloom, bloom as makeBloom, still } from "@/src/plumeria/bloom";
import {
  curlBand,
  laminaBand,
  marginBand,
  midrib,
  midribPath,
  petalOutline,
  veinsPath,
} from "@/src/plumeria/petal";
import {
  bodyPaleness,
  gradeVectorHex,
  ivoryTone,
  throatExtent,
  throatRayExtent,
  vectorTone,
} from "@/src/plumeria/pigment";
import { plumeriaCultivarName, sprout } from "@/src/plumeria/specimen";
import type { PlumeriaSelection } from "@/src/plumeria/variants";
import { mixTone, type Tone, toHex } from "@/src/shared/color";
import { fullMoon } from "@/src/shared/moon";
import { between, createRng, intBetween } from "@/src/shared/prng";

export { sprout } from "@/src/plumeria/specimen";

export type PlumeriaOptions = Readonly<{
  seed: string;
  /** ISO day (YYYY-MM-DD); the full moon of that day pales the bloom. */
  date?: string;
  /** Adds animation hooks driven by `BLOOM_CSS`; disabled by default. */
  bloom?: boolean;
  /** Adds a soft ground glow; disabled by default. */
  glow?: boolean;
  /** Prefix for document-local IDs when several SVGs share one DOM tree. */
  idPrefix?: string;
  /** Adds a cast ground shadow; disabled because the host owns the surface. */
  shadow?: boolean;
  size?: number;
}> &
  PlumeriaSelection;

type PlumeriaIdentityOptions = Readonly<{ seed: string }> & PlumeriaSelection;

const VIEWBOX = 480;
const CENTER = VIEWBOX / 2;
const PETALS = 5;
const PETAL_STEP = 360 / PETALS;

function fmt(value: number): number {
  return Math.round(value * 100) / 100;
}

function stop(offset: number, color: string, opacity?: number): string {
  return `<stop offset="${fmt(offset)}" stop-color="${color}"${opacity === undefined ? "" : ` stop-opacity="${fmt(opacity)}"`}/>`;
}

const PAINT_PROPERTIES = [
  "clip-path",
  "fill",
  "fill-opacity",
  "filter",
  "mask",
  "opacity",
  "stop-color",
  "stop-opacity",
  "stroke",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-opacity",
  "stroke-width",
] as const;

const PAINTABLE_ELEMENTS = new Set([
  "circle",
  "ellipse",
  "line",
  "path",
  "polygon",
  "polyline",
  "rect",
  "use",
]);

function protectPaint(markup: string): string {
  return markup.replace(
    /<([a-zA-Z][\w:-]*)(\s[^<>]*?)?(\/?)>/g,
    (tag, rawName: string, rawAttributes = "", close: string) => {
      const name = rawName.toLowerCase();
      const styleMatch = rawAttributes.match(/\sstyle="([^"]*)"/);
      const current = styleMatch?.[1] ?? "";
      const declarations = current
        .split(";")
        .map((part: string) => part.trim())
        .filter(Boolean);
      const defined = new Set(
        declarations.map((part: string) => part.slice(0, part.indexOf(":")))
      );
      let attributesWithoutPaint = rawAttributes;

      for (const property of PAINT_PROPERTIES) {
        const pattern = new RegExp(`\\s${property}="([^"]*)"`);
        const match = attributesWithoutPaint.match(pattern);
        if (match && !defined.has(property)) {
          declarations.push(`${property}:${match[1]}`);
          defined.add(property);
        }
        if (match)
          attributesWithoutPaint = attributesWithoutPaint.replace(pattern, "");
      }

      if (PAINTABLE_ELEMENTS.has(name)) {
        for (const property of ["fill", "stroke"] as const) {
          if (!defined.has(property)) declarations.push(`${property}:inherit`);
        }
      }

      if (declarations.length === 0) return tag;
      const style = declarations.join(";");
      const attributes = styleMatch
        ? attributesWithoutPaint.replace(/\sstyle="[^"]*"/, ` style="${style}"`)
        : `${attributesWithoutPaint} style="${style}"`;
      return `<${rawName}${attributes}${close}>`;
    }
  );
}

/** Returns the cultivar selected by the same seed mapping used by `plumeria()`. */
export function cultivar({
  seed,
  cultivar: custom,
  variant,
}: PlumeriaIdentityOptions): string {
  return plumeriaCultivarName(seed, custom, variant);
}

/** Renders the maintained plumeria as a standalone transparent SVG document. */
export function plumeria({
  seed,
  cultivar: custom,
  variant,
  date,
  bloom = false,
  glow = false,
  idPrefix,
  shadow = false,
  size = VIEWBOX,
}: PlumeriaOptions): string {
  if (!Number.isSafeInteger(size) || size < 1 || size > 4096)
    throw new RangeError("SVG size must be an integer from 1 to 4096");
  if (idPrefix !== undefined && !/^[a-z][a-z0-9_-]*$/i.test(idPrefix))
    throw new TypeError(
      "SVG idPrefix must start with a letter and contain only letters, digits, underscores or hyphens"
    );
  const {
    baseFrequency,
    blush2Mix,
    flowSeed,
    form,
    frame,
    genome,
    grainSeed,
    halo,
    blush2At,
    blush2Opacity,
    blush2Width,
    stripeSide,
    stripeVisible,
    uid: sproutUid,
  } = sprout(seed, date ? fullMoon(date) : 0, custom, idPrefix, variant);
  const uid = `p${sproutUid}`;
  const { blush, margin, throat, veins } = genome;
  const L = form.length;
  const coreRadius = Math.max(0.01, throat.reach * L * 0.22);

  const body = {
    base: ivoryTone(genome.body.base),
    tip: ivoryTone(genome.body.tip),
  };

  const themed = (t: Tone): Tone => vectorTone(t);
  const cool = (t: Tone): Tone => ({ c: t.c + 0.012, h: t.h - 24, l: t.l });
  const hexRaw = (t: Tone): string => toHex(themed(t));
  const hex = (t: Tone): string => bake(hexRaw(t));

  const originX = CENTER - frame.scale * frame.centerX;
  const originY = CENTER - frame.scale * frame.centerY;
  const corollaTransform = `translate(${fmt(originX)} ${fmt(originY)}) scale(${frame.scale.toFixed(6)})`;

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
  const shadowTone: Tone = cool({ c: 0.055, h: body.base.h, l: 0.34 });
  const rimTone = mixTone(body.tip, { c: 0.005, h: body.tip.h, l: 0.99 }, 0.7);
  const curlTone = cool({
    c: body.base.c + 0.035,
    h: body.base.h - 12,
    l: body.base.l - 0.1,
  });
  const pale = bodyPaleness(body.base);
  const liveryChroma = Math.max(body.base.c, body.tip.c, margin.tone.c);
  const chromatic = Math.min(1, Math.max(0, (liveryChroma - 0.04) / 0.12));
  const grooveOpacity = 0.82 + 0.18 * chromatic;
  const irisOpacity = 0.28 + 0.2 * chromatic;
  const bake = (raw: string): string => gradeVectorHex(raw, pale);
  const shadowOpacity = 0.46 * (1 - 0.24 * pale);
  const golaBoost = 1;
  const tipCool: Tone = { c: 0.012, h: 248, l: body.tip.l - 0.08 };
  const tipShadeOp = 0.1 * pale;
  const golaGlow = hex(
    mixTone(throat.tone, { c: 0.02, h: throat.tone.h, l: 0.98 }, 0.3)
  );
  const haloTone = mixTone(throat.tone, margin.tone, 0.55);
  const blush2 =
    blush2Mix === null ? null : mixTone(body.tip, throat.tone, blush2Mix);
  const ground = glow
    ? {
        hex: hexRaw(mixTone(body.base, throat.tone, 0.7)),
        peak: 0.065,
      }
    : null;

  const defs: string[] = [
    `<linearGradient id="${id("ramp")}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${fmt(-L)}">${[0, 0.3, 0.55, 0.78, 1].map((t) => stop(t, hex(mixTone(body.base, body.tip, t)))).join("")}</linearGradient>`,
    `<radialGradient id="${id("core")}" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="${fmt(coreRadius)}">${stop(0, hex(throat.tone), 1)}${stop(0.42, hex(throat.tone), 0.88)}${stop(0.72, hex(flameMix(0.15)), 0.35)}${stop(0.9, hex(flameMix(0.22)), 0.08)}${stop(1, hex(flameMix(0.25)), 0)}</radialGradient>`,
    `<radialGradient id="${id("flame")}">${stop(0, hex(throat.tone), 1)}${stop(0.38, hex(flameMix(0.08)), 0.9)}${stop(0.62, hex(flameMix(0.28)), 0.45)}${stop(0.82, hex(flameMix(0.5)), 0.14)}${stop(1, hex(flameMix(0.65)), 0)}</radialGradient>`,
    `<radialGradient id="${id("hub")}" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="${fmt(0.44 * L)}">${stop(0, "#000")}${stop(0.4, "#3a3a3a")}${stop(0.62, "#888")}${stop(0.82, "#ccc")}${stop(0.93, "#f2f2f2")}${stop(1, "#fff")}</radialGradient>`,
    `<linearGradient id="${id("crease")}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${fmt(-L)}">${stop(0, hex(creaseTone), 0.5)}${stop(0.6, hex(creaseTone), 0)}</linearGradient>`,
    `<linearGradient id="${id("curl")}" gradientUnits="userSpaceOnUse" x1="${fmt(-0.5 * L)}" y1="0" x2="0" y2="0">${stop(0, hex(rimTone), 0.32)}${stop(0.38, hex(curlTone), 0.16)}${stop(1, hex(curlTone), 0)}</linearGradient>`,
    `<linearGradient id="${id("veinfade")}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${fmt(-L)}">${stop(0, hex(veins.tone), 0.9)}${stop(0.5, hex(veins.tone), 0.6)}${stop(0.8, hex(veins.tone), 0)}</linearGradient>`,
    `<linearGradient id="${id("rayfade")}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${fmt(-L)}">${stop(0, hex(rayTone), 0.95)}${stop(0.55, hex(rayTone), 0.55)}${stop(0.85, hex(rayTone), 0)}</linearGradient>`,
    `<radialGradient id="${id("blush")}">${stop(0, hex(blush.tone), 0.8)}${stop(0.6, hex(blush.tone), 0.35)}${stop(1, hex(blush.tone), 0)}</radialGradient>`,
    ground
      ? `<radialGradient id="${id("ambient")}">${stop(0, ground.hex, ground.peak)}${stop(0.7, ground.hex, ground.peak * 0.66)}${stop(1, ground.hex, 0)}</radialGradient>`
      : "",
    `<mask id="${id("hubmask")}" maskUnits="userSpaceOnUse" x="${fmt(-1.1 * L)}" y="${fmt(-1.1 * L)}" width="${fmt(2.2 * L)}" height="${fmt(2.2 * L)}"><rect x="${fmt(-1.1 * L)}" y="${fmt(-1.1 * L)}" width="${fmt(2.2 * L)}" height="${fmt(2.2 * L)}" fill="${url("hub")}"/></mask>`,
    `<filter id="${id("soft")}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2"/></filter>`,
    `<filter id="${id("near")}" x="-25%" y="-25%" width="150%" height="150%"><feGaussianBlur stdDeviation="2.2"/></filter>`,
    `<filter id="${id("fine")}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="0.55"/></filter>`,
    `<filter id="${id("contact")}" x="-25%" y="-25%" width="150%" height="150%"><feGaussianBlur stdDeviation="5"/></filter>`,
    (() => {
      const w = toHex({ c: 0.02, h: 85, l: 0.985 });
      return `<radialGradient id="${id("sheen")}">${stop(0, w, 0.5)}${stop(0.42, w, 0.22)}${stop(0.76, w, 0.05)}${stop(1, w, 0)}</radialGradient>`;
    })(),
    `<linearGradient id="${id("tipshade")}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${fmt(-L)}">${stop(0, bake(toHex(tipCool)), 0)}${stop(0.5, bake(toHex(tipCool)), 0)}${stop(0.82, bake(toHex(tipCool)), tipShadeOp * 0.5)}${stop(1, bake(toHex(tipCool)), tipShadeOp)}</linearGradient>`,
    (() => {
      const t = mixTone(body.tip, throat.tone, 0.4);
      const s = hex({ c: t.c * 1.5, h: t.h, l: Math.min(0.93, t.l + 0.03) });
      return `<linearGradient id="${id("sss")}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${fmt(-L)}">${stop(0.76, s, 0)}${stop(0.92, s, 0.07)}${stop(1, s, 0.16)}</linearGradient>`;
    })(),
    (() => {
      const v = toHex(cool({ c: 0.03, h: body.base.h, l: 0.25 }));
      return `<radialGradient id="${id("vig")}" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="${fmt(1.06 * L)}">${stop(0, v, 0)}${stop(0.72, v, 0)}${stop(1, v, 0.055)}</radialGradient>`;
    })(),
    `<radialGradient id="${id("gola")}" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="${fmt(0.55 * L)}">${stop(0, golaGlow, (0.2 + 0.04 * pale) * golaBoost)}${stop(0.42, golaGlow, (0.1 + 0.02 * pale) * golaBoost)}${stop(0.72, golaGlow, 0.025 * golaBoost)}${stop(1, golaGlow, 0)}</radialGradient>`,
    `<filter id="${id("flow")}" x="-15%" y="-15%" width="130%" height="130%"><feTurbulence type="fractalNoise" baseFrequency="0.009 0.022" numOctaves="2" seed="${flowSeed}"/><feDisplacementMap in="SourceGraphic" scale="3.8"/></filter>`,
    `<filter id="${id("grain")}" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.09 0.004" numOctaves="2" seed="${grainSeed}"/><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.16 0 0 0 -0.03"/><feComposite in2="SourceGraphic" operator="in"/></filter>`,
  ];

  const castShadow = (key: string, rotation: number): string =>
    `<use ${href(key)} transform="rotate(${fmt(rotation)})" fill="${hex(shadowTone)}" opacity="${fmt(shadowOpacity * 0.85)}" filter="${url("contact")}"/>` +
    `<use ${href(key)} transform="rotate(${fmt(rotation)})" fill="${hex(shadowTone)}" opacity="${fmt(shadowOpacity * 0.6)}" filter="${url("near")}"/>`;

  const anim: Bloom = bloom ? makeBloom(originX, originY, PETALS) : still;

  // A separate stream lets iris detail evolve without reminting the genome.
  const irng = createRng(`${seed}|iris`);

  const petals: string[] = [];

  // One petal form is reused at exact 72-degree rotations.
  const angles = Array.from({ length: PETALS }, (_, i) => i * PETAL_STEP);

  defs.push(
    `<path id="${id("p")}" d="${petalOutline(form)}"/>`,
    `<path id="${id("roll")}" d="${curlBand(form)}"/>`,
    `<clipPath id="${id("c")}"><use ${href("p")}/></clipPath>`
  );

  defs.push(
    `<radialGradient id="${id("radf")}" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="${fmt(0.5 * L)}">${stop(0.08, "#fff", irisOpacity * 0.78)}${stop(0.2, "#fff", irisOpacity)}${stop(0.38, "#fff", irisOpacity * 0.64)}${stop(0.7, "#fff", irisOpacity * 0.22)}${stop(1, "#fff", 0)}</radialGradient>`,
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
      const rayCount = 22;
      const rays = Array.from({ length: rayCount }, (_, k) => {
        const a =
          ((-36 + ((k + between(irng, -0.35, 0.35)) * 72) / rayCount) *
            Math.PI) /
          180;
        const r0 = L * between(irng, 0.01, 0.035);
        const r1 = L * between(irng, 0.3, 0.54);
        const rm = (r0 + r1) / 2;
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

  const sunHex = toHex({
    c: Math.max(0.025, body.base.c * 0.6),
    h: body.base.h * 0.6 + 83 * 0.4,
    l: 0.985,
  });

  defs.push(
    `<linearGradient id="${id("lobe")}" gradientUnits="userSpaceOnUse" x1="${fmt(-0.55 * L)}" y1="0" x2="${fmt(0.55 * L)}" y2="0">${stop(0, hex(curlTone), 0.2)}${stop(0.2, hex(curlTone), 0.06)}${stop(0.46, sunHex, 0.02)}${stop(0.68, sunHex, 0.13)}${stop(1, hex(creaseTone), 0.1)}</linearGradient>`
  );

  for (let i = 0; i < PETALS; i += 1) {
    const rng = createRng(`${seed}|petal-paint`);
    const next = (i + 1) % PETALS;

    const flameFilter = `<filter id="${id("flameflow")}" x="-25%" y="-25%" width="150%" height="150%"><feTurbulence type="fractalNoise" baseFrequency="${baseFrequency}" numOctaves="3" seed="${intBetween(rng, 1, 999999)}"/><feDisplacementMap in="SourceGraphic" scale="${fmt(between(rng, 0.85, 1.15) * (34 + 50 * throat.flame))}" xChannelSelector="R" yChannelSelector="G"/></filter>`;
    if (i === 0) defs.push(flameFilter);

    const core = `<use ${href("p")} fill="${url("core")}"/>`;
    // Invert the ellipse reach so SVG and GL share the throat extent.
    const flameR =
      ((throatExtent(throat.reach) * L) / 1.28) * between(rng, 0.98, 1.02);
    const flameWidth = 0.42 + 0.18 * throat.flame;
    const flameLayers = [
      `<ellipse cy="${fmt(-0.44 * flameR)}" rx="${fmt(flameWidth * flameR)}" ry="${fmt(0.95 * flameR)}" fill="${url("flame")}"/>`,
    ];

    if (throat.rays > 0.05) {
      flameLayers.push(
        `<path d="${veinsPath(form, rng, intBetween(rng, 2, 3), throatRayExtent(throat.reach, throat.rays), 0.55)}" fill="none" stroke="${url("rayfade")}" stroke-width="2" stroke-linecap="round" opacity="${fmt(0.2 * throat.rays)}"/>`
      );
    }
    const veinLayer =
      veins.strength > 0.05
        ? `<path d="${veinsPath(form, rng, intBetween(rng, 4, 5), 0.82, 0.95)}" fill="none" stroke="${url("veinfade")}" stroke-width="0.85" stroke-linecap="round" opacity="${fmt(Math.min(0.28, 0.4 * veins.strength) * (0.7 + 0.3 * chromatic))}" filter="${url("fine")}"/>`
        : "";

    const billows =
      `<path d="${veinsPath(form, rng, 2, 0.88, 0.85)}" fill="none" stroke="#fff" stroke-width="17" stroke-linecap="round" opacity="0.055" filter="${url("soft")}"/>` +
      `<path d="${veinsPath(form, rng, 2, 0.85, 0.8)}" fill="none" stroke="${hex(creaseTone)}" stroke-width="13" stroke-linecap="round" opacity="0.05" filter="${url("soft")}"/>`;
    const marginLayer =
      margin.strength > 0.05
        ? `<path d="${marginBand(form, rng, margin.strength)}" fill="${hex(margin.tone)}" opacity="${fmt(0.24 + 0.28 * margin.strength)}" filter="${url("soft")}"/>`
        : "";
    const marginUse = `<use ${href("marginlayer")}/>`;

    const grooveShade: Tone = cool({
      c: body.base.c * 0.55 + 0.012,
      h: body.base.h,
      l: body.base.l - (0.11 + 0.035 * pale),
    });
    const grooveLight = mixTone(body.base, { c: 0.012, h: 82, l: 0.99 }, 0.72);
    const groovePath = veinsPath(form, rng, intBetween(rng, 6, 8), 0.92, 1);
    const pigmentPath = veinsPath(form, rng, intBetween(rng, 3, 4), 0.86, 0.92);
    const grooveDefinition = `<path id="${id("groovepath")}" d="${groovePath}"/><g id="${id("grooves")}" fill="none" stroke-linecap="round"><use ${href("groovepath")} stroke="${hex(grooveShade)}" stroke-width="0.62" opacity="${fmt(0.18 + 0.1 * chromatic + 0.02 * pale)}"/><use ${href("groovepath")} transform="translate(0.36 -0.08)" stroke="${hex(grooveLight)}" stroke-width="0.38" opacity="${fmt(0.18 + 0.08 * chromatic + 0.02 * pale)}"/></g>`;
    const tissueDefinition =
      `<g id="${id("tissue")}" filter="${url("flow")}" opacity="${fmt(grooveOpacity)}">` +
      `<path d="${pigmentPath}" fill="none" stroke="${url("rayfade")}" stroke-width="4.2" stroke-linecap="round" opacity="${fmt(0.13 + 0.14 * chromatic)}" filter="${url("fine")}"/>` +
      `<use ${href("grooves")}/>` +
      `<use ${href("ir")} mask="${url("radm")}"/>` +
      `</g>`;
    if (i === 0)
      defs.push(
        grooveDefinition,
        `<g id="${id("undertexture")}">${veinLayer}${billows}</g>`,
        `<g id="${id("marginlayer")}">${marginLayer}</g>`,
        tissueDefinition
      );
    const underTexture = `<use ${href("undertexture")}/>`;
    const tissue = `<use ${href("tissue")}/>`;

    const haloR = throat.reach * L * between(rng, 0.96, 1.05);
    const haloLayer =
      halo && haloR > 0
        ? `<ellipse cy="${fmt(-0.42 * haloR)}" rx="${fmt(0.74 * haloR)}" ry="${fmt(0.88 * haloR)}" fill="none" stroke="${hex(haloTone)}" stroke-width="${fmt(between(rng, 8, 13))}" opacity="${fmt(halo)}" filter="${url("soft")}"/>`
        : "";
    const stripeLayer = stripeVisible
      ? (() => {
          const t = between(rng, 0.45, 0.6);
          const [sx, sy] = midrib(form, t);
          return `<ellipse transform="translate(${fmt(sx + stripeSide * form.over.width * 0.7)} ${fmt(sy)}) rotate(${fmt((Math.atan(2 * form.bend * t) - form.lean) * (180 / Math.PI))})" rx="${fmt(L * between(rng, 0.05, 0.09))}" ry="${fmt(L * between(rng, 0.28, 0.4))}" fill="${hex({ c: margin.tone.c + 0.02, h: margin.tone.h, l: margin.tone.l - 0.06 })}" opacity="${fmt(between(rng, 0.12, 0.2))}" filter="${url("soft")}"/>`;
        })()
      : "";
    const blush2Layer = blush2
      ? (() => {
          const [bx2, by2] = midrib(form, blush2At);
          return `<ellipse transform="translate(${fmt(bx2)} ${fmt(by2)})" rx="${fmt(L * blush2Width)}" ry="${fmt(L * blush2Width * 0.68)}" fill="${hex(blush2)}" opacity="${fmt(blush2Opacity)}" filter="${url("soft")}"/>`;
        })()
      : "";

    const blushT = Math.min(0.92, blush.at * between(rng, 0.92, 1.08));
    const [bx, by] = midrib(form, blushT);
    const blushBoost = 1;
    const blushRx = L * (0.16 + 0.14 * blush.strength) * between(rng, 0.9, 1.1);
    const tilt = Math.atan(2 * form.bend * blushT) * (180 / Math.PI);

    const angle = (angles[i] * Math.PI) / 180;
    const facing = Math.cos(angle + Math.PI / 4);
    const globalUx = 1 / Math.SQRT2;
    const globalUy = 1 / Math.SQRT2;
    const ux = Math.cos(angle) * globalUx + Math.sin(angle) * globalUy;
    const uy = -Math.sin(angle) * globalUx + Math.cos(angle) * globalUy;
    const [vcx, vcy] = midrib(form, 0.45);
    const vSpan = 0.92 * L;
    const vHi = (0.16 + 0.14 * Math.max(0, facing)) * (1 - 0.22 * pale);
    const vLo = (0.12 + 0.14 * Math.max(0, -facing)) * (1 - 0.16 * pale);
    const deepHex = toHex({
      c: body.base.c * 1.15 + 0.025,
      h: body.base.h - 15,
      l: body.base.l * 0.58,
    });
    defs.push(
      `<linearGradient id="${id(`v${i}`)}" gradientUnits="userSpaceOnUse" x1="${fmt(vcx - (ux * vSpan) / 2)}" y1="${fmt(vcy - (uy * vSpan) / 2)}" x2="${fmt(vcx + (ux * vSpan) / 2)}" y2="${fmt(vcy + (uy * vSpan) / 2)}">${stop(0, sunHex, vHi)}${stop(0.42, sunHex, 0)}${stop(0.6, deepHex, 0)}${stop(1, deepHex, vLo)}</linearGradient>`
    );
    const light = `<use ${href("p")} fill="${url(`v${i}`)}"/>`;
    const lightSide: 1 | -1 = ux >= 0 ? -1 : 1;
    const shadeSide: 1 | -1 = lightSide === 1 ? -1 : 1;
    const lightFacet = `<path d="${laminaBand(form, lightSide, 0.2, 0.9, 0.1, 0.92)}" fill="${sunHex}" opacity="${fmt(0.045 + 0.07 * Math.max(0, facing))}" filter="${url("fine")}"/>`;
    const shadeFacet = `<path d="${laminaBand(form, shadeSide, 0.32, 0.94, 0.14, 0.9)}" fill="${deepHex}" opacity="${fmt(0.025 + 0.06 * Math.max(0, -facing))}" filter="${url("fine")}"/>`;

    const gloss = `<use ${href("p")} fill="none" stroke="${url(`v${i}`)}" stroke-width="10" opacity="${fmt(0.12 + 0.12 * Math.max(0, facing))}" filter="${url("soft")}"/>`;

    const [hx, hy] = midrib(form, 0.55);
    const sheen = `<ellipse transform="translate(${fmt(hx)} ${fmt(hy)}) rotate(${fmt(Math.atan(2 * form.bend * 0.55) * (180 / Math.PI))})" rx="${fmt(0.4 * L * between(rng, 0.85, 1.1))}" ry="${fmt(0.24 * L * between(rng, 0.85, 1.1))}" fill="${url("sheen")}" opacity="${fmt(0.035 + 0.055 * Math.max(0, facing))}"/>`;

    petals.push(
      `<g${anim.petal(i)}>` +
        `<g id="${id(`g${i}`)}" transform="${corollaTransform} rotate(${fmt(angles[i])})" clip-path="${url("c")}">` +
        `<use ${href("p")} fill="${url("ramp")}"/>` +
        `<use ${href("p")} fill="#000" filter="${url("grain")}" opacity="${fmt(0.1 * (1 - 0.4 * pale) * (0.75 + 0.25 * chromatic))}"/>` +
        core +
        `<g filter="${url("flameflow")}">${flameLayers.join("")}</g>` +
        gola +
        haloLayer +
        stripeLayer +
        blush2Layer +
        `<path d="${midribPath(form)}" fill="none" stroke="${url("crease")}" stroke-width="8" filter="${url("soft")}"/>` +
        underTexture +
        `<use ${href("p")} fill="${url("lobe")}"/>` +
        marginUse +
        tipShadeLayer +
        sssLayer +
        `<ellipse transform="translate(${fmt(bx)} ${fmt(by)}) rotate(${fmt(tilt)})" rx="${fmt(blushRx)}" ry="${fmt(blushRx * between(rng, 0.55, 0.8))}" fill="${url("blush")}" opacity="${fmt(Math.min(1, 0.58 * blush.strength * blushBoost))}"/>` +
        light +
        lightFacet +
        shadeFacet +
        tissue +
        sheen +
        gloss +
        `<use ${href("roll")} fill="${url("curl")}"/>` +
        vigLayer +
        `<use ${href("p")} fill="none" stroke="${toHex({ c: 0.008, h: 250, l: 0.28 })}" stroke-width="1.8" opacity="0.09"/>` +
        `<use ${href("p")} fill="none" stroke="${hex(rimTone)}" stroke-width="1.5" opacity="${fmt(0.34 + 0.08 * Math.max(0, facing))}"/>` +
        "</g></g>"
    );

    if (i < PETALS - 1) {
      petals.push(
        `<g${anim.petal(next)}>` +
          `<g transform="${corollaTransform} rotate(${fmt(angles[i])})" clip-path="${url("c")}">` +
          `<g mask="${url("hubmask")}">${castShadow("p", angles[next] - angles[i])}</g>` +
          "</g></g>"
      );
    }
  }

  // Redraw petal zero inside petal four to close the cyclic painter order.
  defs.push(
    `<clipPath id="${id("wedge")}"><use ${href("p")} transform="${corollaTransform} rotate(${fmt(angles[4])}) scale(1.012)"/></clipPath>`
  );
  const wedge =
    `<g${anim.petal(4)}>` +
    `<g clip-path="${url("wedge")}">` +
    `<g transform="${corollaTransform}"><g mask="${url("hubmask")}">${castShadow("p", angles[0])}</g></g>` +
    `<use ${href("g0")}/>` +
    "</g></g>";
  const ambient = ground
    ? `<ellipse cx="${fmt(originX)}" cy="${fmt(originY + 6)}" rx="${fmt(L * frame.scale)}" ry="${fmt(L * frame.scale * 0.94)}" fill="${url("ambient")}"${anim.fade}/>`
    : "";
  let dropLayer = "";
  if (shadow) {
    const dropOp = 0.3 + 0.1 * pale;
    defs.push(
      `<filter id="${id("dropf")}" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="5.5"/></filter>`
    );
    dropLayer = `<g transform="translate(${fmt(originX + 4)} ${fmt(originY + 18)}) scale(${fmt(0.9 * frame.scale)})" fill="${toHex({ c: 0.028, h: 55, l: 0.42 })}" filter="${url("dropf")}" opacity="${fmt(dropOp)}"${anim.fade}>${angles.map((a) => `<use ${href("p")} transform="rotate(${fmt(a)})"/>`).join("")}</g>`;
  }

  return protectPaint(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}" width="${size}" height="${size}" role="img" aria-label="A ${escapeXml(genome.cultivar)} plumeria" style="fill:#000;stroke:none"><defs>${defs.join("")}</defs>${ambient}${dropLayer}${anim.openTag}${petals.join("")}${wedge}${anim.closeTag}</svg>`
  );
}

function escapeXml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "'": "&apos;",
        '"': "&quot;",
        "<": "&lt;",
        ">": "&gt;",
      })[character] ?? character
  );
}
