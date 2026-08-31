import { deepFreeze, jsonFingerprint } from "@/src/core/json";
import type { PlumeriaCultivar } from "@/src/plumeria/cultivar";
import { type Genome, sampleGenome } from "@/src/plumeria/genome";
import {
  type CorollaFrame,
  corollaFrame,
  type PetalForm,
  petalForm,
} from "@/src/plumeria/petal";
import {
  type PlumeriaVariant,
  resolvePlumeriaVariant,
} from "@/src/plumeria/variants";
import { between, createRng } from "@/src/shared/prng";

export const PLUMERIA_PETAL_COUNT = 5;
export const PLUMERIA_VIEWBOX = 480;

export type PlumeriaLivery = Readonly<{
  blush2At: number;
  blush2Mix: number | null;
  blush2Opacity: number;
  blush2Width: number;
  halo: number;
  stripeSide: number;
  stripeVisible: boolean;
}>;

export type PlumeriaSpecimen = Readonly<{
  form: PetalForm;
  frame: CorollaFrame;
  genome: Genome;
  livery: PlumeriaLivery;
  uid: string;
}>;

function selectedGenome(
  seed: string,
  moon: number,
  custom?: PlumeriaCultivar,
  requestedVariant?: PlumeriaVariant
): Genome {
  if (custom && requestedVariant)
    throw new TypeError("plumeria cultivar and variant are mutually exclusive");
  const variant = requestedVariant
    ? resolvePlumeriaVariant(requestedVariant)
    : undefined;
  return sampleGenome(createRng(seed), moon, custom, variant);
}

function sampleLivery(seed: string): PlumeriaLivery {
  const random = createRng(`${seed}\0plumeria/livery`);
  const halo = random() < 0.4 ? between(random, 0.12, 0.22) : 0;
  const stripeVisible = random() < 0.081;
  const blush2Mix = random() < 0.45 ? between(random, 0.3, 0.7) : null;
  return {
    blush2At: between(random, 0.35, 0.7),
    blush2Mix,
    blush2Opacity: between(random, 0.1, 0.2),
    blush2Width: between(random, 0.14, 0.22),
    halo,
    stripeSide: between(random, -0.6, 0.6),
    stripeVisible,
  };
}

export function plumeriaCultivarName(
  seed: string,
  custom?: PlumeriaCultivar,
  variant?: PlumeriaVariant
): string {
  return selectedGenome(seed, 0, custom, variant).cultivar;
}

export function growPlumeria(
  seed: string,
  moon = 0,
  custom?: PlumeriaCultivar,
  variant?: PlumeriaVariant
): PlumeriaSpecimen {
  if (!seed) throw new TypeError("seed must not be empty");
  const genome = selectedGenome(seed, moon, custom, variant);
  const form = petalForm(genome.form, createRng(`${seed}\0plumeria/form`));
  const frame = corollaFrame(form);
  const livery = sampleLivery(seed);
  const { cultivar: _displayName, ...visualGenome } = genome;
  const uid = jsonFingerprint({ form, genome: visualGenome, livery });
  return deepFreeze({ form, frame, genome, livery, uid });
}
