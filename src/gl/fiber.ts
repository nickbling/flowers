import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RedFormat,
  RGBAFormat,
} from "three";
import { between, createRng, intBetween, type Rng } from "@/src/shared/prng";

const TEXTURE_SIZE = 384;

const clamp = (value: number): number => Math.min(1, Math.max(0, value));

function addGrooves(
  field: Float32Array,
  random: Rng,
  perFlank: number,
  reach: number,
  spread: number,
  strength: number,
  radius: number,
  textureWidth: number,
  textureHeight: number
): void {
  for (const side of [1, -1] as const) {
    for (const grooveIndex of Array(perFlank).keys()) {
      const groove = grooveIndex + 1;
      const end = Math.min(0.9, reach * between(random, 0.78, 1.06));
      const fraction =
        (spread * (groove - between(random, 0, 0.35))) / (perFlank + 0.5);
      const channelRadius = radius * between(random, 0.82, 1.18);
      const channelStrength = strength * between(random, 0.82, 1.12);
      const meander = between(random, -0.012, 0.012);
      const meanderPhase = between(random, 0, 2 * Math.PI);

      for (const sample of Array(193).keys()) {
        const phase = sample / 192;
        const opening = clamp(phase / 0.08);
        const closing = clamp((1 - phase) / 0.18);
        const envelope =
          opening *
          opening *
          (3 - 2 * opening) *
          closing *
          closing *
          (3 - 2 * closing);
        const along = 0.05 + (end - 0.05) * phase;
        const across =
          side * fraction ** 0.85 * Math.max(0, along / end) ** 0.6 +
          meander * Math.sin(2 * Math.PI * phase + meanderPhase) * envelope;
        const localRadius = channelRadius * (0.5 + 0.5 * Math.sqrt(envelope));
        const localStrength =
          channelStrength *
          envelope *
          (0.92 + 0.08 * Math.sin(3 * Math.PI * phase + meanderPhase));
        const centerX = ((across + 1) / 2) * (textureWidth - 1);
        const centerY = along * (textureHeight - 1);
        const fromX = Math.max(0, Math.floor(centerX - 3 * localRadius));
        const toX = Math.min(
          textureWidth - 1,
          Math.ceil(centerX + 3 * localRadius)
        );
        const fromY = Math.max(0, Math.floor(centerY - 3 * localRadius));
        const toY = Math.min(
          textureHeight - 1,
          Math.ceil(centerY + 3 * localRadius)
        );

        for (const yOffset of Array(toY - fromY + 1).keys()) {
          const y = fromY + yOffset;
          for (const xOffset of Array(toX - fromX + 1).keys()) {
            const x = fromX + xOffset;
            const distance =
              ((x - centerX) ** 2 + (y - centerY) ** 2) /
              (localRadius * localRadius);
            const at = y * textureWidth + x;
            field[at] = Math.min(
              1,
              field[at] + localStrength * Math.exp(-distance)
            );
          }
        }
      }
    }
  }
}

export function createFiberTexture(
  seed: string,
  {
    grooves = true,
    microGrain = false,
  }: Readonly<{ grooves?: boolean; microGrain?: boolean }> = {}
): DataTexture {
  const random = createRng(`${seed}|lamina-relief`);
  const textureWidth = TEXTURE_SIZE;
  const textureHeight = microGrain ? 2 * TEXTURE_SIZE : TEXTURE_SIZE;
  const field = new Float32Array(textureWidth * textureHeight);
  if (grooves)
    addGrooves(
      field,
      random,
      intBetween(random, 3, 4),
      0.88,
      0.96,
      0.07,
      2.8,
      textureWidth,
      textureHeight
    );

  const rawGrain = Float32Array.from({ length: field.length }, () =>
    between(random, -1, 1)
  );
  const coarseWidth = textureWidth / 2;
  const coarseHeight = textureHeight / 2;
  const coarseGrain = microGrain
    ? Float32Array.from({ length: coarseWidth * coarseHeight }, () =>
        between(random, -1, 1)
      )
    : undefined;
  const coarseAt = (x: number, y: number): number =>
    coarseGrain?.[
      Math.min(coarseHeight - 1, Math.max(0, y)) * coarseWidth +
        Math.min(coarseWidth - 1, Math.max(0, x))
    ] ?? 0;
  const data = new Uint8Array(field.length);
  for (const index of data.keys()) {
    const x = index % textureWidth;
    const y = Math.floor(index / textureWidth);
    const left = index - (x > 0 ? 1 : 0);
    const right = index + (x < textureWidth - 1 ? 1 : 0);
    const above = index - (y > 0 ? textureWidth : 0);
    const below = index + (y < textureHeight - 1 ? textureWidth : 0);
    const smoothGrain =
      (4 * rawGrain[index] +
        rawGrain[left] +
        rawGrain[right] +
        rawGrain[above] +
        rawGrain[below]) /
      8;
    const coarseX = (x * (coarseWidth - 1)) / (textureWidth - 1);
    const coarseY = (y * (coarseHeight - 1)) / (textureHeight - 1);
    const coarseFloorX = Math.floor(coarseX);
    const coarseFloorY = Math.floor(coarseY);
    const coarseMixX = coarseX - coarseFloorX;
    const coarseMixY = coarseY - coarseFloorY;
    const coarse =
      (1 - coarseMixY) *
        ((1 - coarseMixX) * coarseAt(coarseFloorX, coarseFloorY) +
          coarseMixX * coarseAt(coarseFloorX + 1, coarseFloorY)) +
      coarseMixY *
        ((1 - coarseMixX) * coarseAt(coarseFloorX, coarseFloorY + 1) +
          coarseMixX * coarseAt(coarseFloorX + 1, coarseFloorY + 1));
    const grain = microGrain
      ? 0.045 * coarse + 0.035 * smoothGrain + 0.01 * rawGrain[index]
      : 0.007 * smoothGrain + 0.0015 * rawGrain[index];
    const height = clamp(0.975 - 0.035 * field[index] + grain);
    data[index] = Math.round(255 * height);
  }

  const texture = new DataTexture(data, textureWidth, textureHeight, RedFormat);
  texture.generateMipmaps = true;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export function createFiberNormalTexture(source: DataTexture): DataTexture {
  const { data, height, width } = source.image;
  if (!(data instanceof Uint8Array))
    throw new TypeError("fiber texture must contain byte data");

  const rgba = new Uint8Array(width * height * 4);
  const sample = (x: number, y: number) =>
    data[
      Math.min(height - 1, Math.max(0, y)) * width +
        Math.min(width - 1, Math.max(0, x))
    ] / 255;
  for (const y of Array(height).keys()) {
    for (const x of Array(width).keys()) {
      const dx = 2.5 * (sample(x + 1, y) - sample(x - 1, y));
      const dy = 2.5 * (sample(x, y + 1) - sample(x, y - 1));
      const length = Math.hypot(dx, dy, 1);
      const at = 4 * (y * width + x);
      rgba[at] = Math.round(127.5 * (1 - dx / length));
      rgba[at + 1] = Math.round(127.5 * (1 - dy / length));
      rgba[at + 2] = Math.round(127.5 * (1 + 1 / length));
      rgba[at + 3] = 255;
    }
  }

  const texture = new DataTexture(rgba, width, height, RGBAFormat);
  texture.generateMipmaps = true;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.needsUpdate = true;
  return texture;
}
