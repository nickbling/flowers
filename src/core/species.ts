import { type AnatomyKit, createAnatomyKit } from "@/src/core/anatomy";
import { auditSpecimen } from "@/src/core/audit";
import { flowerGenomeIdentity } from "@/src/core/genome";
import {
  assertJsonValue,
  canonicalJson,
  cloneJson,
  type DeepReadonly,
  deepFreeze,
  type JsonValue,
  jsonFingerprint,
} from "@/src/core/json";
import type { FlowerModel } from "@/src/core/model";
import { createGenomeRandom, type GenomeRandom } from "@/src/core/random";

export type Cultivar<Value = JsonValue> = Readonly<{
  id: string;
  name: string;
  revision: number;
  value: DeepReadonly<Value>;
}>;

export type CultivarOptions<Value = JsonValue> = Readonly<{
  id: string;
  name: string;
  revision?: number;
  value: Value;
}>;

export type FlowerGenome<
  Traits = unknown,
  Environment extends object = Readonly<Record<string, unknown>>,
  CultivarValue = unknown,
> = Readonly<{
  cultivar: Cultivar<CultivarValue>;
  engineVersion: 1;
  environment: DeepReadonly<Environment>;
  format: "@nbot/flower-genome";
  formatVersion: 1;
  seed: string;
  species: Readonly<{ id: string; name: string; revision: number }>;
  traits: DeepReadonly<Traits>;
}>;

type CultivarIdentity<Value> = Readonly<{
  id: string;
  revision: number;
  value: DeepReadonly<Value>;
}>;

type DevelopmentGenome<
  Traits,
  Environment extends object,
  CultivarValue,
> = Readonly<
  Omit<
    FlowerGenome<Traits, Environment, CultivarValue>,
    "cultivar" | "species"
  > & {
    cultivar: CultivarIdentity<CultivarValue>;
    species: Readonly<{ id: string; revision: number }>;
  }
>;

export type SpeciesDefinition<
  Traits,
  CultivarValue = unknown,
  Environment extends object = Readonly<Record<string, unknown>>,
> = Readonly<{
  defaultCultivar: Cultivar<CultivarValue>;
  defaultEnvironment: DeepReadonly<Environment>;
  develop(
    input: Readonly<{
      anatomy: AnatomyKit;
      genome: DevelopmentGenome<Traits, Environment, CultivarValue>;
    }>
  ): FlowerModel;
  format: "@nbot/flower-species";
  formatVersion: 1;
  id: string;
  name: string;
  revision: number;
  sample(
    input: Readonly<{
      cultivar: CultivarIdentity<CultivarValue>;
      environment: DeepReadonly<Environment>;
      random: GenomeRandom;
    }>
  ): Traits;
}>;

type EnvironmentDefault<Environment extends object> =
  Environment extends readonly unknown[]
    ? never
    : Readonly<Record<string, unknown>> extends Environment
      ? Readonly<{ defaultEnvironment?: Environment }>
      : Readonly<{ defaultEnvironment: Environment }>;

export type SpeciesOptions<
  Traits,
  CultivarValue = unknown,
  Environment extends object = Readonly<Record<string, unknown>>,
> = Readonly<
  Omit<
    SpeciesDefinition<Traits, CultivarValue, Environment>,
    | "defaultCultivar"
    | "defaultEnvironment"
    | "format"
    | "formatVersion"
    | "name"
    | "revision"
  > & {
    defaultCultivar: Cultivar<CultivarValue> | CultivarOptions<CultivarValue>;
    name?: string;
    revision?: number;
  } & EnvironmentDefault<Environment>
>;

export type FlowerSpecimen<
  Traits = unknown,
  Environment extends object = object,
  CultivarValue = unknown,
> = Readonly<{
  genome: FlowerGenome<Traits, Environment, CultivarValue>;
  model: FlowerModel;
}>;

const LOCAL_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const SPECIES_ID =
  /^(?:(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*:)?[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

function record(
  value: unknown,
  path: string
): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`${path} must be an object`);
  return value as Readonly<Record<string, unknown>>;
}

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
  path: string
): void {
  for (const key of expected)
    if (!(key in value)) throw new TypeError(`${path}.${key} is required`);
  for (const key of Object.keys(value))
    if (!expected.includes(key))
      throw new TypeError(`${path}.${key} is not part of this format`);
}

