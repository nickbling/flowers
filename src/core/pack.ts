import {
  develop as developSpecies,
  type FlowerGenome,
  type FlowerSpecimen,
  type SpeciesDefinition,
} from "@/src/core/species";

export type AnySpecies = Readonly<{
  format: "@nbot/flower-species";
  formatVersion: 1;
  id: string;
  name: string;
  revision: number;
}>;

type PackableSpecies = SpeciesDefinition<unknown, unknown, object>;

export type FlowerPack<
  Species extends readonly AnySpecies[] = readonly AnySpecies[],
> = Readonly<{
  format: "@nbot/flower-pack";
  formatVersion: 1;
  id: string;
  species: Species;
}>;

export type FlowerPackOptions<Species extends readonly AnySpecies[]> =
  Readonly<{
    id: string;
    species: Species;
  }>;

export type SpeciesReference = Readonly<{
  id: string;
  revision: number;
}>;

export type FlowerCatalog = Readonly<{
  develop(genome: unknown): FlowerSpecimen;
  packs: readonly FlowerPack[];
  resolve(reference: SpeciesReference): AnySpecies | undefined;
  species: readonly AnySpecies[];
}>;

const PACKAGE_ID = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const RESERVED_PACKAGE_IDS = new Set(["favicon.ico", "node_modules"]);
const SPECIES_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

const restoreSpecies = developSpecies as unknown as (
  species: PackableSpecies,
  genome: FlowerGenome<unknown, object>
) => FlowerSpecimen;

function versionKey(reference: SpeciesReference): string {
  return `${reference.id}\u0000${reference.revision}`;
}

function genomeReference(genome: unknown): SpeciesReference {
  if (!genome || typeof genome !== "object" || !("species" in genome))
    throw new TypeError("genome must contain a species reference");
  const { species } = genome;
  if (
    !species ||
    typeof species !== "object" ||
    !("id" in species) ||
    typeof species.id !== "string" ||
    !("revision" in species) ||
    typeof species.revision !== "number" ||
    !Number.isSafeInteger(species.revision)
  )
    throw new TypeError("genome must contain a valid species reference");
  return { id: species.id, revision: Number(species.revision) };
}

export function defineFlowerPack<
  const Species extends readonly PackableSpecies[],
>(options: FlowerPackOptions<Species>): FlowerPack<Species> {
  if (
    !PACKAGE_ID.test(options.id) ||
    options.id.length > 214 ||
    RESERVED_PACKAGE_IDS.has(options.id)
  )
    throw new TypeError("flower pack id must be an npm package name");
  if (options.species.length === 0)
    throw new RangeError("flower pack needs at least one species");
  const prefix = `${options.id}:`;
  const versions = new Set<string>();
  for (const species of options.species) {
    if (
      species.format !== "@nbot/flower-species" ||
      species.formatVersion !== 1
    )
      throw new TypeError("flower pack contains an unsupported species");
    if (
      typeof species.sample !== "function" ||
      typeof species.develop !== "function"
    )
      throw new TypeError("flower pack contains an incomplete species");
    if (!species.id.startsWith(prefix))
      throw new TypeError(`species id must start with ${prefix}`);
    if (!SPECIES_NAME.test(species.id.slice(prefix.length)))
      throw new TypeError(
        "flower pack species name must be lowercase kebab-case"
      );
    if (!Number.isSafeInteger(species.revision) || species.revision < 1)
      throw new RangeError(
        "flower pack species revision must be a positive safe integer"
      );
    if (typeof species.name !== "string" || !species.name.trim())
      throw new TypeError("flower pack species name must not be empty");
    if (!Object.isFrozen(species))
      throw new TypeError(
        "flower pack species must be created with defineSpecies"
      );
    const key = versionKey(species);
    if (versions.has(key))
      throw new Error(
        `flower pack contains ${species.id}/${species.revision} more than once`
      );
    versions.add(key);
  }
  return Object.freeze({
    format: "@nbot/flower-pack" as const,
    formatVersion: 1 as const,
    id: options.id,
    species: Object.freeze([...options.species]) as unknown as Species,
  });
}

export function createFlowerCatalog(
  packs: readonly FlowerPack[]
): FlowerCatalog {
  const packIds = new Set<string>();
  const normalizedPacks: FlowerPack[] = [];
  const versions = new Map<string, PackableSpecies>();
  const descriptors = new Map<string, AnySpecies>();
  const species: AnySpecies[] = [];
  for (const input of packs) {
    if (input.format !== "@nbot/flower-pack" || input.formatVersion !== 1)
      throw new TypeError("catalog contains an unsupported flower pack");
    const pack = defineFlowerPack({
      id: input.id,
      species: input.species as readonly PackableSpecies[],
    });
    if (packIds.has(pack.id))
      throw new Error(`catalog contains flower pack ${pack.id} more than once`);
    packIds.add(pack.id);
    const packSpecies: AnySpecies[] = [];
    for (const definition of pack.species) {
      const key = versionKey(definition);
      if (versions.has(key))
        throw new Error(
          `catalog contains ${definition.id}/${definition.revision} more than once`
        );
      versions.set(key, definition);
      const descriptor = Object.freeze({
        format: definition.format,
        formatVersion: definition.formatVersion,
        id: definition.id,
        name: definition.name,
        revision: definition.revision,
      });
      descriptors.set(key, descriptor);
      packSpecies.push(descriptor);
      species.push(descriptor);
    }
    normalizedPacks.push(
      Object.freeze({
        format: pack.format,
        formatVersion: pack.formatVersion,
        id: pack.id,
        species: Object.freeze(packSpecies),
      })
    );
  }
  const frozenPacks = Object.freeze(normalizedPacks);
  const frozenSpecies = Object.freeze(species);
  return Object.freeze({
    develop(genome: unknown): FlowerSpecimen {
      const reference = genomeReference(genome);
      const definition = versions.get(versionKey(reference));
      if (!definition)
        throw new Error(
          `catalog does not contain ${reference.id}/${reference.revision}`
        );
      return restoreSpecies(
        definition,
        genome as FlowerGenome<unknown, object>
      );
    },
    packs: frozenPacks,
    resolve(reference: SpeciesReference): AnySpecies | undefined {
      return descriptors.get(versionKey(reference));
    },
    species: frozenSpecies,
  });
}
