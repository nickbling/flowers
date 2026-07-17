import type { JsonValue } from "@/src/core/json";

type IdentityGenome = Readonly<{
  cultivar: Readonly<{ id: string; revision: number; value: unknown }>;
  engineVersion: number;
  environment: object;
  format: string;
  formatVersion: number;
  seed: string;
  species: Readonly<{ id: string; revision: number }>;
  traits: unknown;
}>;

export function flowerGenomeIdentity(genome: IdentityGenome): JsonValue {
  return {
    cultivar: {
      id: genome.cultivar.id,
      revision: genome.cultivar.revision,
      value: genome.cultivar.value,
    },
    engineVersion: genome.engineVersion,
    environment: genome.environment,
    format: genome.format,
    formatVersion: genome.formatVersion,
    seed: genome.seed,
    species: {
      id: genome.species.id,
      revision: genome.species.revision,
    },
    traits: genome.traits,
  } as JsonValue;
}
