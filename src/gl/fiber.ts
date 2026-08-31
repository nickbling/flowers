import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RedFormat,
} from "three";
import { between, createRng } from "@/src/shared/prng";

export function createFiberTexture(seed: string): DataTexture {
  const size = 192;
  const random = createRng(`${seed}/tissue`);
  const spacedOffsets = (count: number, minimum: number, maximum: number) => {
    const gaps = Array.from({ length: count }, () =>
      between(random, minimum, maximum)
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
  const fibers = [
    ...spacedOffsets(10, 0.5, 1.8).map((offset) => ({
      breathe: between(random, 0.35, 0.9),
      breathePhase: between(random, 0, 2 * Math.PI),
      depth: between(random, 0.035, 0.075),
      end: between(random, 0.8, 1),
      frequency: between(random, 0.25, 0.8),
      meander: between(random, 1.3, 4.2),
      offset,
      phase: between(random, 0, 2 * Math.PI),
      start: between(random, 0, 0.2),
      width: between(random, 3, 6.5),
    })),
    ...spacedOffsets(52, 0.3, 1.9).map((offset) => ({
      breathe: between(random, 0.5, 1.7),
      breathePhase: between(random, 0, 2 * Math.PI),
      depth: between(random, 0.055, 0.15),
      end: between(random, 0.66, 1),
      frequency: between(random, 0.45, 1.6),
      meander: between(random, 0.45, 2.3),
      offset,
      phase: between(random, 0, 2 * Math.PI),
      start: between(random, 0, 0.3),
      width: between(random, 0.55, 1.45),
    })),
  ];
  const data = new Uint8Array(size * size);
  const row = new Float32Array(size);
  for (let y = 0; y < size; y += 1) {
    const progress = y / (size - 1);
    const fade =
      Math.min(1, Math.max(0, (progress - 0.035) / 0.13)) *
      Math.min(1, Math.max(0, (0.995 - progress) / 0.065));
    const spread = 0.62 + 0.38 * progress;
    row.fill(0);
    for (const fiber of fibers) {
      if (progress < fiber.start || progress > fiber.end) continue;
      const span = (progress - fiber.start) / (fiber.end - fiber.start);
      const ends = Math.min(1, 6 * span * (1 - span));
      const breath =
        0.78 +
        0.22 *
          Math.sin(2 * Math.PI * progress * fiber.breathe + fiber.breathePhase);
      const center =
        size * (0.5 + fiber.offset * spread) +
        fiber.meander *
          Math.sin(2 * Math.PI * progress * fiber.frequency + fiber.phase);
      const from = Math.max(0, Math.floor(center - 3 * fiber.width));
      const to = Math.min(size - 1, Math.ceil(center + 3 * fiber.width));
      for (let x = from; x <= to; x += 1)
        row[x] +=
          fiber.depth *
          ends *
          breath *
          Math.exp(-(((x - center) / fiber.width) ** 2));
    }
    for (let x = 0; x < size; x += 1)
      data[y * size + x] = Math.round(
        255 * (1 - Math.min(0.52, row[x] * fade))
      );
  }
  const texture = new DataTexture(data, size, size, RedFormat);
  texture.generateMipmaps = true;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.needsUpdate = true;
  return texture;
}