function assertGenomeMetadata(value: unknown): void {
  const genome = record(value, "genome");
  exactKeys(
    genome,
    [
      "cultivar",
      "engineVersion",
      "environment",
      "format",
      "formatVersion",
      "seed",
      "species",
      "traits",
    ],
    "genome"
  );
  const species = record(genome.species, "genome.species");
  exactKeys(species, ["id", "name", "revision"], "genome.species");
  const cultivar = record(genome.cultivar, "genome.cultivar");
  exactKeys(cultivar, ["id", "name", "revision", "value"], "genome.cultivar");
  record(genome.environment, "genome.environment");
  if (typeof species.id !== "string" || !SPECIES_ID.test(species.id))
    throw new TypeError("genome species id is invalid");
  if (typeof species.name !== "string" || !species.name.trim())
    throw new TypeError("genome species name must not be empty");
  if (!Number.isSafeInteger(species.revision) || Number(species.revision) < 1)
    throw new RangeError("genome species revision must be a positive integer");
  if (typeof cultivar.id !== "string" || !LOCAL_ID.test(cultivar.id))
    throw new TypeError("genome cultivar id must be lowercase kebab-case");
  if (typeof cultivar.name !== "string" || !cultivar.name.trim())
    throw new TypeError("genome cultivar name must not be empty");
  if (!Number.isSafeInteger(cultivar.revision) || Number(cultivar.revision) < 1)
    throw new RangeError("genome cultivar revision must be a positive integer");
}

function normalizeCultivar<Value>(
  definition: Cultivar<Value> | CultivarOptions<Value>
): Cultivar<Value> {
  if (!LOCAL_ID.test(definition.id))
    throw new TypeError(
      "cultivar id must be a lowercase kebab-case identifier"
    );
  if (!definition.name.trim())
    throw new TypeError("cultivar name must not be empty");
  const revision = definition.revision ?? 1;
  if (!Number.isSafeInteger(revision) || revision < 1)
    throw new RangeError("cultivar revision must be a positive safe integer");
  assertJsonValue(definition.value, "cultivar.value");
  return deepFreeze({
    ...definition,
    name: definition.name.trim(),
    revision,
    value: cloneJson(definition.value),
  }) as Cultivar<Value>;
}

export function defineCultivar<Value>(
  definition: CultivarOptions<Value>
): Cultivar<Value> {
  return normalizeCultivar(definition);
}

export function flowerVariantId(
  species: Readonly<{ id: string }>,
  cultivar: Readonly<{ id: string }>
): `${string}/${string}` {
  if (!SPECIES_ID.test(species.id))
    throw new TypeError("species id is invalid");
  if (!LOCAL_ID.test(cultivar.id))
    throw new TypeError("cultivar id must be lowercase kebab-case");
  return `${species.id}/${cultivar.id}`;
}

function sampleTraits<Traits, CultivarValue, Environment extends object>(
  species: SpeciesDefinition<Traits, CultivarValue, Environment>,
  cultivar: Cultivar<CultivarValue>,
  environment: DeepReadonly<Environment>,
  seed: string
): DeepReadonly<Traits> {
  const random = createGenomeRandom({
    namespace: `flower/1/${species.id}/${species.revision}/${cultivar.id}/${cultivar.revision}/${canonicalJson(
      cultivar.value
    )}/${canonicalJson(environment)}`,
    seed,
  });
  const sampled = species.sample({
    cultivar: Object.freeze({
      id: cultivar.id,
      revision: cultivar.revision,
      value: cultivar.value,
    }),
    environment,
    random,
  });
  assertJsonValue(sampled, "traits");
  return deepFreeze(cloneJson(sampled)) as DeepReadonly<Traits>;
}

export function defineSpecies<
  Traits,
  CultivarValue = unknown,
  Environment extends object = Readonly<Record<string, unknown>>,
>(
  definition: SpeciesOptions<Traits, CultivarValue, Environment>
): SpeciesDefinition<Traits, CultivarValue, Environment> {
  if (
    typeof definition.sample !== "function" ||
    typeof definition.develop !== "function"
  )
    throw new TypeError("species must provide sample and develop functions");
  if (!SPECIES_ID.test(definition.id))
    throw new TypeError(
      "species id must be kebab-case, optionally prefixed by an npm package and colon"
    );
  const revision = definition.revision ?? 1;
  if (!Number.isSafeInteger(revision) || revision < 1)
    throw new RangeError("species revision must be a positive safe integer");
  const name =
    definition.name?.trim() ||
    definition.id
      .slice(definition.id.lastIndexOf(":") + 1)
      .replaceAll("-", " ");
  const defaultEnvironment = definition.defaultEnvironment ?? {};
  assertJsonValue(
    defaultEnvironment as unknown as JsonValue,
    "defaultEnvironment"
  );
  record(defaultEnvironment, "defaultEnvironment");
  return Object.freeze({
    ...definition,
    defaultCultivar: normalizeCultivar<CultivarValue>(
      definition.defaultCultivar
    ),
    defaultEnvironment: deepFreeze(
      cloneJson(defaultEnvironment as unknown as JsonValue)
    ) as DeepReadonly<Environment>,
    format: "@nbot/flower-species" as const,
    formatVersion: 1 as const,
    name,
    revision,
  });
}

