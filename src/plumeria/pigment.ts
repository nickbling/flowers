import type { Tone } from "@/src/shared/color";

// Preserve the cultivar ordering while mapping throat reach to petal length.
export function throatExtent(reach: number): number {
  return Math.min(0.98, 0.16 + reach);
}

export function throatRayExtent(reach: number, rays: number): number {
  return Math.min(0.98, throatExtent(reach) + 0.22 * rays);
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
