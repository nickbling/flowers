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
import { between, createRng, intBetween } from "@/src/shared/prng";

export type PlumeriaSpecimen = Readonly<{
  form: PetalForm;
  frame: CorollaFrame;
  genome: Genome;
  uid: string;
}>;

export type Sprout = PlumeriaSpecimen & {
  baseFrequency: number;
  blush2At: number;
  blush2Mix: number | null;
  blush2Opacity: number;
  blush2Width: number;
  flowSeed: number;
  grainSeed: number;
  halo: number;
  stripeSide: number;
  stripeVisible: boolean;
};

function germinate(
  seed: string,
  moon: number,
  custom?: PlumeriaCultivar,
  requestedVariant?: PlumeriaVariant,
  idPrefix?: string
) {
  if (custom && requestedVariant)
    throw new TypeError("plumeria cultivar and variant are mutually exclusive");
  const variant = requestedVariant
    ? resolvePlumeriaVariant(requestedVariant)
    : undefined;
  const rng = createRng(seed);
  const flowerId = Math.floor(rng() * 1e9).toString(36);
  const namespaceRng = createRng(`${seed}\u0000plumeria-svg-id`);
  const namespaceId = [namespaceRng(), namespaceRng()]
    .map((value) => Math.floor(value * 1e9).toString(36))
    .join("");
  const cultivarId = custom
    ? jsonFingerprint(custom.recipe)
    : variant
      ? jsonFingerprint(variant.id)
      : "builtins";
  // Moon exposure changes paint and therefore belongs to the SVG namespace.
  const moonId = Math.round(moon * 1_000_000).toString(36);
  const uid = `${idPrefix ? `${idPrefix}-` : ""}${flowerId}${namespaceId}${cultivarId}m${moonId}`;
  const genome = sampleGenome(rng, moon, custom, variant);
  return { genome, rng, uid };
}

export function plumeriaCultivarName(
  seed: string,
  custom?: PlumeriaCultivar,
  variant?: PlumeriaVariant
): string {
  const rng = createRng(seed);
  rng();
  return sampleGenome(rng, 0, custom, variant).cultivar;
}

export function sprout(
  seed: string,
  moon = 0,
  custom?: PlumeriaCultivar,
  idPrefix?: string,
  variant?: PlumeriaVariant
): Sprout {
  const { genome, rng, uid } = germinate(seed, moon, custom, variant, idPrefix);
  const baseFrequency = Math.round(between(rng, 0.008, 0.014) * 1e4) / 1e4;
  const flowSeed = intBetween(rng, 1, 999999);
  const halo = rng() < 0.4 ? between(rng, 0.12, 0.22) : 0;
  const stripy = rng() < 0.18;
  const blush2Mix = rng() < 0.45 ? between(rng, 0.3, 0.7) : null;
  // The reserved draw is part of the seed-to-specimen contract.
  rng();
  const grainSeed = intBetween(rng, 1, 999999);
  const liveryRng = createRng(`${seed}|livery`);
  const stripeVisible = stripy && liveryRng() < 0.45;
  const stripeSide = between(liveryRng, -0.6, 0.6);
  const blush2At = between(liveryRng, 0.35, 0.7);
  const blush2Width = between(liveryRng, 0.14, 0.22);
  const blush2Opacity = between(liveryRng, 0.1, 0.2);
  const form = petalForm(genome.form, rng);
  const frame = corollaFrame(form);
  return {
    baseFrequency,
    blush2At,
    blush2Mix,
    blush2Opacity,
    blush2Width,
    flowSeed,
    form,
    frame,
    genome,
    grainSeed,
    halo,
    stripeSide,
    stripeVisible,
    uid,
  };
}

export function growPlumeria(
  seed: string,
  moon = 0,
  custom?: PlumeriaCultivar,
  variant?: PlumeriaVariant
): PlumeriaSpecimen {
  const { form, frame, genome, uid } = sprout(
    seed,
    moon,
    custom,
    undefined,
    variant
  );
  return deepFreeze({ form, frame, genome, uid });
}
