import { type Bloom, bloom as makeBloom, still } from "@/src/plumeria/bloom";
import {
  pigmentMarkSection,
  preparePigmentMarks,
} from "@/src/plumeria/markings";
import {
  curlBand,
  laminaPoint,
  midrib,
  petalOutline,
} from "@/src/plumeria/petal";
import { preparePetalPaint } from "@/src/plumeria/petal-paint";
import {
  bodyPaleness,
  gradeVectorHex,
  ivoryTone,
  pigmentMarkTone,
  throatExtent,
  vectorTone,
} from "@/src/plumeria/pigment";
import { plumeriaCultivarName, sprout } from "@/src/plumeria/specimen";
import { escapeXml, fmt, protectPaint, stop } from "@/src/plumeria/svg-markup";
import type { PlumeriaSelection } from "@/src/plumeria/variants";
import { mixTone, type Tone, toHex } from "@/src/shared/color";
import { fullMoon } from "@/src/shared/moon";

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
  const grown = sprout(
    seed,
    date ? fullMoon(date) : 0,
    custom,
    idPrefix,
    variant
  );
  const {
    baseFrequency,
    blush2Mix,
    form,
    frame,
    genome,
    grainSeed,
    halo,
    blush2At,
    blush2Opacity,
    blush2Width,
    uid: sproutUid,
  } = grown;
  const uid = `p${sproutUid}`;
  const { blush, margin, throat } = genome;
  const paint = preparePetalPaint(seed, form, genome, grown);
  const marks = preparePigmentMarks(seed, genome, grown);
  const L = form.length;
  const coreRadius = throatExtent(throat.reach) * L;

  const body = {
    base: ivoryTone(genome.body.base),
    tip: ivoryTone(genome.body.tip),
  };

  const cool = (t: Tone): Tone => ({ c: t.c + 0.012, h: t.h - 24, l: t.l });
  const hexRaw = (t: Tone): string => toHex(vectorTone(t));
  const hex = (t: Tone): string => bake(hexRaw(t));

  const originX = CENTER - frame.scale * frame.centerX;
  const originY = CENTER - frame.scale * frame.centerY;
  const corollaTransform = `translate(${fmt(originX)} ${fmt(originY)}) scale(${frame.scale.toFixed(6)})`;

  const id = (key: string) => `${uid}${key}`;
  const url = (key: string) => `url(#${id(key)})`;
  const href = (key: string) => `href="#${id(key)}"`;

  const flameMix = (t: number) => mixTone(throat.tone, body.base, t);
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
  const bake = (raw: string): string => gradeVectorHex(raw, pale);
  const fiberInk = hex({
    ...genome.veins.tone,
    l: Math.min(genome.veins.tone.l, body.base.l - 0.12),
  });
  const shadowOpacity = 0.46 * (1 - 0.24 * pale);
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
    `<radialGradient id="${id("hub")}" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="${fmt(0.055 * L)}">${stop(0, "#000")}${stop(0.25, "#3a3a3a")}${stop(0.5, "#888")}${stop(0.82, "#ccc")}${stop(0.93, "#f2f2f2")}${stop(1, "#fff")}</radialGradient>`,
    `<linearGradient id="${id("curl")}" gradientUnits="userSpaceOnUse" x1="${fmt(-0.5 * L)}" y1="0" x2="0" y2="0">${stop(0, hex(rimTone), 0.16)}${stop(0.38, hex(curlTone), 0.08)}${stop(1, hex(curlTone), 0)}</linearGradient>`,
    `<radialGradient id="${id("blush")}">${stop(0, hex(blush.tone), 0.8)}${stop(0.6, hex(blush.tone), 0.35)}${stop(1, hex(blush.tone), 0)}</radialGradient>`,
    ground
      ? `<radialGradient id="${id("ambient")}">${stop(0, ground.hex, ground.peak)}${stop(0.7, ground.hex, ground.peak * 0.66)}${stop(1, ground.hex, 0)}</radialGradient>`
      : "",
    `<mask id="${id("hubmask")}" maskUnits="userSpaceOnUse" x="${fmt(-1.1 * L)}" y="${fmt(-1.1 * L)}" width="${fmt(2.2 * L)}" height="${fmt(2.2 * L)}"><rect x="${fmt(-1.1 * L)}" y="${fmt(-1.1 * L)}" width="${fmt(2.2 * L)}" height="${fmt(2.2 * L)}" fill="${url("hub")}"/></mask>`,
    `<filter id="${id("soft")}" x="-25%" y="-25%" width="150%" height="150%"><feGaussianBlur stdDeviation="2.2"/></filter>`,
    `<filter id="${id("contact")}" x="-25%" y="-25%" width="150%" height="150%"><feGaussianBlur stdDeviation="0.85"/></filter>`,
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
    `<radialGradient id="${id("gola")}" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="${fmt(0.55 * L)}">${stop(0, golaGlow, 0.2 + 0.04 * pale)}${stop(0.42, golaGlow, 0.1 + 0.02 * pale)}${stop(0.72, golaGlow, 0.025)}${stop(1, golaGlow, 0)}</radialGradient>`,
    `<filter id="${id("grain")}" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.64" numOctaves="2" seed="${grainSeed}"/><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.6 0 0 0 -0.6" result="tooth"/><feComposite in="SourceGraphic" in2="tooth" operator="in"/></filter>`,
    `<linearGradient id="${id("fiberink")}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${fmt(-L)}">${stop(0.04, fiberInk, 0)}${stop(0.2, fiberInk, 0.1)}${stop(0.55, fiberInk, 0.24)}${stop(0.78, fiberInk, 0.18)}${stop(0.94, fiberInk, 0)}</linearGradient>`,
    `<path id="${id("fibers")}" d="${paint.fibers}" fill="none" stroke="${url("fiberink")}" stroke-width="0.65" stroke-linecap="round"/>`,
  ];

  const castShadow = (key: string, rotation: number): string =>
    `<use ${href(key)} transform="rotate(${fmt(rotation)})" fill="${hex(shadowTone)}" opacity="${fmt(shadowOpacity * 0.85)}" filter="${url("contact")}"/>` +
    `<use ${href(key)} transform="rotate(${fmt(rotation)})" fill="${hex(shadowTone)}" opacity="${fmt(shadowOpacity * 0.6)}" filter="${url("soft")}"/>`;

  const anim: Bloom = bloom ? makeBloom(originX, originY, PETALS) : still;

  const petals: string[] = [];

  // One petal form is reused at exact 72-degree rotations.
  const angles = Array.from({ length: PETALS }, (_, i) => i * PETAL_STEP);

  defs.push(
    `<path id="${id("p")}" d="${petalOutline(form)}"/>`,
    `<path id="${id("roll")}" d="${curlBand(form)}"/>`,
    `<clipPath id="${id("c")}"><use ${href("p")}/></clipPath>`
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

  // Invariant paint is prepared once; only orientation-aware light stays below.
  defs.push(
    `<filter id="${id("flameflow")}" x="-25%" y="-25%" width="150%" height="150%"><feTurbulence type="fractalNoise" baseFrequency="${baseFrequency}" numOctaves="3" seed="${paint.flameSeed}"/><feDisplacementMap in="SourceGraphic" scale="${fmt(paint.flameScale)}" xChannelSelector="R" yChannelSelector="G"/></filter>`
  );
  const core = `<use ${href("p")} fill="${url("core")}"/>`;
  const flameR = paint.flameRadius;
  const flameWidth = 0.42 + 0.18 * throat.flame;
  const flame = `<ellipse cy="${fmt(-0.44 * flameR)}" rx="${fmt(flameWidth * flameR)}" ry="${fmt(0.95 * flameR)}" fill="${url("flame")}" filter="${url("flameflow")}"/>`;
  const markingPaths = marks
    .map((mark) => {
      const edge = (side: number, reverse: boolean) =>
        Array.from({ length: 13 }, (_, i) => {
          const t = (reverse ? 12 - i : i) / 12;
          const along = mark.from + (mark.to - mark.from) * t;
          const section = pigmentMarkSection(mark, along);
          // Fine SVG ink follows the shared pigment's half-strength contour;
          // a stripe remains a broad wash rather than a second hairline.
          const across =
            section.center +
            side * section.width * (mark.kind === "stripe" ? 1 : 0.5);
          return laminaPoint(
            form,
            across < 0 ? -1 : 1,
            along,
            Math.abs(across)
          );
        });
      const path = `${[...edge(1, false), ...edge(-1, true)]
        .map(([x, y], i) => `${i ? "L" : "M"} ${fmt(x)} ${fmt(y)}`)
        .join(" ")} Z`;
      const tone = pigmentMarkTone(genome, mark.kind);
      // Illustration ink needs contrast; the 3D pigment must not bake in depth.
      const color = hex({
        ...tone,
        l:
          tone.l -
          (mark.kind === "stripe" ? 0.075 : mark.kind === "ray" ? 0.13 : 0),
      });
      if (mark.kind === "stripe") {
        const start = laminaPoint(
          form,
          mark.start < 0 ? -1 : 1,
          mark.from,
          Math.abs(mark.start)
        );
        const end = laminaPoint(
          form,
          mark.end < 0 ? -1 : 1,
          mark.to,
          Math.abs(mark.end)
        );
        defs.push(
          `<linearGradient id="${id("stripefade")}" gradientUnits="userSpaceOnUse" x1="${fmt(start[0])}" y1="${fmt(start[1])}" x2="${fmt(end[0])}" y2="${fmt(end[1])}">${[0, 0.25, 0.5, 0.75, 1].map((t) => stop(t, color, pigmentMarkSection(mark, mark.from + t * (mark.to - mark.from)).fade)).join("")}</linearGradient>`
        );
      }
      return `<path data-pigment="${mark.kind}" d="${path}" fill="${mark.kind === "stripe" ? url("stripefade") : color}" opacity="${fmt(mark.opacity * (mark.kind === "stripe" ? 0.9 : 1.25))}"${mark.kind === "stripe" ? ` filter="${url("soft")}"` : ""}/>`;
    })
    .join("");
  defs.push(`<g id="${id("markings")}">${markingPaths}</g>`);
  const marginLayer = paint.margin
    ? `<path d="${paint.margin}" fill="${hex(margin.tone)}" opacity="${fmt(0.18 + 0.24 * margin.strength)}" filter="${url("soft")}"/>`
    : "";
  defs.push(`<g id="${id("marginlayer")}">${marginLayer}</g>`);
  const haloR = paint.haloRadius;
  const haloLayer = paint.haloWidth
    ? `<ellipse cy="${fmt(-0.42 * haloR)}" rx="${fmt(0.74 * haloR)}" ry="${fmt(0.88 * haloR)}" fill="none" stroke="${hex(haloTone)}" stroke-width="${fmt(paint.haloWidth)}" opacity="${fmt(halo)}" filter="${url("soft")}"/>`
    : "";
  const [bx2, by2] = midrib(form, blush2At);
  const blush2Layer = blush2
    ? `<ellipse transform="translate(${fmt(bx2)} ${fmt(by2)})" rx="${fmt(L * blush2Width)}" ry="${fmt(L * blush2Width * 0.68)}" fill="${hex(blush2)}" opacity="${fmt(blush2Opacity)}" filter="${url("soft")}"/>`
    : "";
  const [bx, by] = midrib(form, paint.blushAlong);
  const tilt = Math.atan(2 * form.bend * paint.blushAlong) * (180 / Math.PI);
  const blushLayer = `<ellipse transform="translate(${fmt(bx)} ${fmt(by)}) rotate(${fmt(tilt)})" rx="${fmt(paint.blushRadius)}" ry="${fmt(paint.blushRadius * paint.blushAspect)}" fill="${url("blush")}" opacity="${fmt(Math.min(1, 0.58 * blush.strength))}"/>`;

  for (const i of angles.keys()) {
    const next = (i + 1) % PETALS;
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
      `<linearGradient id="${id(`v${i}`)}" gradientUnits="userSpaceOnUse" x1="${fmt(vcx - (ux * vSpan) / 2)}" y1="${fmt(vcy - (uy * vSpan) / 2)}" x2="${fmt(vcx + (ux * vSpan) / 2)}" y2="${fmt(vcy + (uy * vSpan) / 2)}">${stop(0, sunHex, vHi)}${stop(0.48, sunHex, 0.045)}${stop(0.66, deepHex, 0.015)}${stop(1, deepHex, vLo)}</linearGradient>`
    );
    const light = `<use ${href("p")} fill="${url(`v${i}`)}"/>`;
    const [hx, hy] = midrib(form, 0.55);
    const sheen = `<ellipse transform="translate(${fmt(hx)} ${fmt(hy)}) rotate(${fmt(Math.atan(2 * form.bend * 0.55) * (180 / Math.PI))})" rx="${fmt(0.4 * L * paint.sheenWidth)}" ry="${fmt(0.24 * L * paint.sheenHeight)}" fill="${url("sheen")}" opacity="${fmt(0.12 + 0.09 * Math.max(0, facing))}"/>`;

    petals.push(
      `<g${anim.petal(i)}>` +
        `<g id="${id(`g${i}`)}" transform="${corollaTransform} rotate(${fmt(angles[i])})" clip-path="${url("c")}">` +
        `<use ${href("p")} fill="${url("ramp")}"/>` +
        core +
        flame +
        gola +
        haloLayer +
        blush2Layer +
        `<use ${href("p")} fill="${url("lobe")}"/>` +
        `<use ${href("marginlayer")}/>` +
        tipShadeLayer +
        sssLayer +
        light +
        blushLayer +
        `<use ${href("markings")}/>` +
        `<use ${href("fibers")}/>` +
        `<use ${href("p")} fill="${fiberInk}" filter="${url("grain")}" opacity="${fmt((0.16 + 0.04 * chromatic) * (1 - 0.2 * pale))}"/>` +
        sheen +
        `<use ${href("roll")} fill="${url("curl")}"/>` +
        vigLayer +
        `<use ${href("p")} fill="none" stroke="${toHex({ c: 0.008, h: 250, l: 0.28 })}" stroke-width="1" opacity="0.035"/>` +
        `<use ${href("p")} fill="none" stroke="${hex(rimTone)}" stroke-width="1" opacity="${fmt(0.1 + 0.035 * Math.max(0, facing))}"/>` +
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
