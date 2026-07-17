// xmur3 gives sfc32 a platform-stable 128-bit state for each seed.

export type Rng = () => number;

function xmur3(input: string) {
  let h = 1779033703 ^ input.length;

  for (let index = 0; index < input.length; index += 1) {
    h = Math.imul(h ^ input.charCodeAt(index), 3432918353);
    h = (h << 13) | (h >>> 19);
  }

  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function sfc32(s1: number, s2: number, s3: number, s4: number): Rng {
  let a = s1 >>> 0;
  let b = s2 >>> 0;
  let c = s3 >>> 0;
  let d = s4 >>> 0;

  return () => {
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

export function createRng(seed: string): Rng {
  const next = xmur3(seed);
  const rng = sfc32(next(), next(), next(), next());

  // Warm up sfc32 to reduce correlation between nearby xmur3 states.
  for (let index = 0; index < 12; index += 1) rng();

  return rng;
}

export function between(rng: Rng, min: number, max: number): number {
  return min + (max - min) * rng();
}

export function intBetween(rng: Rng, min: number, max: number): number {
  return Math.floor(between(rng, min, max + 1));
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}
