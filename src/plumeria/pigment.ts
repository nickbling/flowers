import type { Genome } from "@/src/plumeria/genome";
import type { PlumeriaLivery } from "@/src/plumeria/specimen";
import { mixTone, type Tone } from "@/src/shared/color";

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function throatExtent(reach: number): number {
  return Math.min(0.98, 0.16 + reach);
}

export function throatRayExtent(reach: number, rays: number): number {
  return Math.min(0.98, throatExtent(reach) + 0.22 * rays);
}

export function throatWeight(
  reach: number,
  rays: number,
  along: number,
  across: number,
  flowerRadius: number
): number {
  const poolExtent = throatExtent(reach);
  const edge = clamp((flowerRadius - 0.06 * poolExtent) / (0.94 * poolExtent));
  const pool = 1 - edge * edge * (3 - 2 * edge);
  const rayExtent = throatRayExtent(reach, rays);
  const rayProgress = clamp(along / rayExtent);
  const rayFade = 1 - rayProgress * rayProgress * (3 - 2 * rayProgress);
  const ray = rayFade * Math.max(0, 1 - across * across) ** 0.78;
  return 1 - (1 - pool) * (1 - ray);
}

export function evaluatePlumeriaPigment(
  genome: Genome,
  livery: PlumeriaLivery,
  along: number,
  across: number,
  flowerRadius: number
): Tone {
  const side = Math.abs(across);
  const body = mixTone(
    ivoryTone(genome.body.base),
    ivoryTone(genome.body.tip),
    along
  );
  const poolExtent = throatExtent(genome.throat.reach);
  const edge = clamp((flowerRadius - 0.06 * poolExtent) / (0.94 * poolExtent));
  const pool = 1 - edge * edge * (3 - 2 * edge);
  let tone = mixTone(
    body,
    {
      c: genome.throat.tone.c * (1 + 0.15 * pool + 0.25 * pool * pool),
      h: genome.throat.tone.h,
      l: genome.throat.tone.l - 0.05 * pool,
    },
    throatWeight(
      genome.throat.reach,
      genome.throat.rays,
      along,
      across,
      flowerRadius
    )
  );

  const blush =
    0.95 *
    genome.blush.strength *
    Math.exp(-(((along - genome.blush.at) / 0.22) ** 2)) *
    (1 - 0.35 * side * side);
  tone = mixTone(tone, genome.blush.tone, clamp(blush));

  if (livery.blush2Mix !== null) {
    const secondary = mixTone(
      genome.body.tip,
      genome.throat.tone,
      livery.blush2Mix
    );
    const strength =
      livery.blush2Opacity *
      Math.exp(-(((along - livery.blush2At) / livery.blush2Width) ** 2)) *
      Math.max(0, 1 - 0.7 * side * side);
    tone = mixTone(tone, secondary, strength);
  }

  if (livery.halo > 0) {
    const center = Math.min(0.82, 0.92 * genome.throat.reach);
    const band = Math.exp(-(((flowerRadius - center) / 0.065) ** 2));
    tone = mixTone(
      tone,
      mixTone(genome.throat.tone, genome.margin.tone, 0.55),
      Math.min(0.3, 1.25 * livery.halo * band)
    );
  }

  if (livery.stripeVisible) {
    const stripe =
      Math.exp(-(((across - livery.stripeSide) / 0.16) ** 2)) *
      Math.exp(-(((along - 0.58) / 0.3) ** 2));
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

  const margin =
    Math.min(1, side ** 2.8 + along ** 14) *
    (0.2 + 0.8 * clamp((along - 0.25) / 0.7));
  const separation = Math.min(1, side ** 9 + along ** 22);
  tone = mixTone(tone, { c: 0.012, h: tone.h, l: 0.985 }, 0.42 * separation);
  return mixTone(
    tone,
    {
      ...genome.margin.tone,
      l: Math.max(genome.margin.tone.l, tone.l - 0.015),
    },
    Math.min(0.52, 0.8 * genome.margin.strength * margin)
  );
}

export function ivoryTone(tone: Tone): Tone {
  return {
    c: tone.c,
    h: tone.h,
    l: Math.min(tone.l, 0.985),
  };
}

export function lightTone(tone: Tone): Tone {
  if (tone.c < 0.04) return tone;
  const colorfulness = Math.min(1, (tone.c - 0.04) / 0.12);
  return {
    c: tone.c * 1.55 + 0.022 * colorfulness,
    h: tone.h,
    l: tone.l - 0.008 * colorfulness,
  };
}

export function vectorTone(tone: Tone): Tone {
  if (tone.c < 0.04) return tone;
  const colorfulness = Math.min(1, (tone.c - 0.04) / 0.12);
  return {
    c: tone.c * 1.28 + 0.012 * colorfulness,
    h: tone.h,
    l: tone.l - 0.006 * colorfulness,
  };
}
