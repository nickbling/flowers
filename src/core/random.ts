import { canonicalJson, cloneJson, type JsonValue } from "@/src/core/json";
import { createRng } from "@/src/shared/prng";

export type GenomeRandom = Readonly<{
  chance(path: string, probability: number): boolean;
  integer(path: string, minimum: number, maximum: number): number;
  pick<T extends JsonValue>(path: string, values: readonly T[]): T;
  range(path: string, minimum: number, maximum: number): number;
  scope(path: string): GenomeRandom;
  unit(path: string): number;
}>;

type RandomOptions = Readonly<{
  namespace: string;
  seed: string;
}>;

const PATH = /^[a-z][a-z0-9]*(?:[._/-][a-z0-9]+)*$/;

function assertPath(path: string): void {
  if (!PATH.test(path))
    throw new TypeError(
      `random path ${JSON.stringify(path)} must be a stable semantic path`
    );
}

export function createGenomeRandom({
  namespace,
  seed,
}: RandomOptions): GenomeRandom {
  if (!namespace.trim())
    throw new TypeError("random namespace must not be empty");
  const uses = new Map<string, string>();

  const draw = (path: string, signature: string): number => {
    assertPath(path);
    const previous = uses.get(path);
    if (previous && previous !== signature)
      throw new Error(
        `random path ${JSON.stringify(path)} was reused as ${signature}; it already means ${previous}`
      );
    uses.set(path, signature);
    return createRng(`${namespace}\u0000${seed}\u0000${path}`)();
  };

  const api = (prefix = ""): GenomeRandom => {
    const qualify = (path: string) => (prefix ? `${prefix}.${path}` : path);
    return Object.freeze({
      chance(path, probability) {
        if (!Number.isFinite(probability) || probability < 0 || probability > 1)
          throw new RangeError("probability must be from 0 to 1");
        return draw(qualify(path), `chance:${probability}`) < probability;
      },
      integer(path, minimum, maximum) {
        if (
          !Number.isSafeInteger(minimum) ||
          !Number.isSafeInteger(maximum) ||
          minimum > maximum
        )
          throw new RangeError("integer bounds must be ordered safe integers");
        return Math.min(
          maximum,
          minimum +
            Math.floor(
              draw(qualify(path), `integer:${minimum}:${maximum}`) *
                (maximum - minimum + 1)
            )
        );
      },
      pick<T extends JsonValue>(path: string, values: readonly T[]): T {
        if (values.length === 0)
          throw new RangeError("pick values must not be empty");
        return cloneJson(
          values[
            Math.min(
              values.length - 1,
              Math.floor(
                draw(qualify(path), `pick:${canonicalJson(values)}`) *
                  values.length
              )
            )
          ]
        );
      },
      range(path, minimum, maximum) {
        if (
          !Number.isFinite(minimum) ||
          !Number.isFinite(maximum) ||
          minimum > maximum
        )
          throw new RangeError("range bounds must be ordered finite numbers");
        const amount = draw(qualify(path), `range:${minimum}:${maximum}`);
        if (minimum === maximum) return minimum;
        // Subtracting opposite-sign extremes can overflow even though both
        // bounds and every mathematical result are finite.
        return minimum < 0 && maximum > 0
          ? minimum * (1 - amount) + maximum * amount
          : minimum + amount * (maximum - minimum);
      },
      scope(path) {
        assertPath(path);
        return api(qualify(path));
      },
      unit(path) {
        return draw(qualify(path), "unit");
      },
    });
  };

  return api();
}
