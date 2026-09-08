import type { Genome } from "@/src/plumeria/genome";
import { marginBand, type PetalForm, veinsPath } from "@/src/plumeria/petal";
import { throatExtent } from "@/src/plumeria/pigment";
import type { PlumeriaLivery } from "@/src/plumeria/specimen";
import { between, createRng, intBetween } from "@/src/shared/prng";

/** Once-only SVG paint sampling, retaining the historical conditional draw order. */
export function preparePetalPaint(
  seed: string,
  form: PetalForm,
  genome: Genome,
  livery: PlumeriaLivery
) {
  const rng = createRng(`${seed}|petal-paint`);
  // veinsPath consumed two draws per vein on each of two flanks. Removed
  // embossed layers still reserve these draws so blush and sheen do not move.
  const reserveVeins = (count: number) => {
    for (let i = 0; i < 4 * count; i += 1) rng();
  };
  const flameSeed = intBetween(rng, 1, 999999);
  const flameScale = between(rng, 0.85, 1.15) * (8 + 14 * genome.throat.flame);
  const flameRadius =
    ((throatExtent(genome.throat.reach) * form.length) / 1.28) *
    between(rng, 0.98, 1.02);
  if (genome.throat.rays > 0.05) reserveVeins(intBetween(rng, 2, 3));
  if (genome.veins.strength > 0.05) reserveVeins(intBetween(rng, 4, 5));
  reserveVeins(2);
  reserveVeins(2);
  const margin =
    genome.margin.strength > 0.05
      ? marginBand(form, rng, genome.margin.strength)
      : "";
  const fibers = veinsPath(form, rng, intBetween(rng, 6, 8), 0.92, 1);
  reserveVeins(intBetween(rng, 3, 4));
  const haloRadius =
    genome.throat.reach * form.length * between(rng, 0.96, 1.05);
  const haloWidth = livery.halo && haloRadius > 0 ? between(rng, 8, 13) : 0;
  if (livery.stripeVisible) {
    rng(); // center
    rng(); // width
    rng(); // length
    rng(); // opacity
  }
  const blushAlong = Math.min(0.92, genome.blush.at * between(rng, 0.92, 1.08));
  const blushRadius =
    form.length *
    (0.16 + 0.14 * genome.blush.strength) *
    between(rng, 0.9, 1.1);
  const sheenWidth = between(rng, 0.85, 1.1);
  const sheenHeight = between(rng, 0.85, 1.1);
  const blushAspect = between(rng, 0.55, 0.8);
  return Object.freeze({
    flameSeed,
    flameScale,
    flameRadius,
    fibers,
    margin,
    haloRadius,
    haloWidth,
    blushAlong,
    blushRadius,
    sheenWidth,
    sheenHeight,
    blushAspect,
  });
}
