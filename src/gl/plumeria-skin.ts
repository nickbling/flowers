import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  RGBAFormat,
} from "three";
import { createRng } from "@/src/shared/prng";

export function createPlumeriaSkin(seed: string): DataTexture {
  const size = 384;
  const random = createRng(seed);
  let field = Float32Array.from({ length: size * size }, () => random() - 0.5);
  // Periodic Gaussian filtering bounds the grain bandwidth in rest-space.
  const weights = [1, 4, 6, 4, 1];
  for (const axis of [0, 1]) {
    const filtered = new Float32Array(field.length);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        for (let k = -2; k <= 2; k += 1) {
          const u = (x + (axis === 0 ? k : 0) + size) % size;
          const v = (y + (axis === 1 ? k : 0) + size) % size;
          filtered[y * size + x] += (field[v * size + u] * weights[k + 2]) / 16;
        }
      }
    }
    field = filtered;
  }
  const slopes = new Float32Array(2 * field.length);
  let squared = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const at = y * size + x;
      const dx =
        field[y * size + ((x + 1) % size)] -
        field[y * size + ((x + size - 1) % size)];
      const dy =
        field[((y + 1) % size) * size + x] -
        field[((y + size - 1) % size) * size + x];
      slopes[2 * at] = dx;
      slopes[2 * at + 1] = dy;
      squared += dx * dx + dy * dy;
    }
  }
  const scale = 0.035 / Math.sqrt(squared / field.length);
  const data = new Uint8Array(4 * field.length);
  for (let at = 0; at < field.length; at += 1) {
    const dx = slopes[2 * at] * scale;
    const dy = slopes[2 * at + 1] * scale;
    const bounded = Math.min(1, 0.19 / (Math.hypot(dx, dy) || 1));
    const length = Math.hypot(dx * bounded, dy * bounded, 1);
    data[4 * at] = Math.round(127.5 * (1 - (dx * bounded) / length));
    data[4 * at + 1] = Math.round(127.5 * (1 - (dy * bounded) / length));
    data[4 * at + 2] = Math.round(127.5 * (1 + 1 / length));
    data[4 * at + 3] = 255;
  }
  const texture = new DataTexture(data, size, size, RGBAFormat);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.channel = 1;
  texture.repeat.set(2, 2);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
