import {
  type Cultivar,
  type FlowerSpecimen,
  grow,
  type SpeciesDefinition,
} from "@/src/core";

/** One named genome in a species' visual review range. */
export type SpeciesStudyInput<
  CultivarValue,
  Environment extends object,
> = Readonly<{
  cultivar?: Cultivar<CultivarValue>;
  environment?: Environment;
  id: string;
  intent: string;
  seed: string;
}>;

export type SpeciesStudyCase = Readonly<{
  id: string;
  intent: string;
  specimen: FlowerSpecimen;
}>;

/** Materialized specimens used by tests and SVG/GL reference boards. */
export type SpeciesStudy = Readonly<{
  cases: readonly SpeciesStudyCase[];
  species: Readonly<{ id: string; name: string; revision: number }>;
}>;

const CASE_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export function assertSpeciesStudy(
  value: unknown
): asserts value is SpeciesStudy {
  if (!value || typeof value !== "object")
    throw new TypeError("species study must be an object");
  const study = value as Partial<SpeciesStudy>;
  if (!study.species || typeof study.species !== "object")
    throw new TypeError("species study must identify its species");
  if (
    typeof study.species.id !== "string" ||
    typeof study.species.name !== "string" ||
    !study.species.name.trim() ||
    !Number.isSafeInteger(study.species.revision) ||
    study.species.revision < 1
  )
    throw new TypeError("species study has invalid species metadata");
  if (!Array.isArray(study.cases) || study.cases.length < 3)
    throw new RangeError("species study needs at least three cases");
  const ids = new Set<string>();
  const genomeIds = new Set<string>();
  for (const [index, entry] of study.cases.entries()) {
    if (!entry || typeof entry !== "object")
      throw new TypeError(`species study case ${index} must be an object`);
    if (typeof entry.id !== "string" || !CASE_ID.test(entry.id))
      throw new TypeError("species study case id must be lowercase kebab-case");
    if (ids.has(entry.id))
      throw new Error(`duplicate species study case ${entry.id}`);
    ids.add(entry.id);
    if (typeof entry.intent !== "string" || !entry.intent.trim())
      throw new TypeError("species study case intent must not be empty");
    const specimen = entry.specimen;
    if (!specimen || typeof specimen !== "object")
      throw new TypeError(`species study case ${entry.id} needs a specimen`);
    if (
      specimen.genome.species.id !== study.species.id ||
      specimen.genome.species.revision !== study.species.revision
    )
      throw new TypeError(
        `species study case ${entry.id} belongs to another species`
      );
    if (genomeIds.has(specimen.model.genomeId))
      throw new Error("species study cases must grow distinct specimens");
    genomeIds.add(specimen.model.genomeId);
  }
  if (!ids.has("reference"))
    throw new Error("species study needs a reference case");
}

/** Grows a named reference plus at least two distinct boundary specimens. */
export function createSpeciesStudy<
  Traits,
  CultivarValue,
  Environment extends object,
>(
  species: SpeciesDefinition<Traits, CultivarValue, Environment>,
  inputs: readonly SpeciesStudyInput<CultivarValue, Environment>[]
): SpeciesStudy {
  if (inputs.length < 3)
    throw new RangeError("species study needs at least three cases");
  if (!inputs.some((input) => input.id === "reference"))
    throw new Error("species study needs a reference case");
  const ids = new Set<string>();
  const genomeIds = new Set<string>();
  const cases = inputs.map((input): SpeciesStudyCase => {
    if (!CASE_ID.test(input.id))
      throw new TypeError("species study case id must be lowercase kebab-case");
    if (ids.has(input.id))
      throw new Error(`duplicate species study case ${input.id}`);
    ids.add(input.id);
    if (!input.intent.trim())
      throw new TypeError("species study case intent must not be empty");
    const specimen = grow(species, {
      ...(input.cultivar === undefined ? {} : { cultivar: input.cultivar }),
      ...(input.environment === undefined
        ? {}
        : { environment: input.environment }),
      seed: input.seed,
    });
    if (genomeIds.has(specimen.model.genomeId))
      throw new Error("species study cases must grow distinct specimens");
    genomeIds.add(specimen.model.genomeId);
    return Object.freeze({
      id: input.id,
      intent: input.intent.trim(),
      specimen,
    });
  });
  return Object.freeze({
    cases: Object.freeze(cases),
    species: Object.freeze({
      id: species.id,
      name: species.name,
      revision: species.revision,
    }),
  });
}
