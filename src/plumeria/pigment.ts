import type { Genome } from "@/src/plumeria/genome";
import {
  type PigmentMark,
  pigmentMarkSection,
  pigmentSectionWeight,
  preparePigmentMarks,
} from "@/src/plumeria/markings";
import type { PlumeriaLivery } from "@/src/plumeria/specimen";
import { mixTone, type Tone } from "@/src/shared/color";

const clamp = (value: number): number => Math.min(1, Math.max(0, value));

// Preserve the cultivar ordering while mapping throat reach to petal length.
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
  across: number
): number {
  const poolExtent = throatExtent(reach);
  const edge = clamp((along - 0.06 * poolExtent) / (0.94 * poolExtent));
  const pool = 1 - edge * edge * (3 - 2 * edge);
  const rayExtent = throatRayExtent(reach, rays);
  const rayProgress = clamp(along / rayExtent);
  const rayFade = 1 - rayProgress * rayProgress * (3 - 2 * rayProgress);
  const ray = rayFade * Math.max(0, 1 - across * across) ** 0.78;
  return 1 - (1 - pool) * (1 - ray);
}

export function pigmentMarkTone(
  genome: Genome,
  kind: PigmentMark["kind"]
): Tone {
  if (kind === "vein") return genome.veins.tone;
  if (kind === "stripe")
    return {
      c: genome.margin.tone.c + 0.025,
      h: genome.margin.tone.h,
      l: genome.margin.tone.l,
    };
  return {
    c: genome.throat.tone.c + 0.04,
    h: genome.throat.tone.h - 12 * genome.throat.flame,
    l: genome.throat.tone.l,
  };
}

/** Prepare specimen-invariant colors and landmarks once, outside vertex sampling. */
export function preparePlumeriaPigment(
  genome: Genome,
  livery: PlumeriaLivery,
  marks = preparePigmentMarks("", genome, livery)
) {
  const base = ivoryTone(genome.body.base);
  const tip = ivoryTone(genome.body.tip);
  const tones = {
    ray: pigmentMarkTone(genome, "ray"),
    vein: pigmentMarkTone(genome, "vein"),
    stripe: pigmentMarkTone(genome, "stripe"),
  };
  const secondary =
    livery.blush2Mix === null
      ? null
      : mixTone(genome.body.tip, genome.throat.tone, livery.blush2Mix);
  const haloTone = mixTone(genome.throat.tone, genome.margin.tone, 0.55);
  return (along: number) => {
    const body = mixTone(base, tip, along);
    const sections = marks
      .filter((mark) => along > mark.from && along < mark.to)
      .map((mark) => ({
        ...pigmentMarkSection(mark, along),
        kind: mark.kind,
        opacity: mark.opacity,
      }));
    return (across: number, cell?: readonly [number, number]): Tone => {
      const side = Math.abs(across);
      let tone = mixTone(
        body,
        genome.throat.tone,
        throatWeight(genome.throat.reach, genome.throat.rays, along, across)
      );

      for (const kind of ["ray", "vein"] as const) {
        let weight = 0;
        for (const mark of sections)
          if (mark.kind === kind)
            weight = Math.max(
              weight,
              mark.opacity * pigmentSectionWeight(mark, across, cell)
            );
        tone = mixTone(tone, tones[kind], weight);
      }

      const blush =
        0.5 *
        genome.blush.strength *
        Math.exp(-(((along - genome.blush.at) / 0.16) ** 2)) *
        Math.exp(-((side / 0.65) ** 2));
      tone = mixTone(tone, genome.blush.tone, clamp(blush));

      if (secondary) {
        const strength =
          livery.blush2Opacity *
          Math.exp(-(((along - livery.blush2At) / livery.blush2Width) ** 2)) *
          Math.max(0, 1 - 0.7 * side * side);
        tone = mixTone(tone, secondary, strength);
      }

      if (livery.halo > 0) {
        const center = Math.min(0.82, 0.92 * genome.throat.reach);
        const band = Math.exp(-(((along - center) / 0.065) ** 2));
        // A local color wash, not a ring of baked shade across the flower.
        tone = mixTone(
          tone,
          { ...haloTone, l: tone.l },
          Math.min(0.3, 1.25 * livery.halo * band)
        );
      }

      for (const mark of sections)
        if (mark.kind === "stripe")
          tone = mixTone(
            tone,
            tones.stripe,
            mark.opacity * pigmentSectionWeight(mark, across, cell)
          );

      const rim = Math.min(1, side ** 8 + along ** 18);
      const feather = Math.min(1, side ** 3.5 + along ** 12);
      const margin =
        (0.75 * rim + 0.25 * feather) *
        (0.2 + 0.8 * clamp((along - 0.25) / 0.7));
      return mixTone(
        tone,
        genome.margin.tone,
        Math.min(0.6, 0.95 * genome.margin.strength * margin)
      );
    };
  };
}

export function evaluatePlumeriaPigment(
  genome: Genome,
  livery: PlumeriaLivery,
  along: number,
  across: number
): Tone {
  return preparePlumeriaPigment(genome, livery)(along)(across);
}

export function bodyPaleness(tone: Tone): number {
  return Math.max(0, Math.min(1, (tone.l - 0.8) / 0.14));
}

// Add vector contrast without changing hue or graying white cultivars.
export function gradeVectorHex(hex: string, pale: number): string {
  const saturation = 1.13 + 0.045 * (1 - pale);
  const contrast = 1.07 + 0.04 * (1 - pale);
  const rgb = [1, 3, 5].map(
    (index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255
  );
  const luma = 0.213 * rgb[0] + 0.715 * rgb[1] + 0.072 * rgb[2];
  const channel = (value: number) => {
    const saturated = luma + (value - luma) * saturation;
    const contrasted = 0.5 + (saturated - 0.5) * contrast;
    const graded = Math.min(1, Math.max(0, contrasted)) ** 0.97;
    return Math.round(graded * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${rgb.map(channel).join("")}`;
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
    c: tone.c * (1 + 0.48 * colorfulness) + 0.02 * colorfulness,
    h: tone.h,
    l: Math.min(0.985, tone.l + 0.006 * colorfulness),
  };
}

export function vectorTone(tone: Tone): Tone {
  if (tone.c < 0.04) return tone;
  const colorfulness = Math.min(1, (tone.c - 0.04) / 0.12);
  return {
    c: tone.c * (1 + 0.28 * colorfulness) + 0.012 * colorfulness,
    h: tone.h,
    l: tone.l - 0.006 * colorfulness,
  };
}