export function grow<Traits, CultivarValue, Environment extends object>(
  species: SpeciesDefinition<Traits, CultivarValue, Environment>,
  options: Readonly<{
    cultivar?: Cultivar<CultivarValue>;
    environment?: Environment;
    seed: string;
  }>
): FlowerSpecimen<Traits, Environment, CultivarValue> {
  if (species.format !== "@nbot/flower-species" || species.formatVersion !== 1)
    throw new TypeError("unsupported species definition");
  if (typeof options.seed !== "string" || options.seed.length === 0)
    throw new TypeError("seed must be a non-empty string");
  const cultivar = normalizeCultivar<CultivarValue>(
    options.cultivar ?? species.defaultCultivar
  );
  const requestedEnvironment =
    options.environment ?? species.defaultEnvironment;
  assertJsonValue(requestedEnvironment as unknown as JsonValue, "environment");
  record(requestedEnvironment, "environment");
  const environment = deepFreeze(
    cloneJson(requestedEnvironment as unknown as JsonValue)
  ) as DeepReadonly<Environment>;
  const traits = sampleTraits(species, cultivar, environment, options.seed);
  const genome = deepFreeze({
    cultivar: {
      id: cultivar.id,
      name: cultivar.name,
      revision: cultivar.revision,
      value: cultivar.value,
    },
    engineVersion: 1 as const,
    environment,
    format: "@nbot/flower-genome" as const,
    formatVersion: 1 as const,
    seed: options.seed,
    species: {
      id: species.id,
      name: species.name,
      revision: species.revision,
    },
    traits,
  }) as FlowerGenome<Traits, Environment, CultivarValue>;
  return developGenome(species, genome, false);
}

function developGenome<Traits, CultivarValue, Environment extends object>(
  species: SpeciesDefinition<Traits, CultivarValue, Environment>,
  input: FlowerGenome<Traits, Environment, CultivarValue>,
  validateTraits: boolean
): FlowerSpecimen<Traits, Environment, CultivarValue> {
  assertJsonValue(input, "genome");
  assertGenomeMetadata(input);
  if (species.format !== "@nbot/flower-species" || species.formatVersion !== 1)
    throw new TypeError("unsupported species definition");
  if (
    input.format !== "@nbot/flower-genome" ||
    input.formatVersion !== 1 ||
    input.engineVersion !== 1
  )
    throw new TypeError("unsupported flower genome");
  if (
    input.species.id !== species.id ||
    input.species.revision !== species.revision
  )
    throw new TypeError(
      `genome belongs to ${input.species.id}/${input.species.revision}, not ${species.id}/${species.revision}`
    );
  if (typeof input.seed !== "string" || input.seed.length === 0)
    throw new TypeError("genome seed must be a non-empty string");
  const genome = deepFreeze(
    cloneJson(input as unknown as JsonValue)
  ) as FlowerGenome<Traits, Environment, CultivarValue>;
  if (validateTraits) {
    const expected = sampleTraits(
      species,
      genome.cultivar,
      genome.environment,
      genome.seed
    );
    if (canonicalJson(expected) !== canonicalJson(genome.traits))
      throw new TypeError(
        "genome traits do not match its species, cultivar, environment and seed"
      );
  }
  const genomeId = `flower/1/${species.id}/${jsonFingerprint(
    flowerGenomeIdentity(genome)
  )}`;
  const developmentGenome = deepFreeze({
    ...genome,
    cultivar: {
      id: genome.cultivar.id,
      revision: genome.cultivar.revision,
      value: genome.cultivar.value,
    },
    species: {
      id: genome.species.id,
      revision: genome.species.revision,
    },
  }) as DevelopmentGenome<Traits, Environment, CultivarValue>;
  const model = deepFreeze(
    species.develop({
      anatomy: createAnatomyKit(genomeId),
      genome: developmentGenome,
    })
  );
  if (model.genomeId !== genomeId)
    throw new Error(
      "species model must be created by the supplied anatomy kit"
    );
  const specimen = deepFreeze({ genome, model });
  const issues = auditSpecimen(specimen);
  if (issues.length)
    throw new Error(
      `species developed an invalid flower model:\n${issues
        .map((issue) => `${issue.path} [${issue.code}] ${issue.message}`)
        .join("\n")}`
    );
  return specimen;
}

/** Validates and develops a persisted concrete genome. */
export function develop<Traits, CultivarValue, Environment extends object>(
  species: SpeciesDefinition<Traits, CultivarValue, Environment>,
  input: FlowerGenome<Traits, Environment, CultivarValue>
): FlowerSpecimen<Traits, Environment, CultivarValue> {
  return developGenome(species, input, true);
}
