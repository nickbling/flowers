import {
  auditSpecimen,
  canonicalJson,
  develop,
  type FlowerGenome,
  type FlowerSpecimen,
  grow,
  IDENTITY_TRANSFORM,
  type JsonValue,
  multiplyTransforms,
  pigmentUsesSpace,
  type SpeciesDefinition,
} from "@/src/core";
import { assertSpeciesStudy, type SpeciesStudy } from "@/src/devkit/study";
import { supportsInstancedNormals } from "@/src/shared/instancing";

export type SpeciesInspection = Readonly<{
  appearances: number;
  geometries: number;
  instances: number;
  nodes: number;
  unbatchedGlInstances: number;
}>;

export function inspectSpecimen(specimen: FlowerSpecimen): SpeciesInspection {
  let nodes = 0;
  let instances = 0;
  let unbatchedGlInstances = 0;
  const visit = (
    roots: typeof specimen.model.roots,
    parent = IDENTITY_TRANSFORM
  ): void => {
    for (const node of roots) {
      nodes += 1;
      if (node.kind === "group") {
        visit(node.children, multiplyTransforms(parent, node.transform));
        continue;
      }
      if (node.kind === "instances") {
        instances += node.transforms.length;
        const appearance = specimen.model.appearances[node.template.appearance];
        const flowerSpace =
          appearance && pigmentUsesSpace(appearance.pigment, "flower");
        for (const transform of node.transforms) {
          const complete = multiplyTransforms(
            parent,
            multiplyTransforms(transform, node.template.transform)
          );
          if (flowerSpace || !supportsInstancedNormals(complete))
            unbatchedGlInstances += 1;
        }
      } else if (node.kind === "organ") instances += 1;
    }
  };
  visit(specimen.model.roots);
  return Object.freeze({
    appearances: Object.keys(specimen.model.appearances).length,
    geometries: Object.keys(specimen.model.geometries).length,
    instances,
    nodes,
    unbatchedGlInstances,
  });
}

export type SpeciesContractIssue = Readonly<{
  caseId: string;
  code: string;
  message: string;
  seed: string;
}>;

export type SpeciesContractOptions = Readonly<{
  seeds?: readonly string[];
  study?: SpeciesStudy;
}>;

function isDeeplyFrozen(value: unknown, seen = new WeakSet<object>()): boolean {
  if (!value || typeof value !== "object" || seen.has(value)) return true;
  seen.add(value);
  return (
    Object.isFrozen(value) &&
    Object.values(value).every((child) => isDeeplyFrozen(child, seen))
  );
}

export function auditSpecies<Traits, CultivarValue, Environment extends object>(
  species: SpeciesDefinition<Traits, CultivarValue, Environment>,
  options: SpeciesContractOptions = {}
): readonly SpeciesContractIssue[] {
  const issues: SpeciesContractIssue[] = [];
  const seeds =
    options.seeds ??
    (options.study ? [] : ["reference-1", "reference-2", "reference-3"]);
  let study: SpeciesStudy | undefined;
  if (options.study) {
    try {
      assertSpeciesStudy(options.study);
      study = options.study;
    } catch (error) {
      issues.push({
        caseId: "study",
        code: "study-invalid",
        message: error instanceof Error ? error.message : String(error),
        seed: "",
      });
    }
  }
  if (study) {
    const { id, revision } = study.species;
    if (id !== species.id || revision !== species.revision)
      issues.push({
        caseId: "study",
        code: "study-species",
        message: `study belongs to ${id}/${revision}, not ${species.id}/${species.revision}`,
        seed: "",
      });
  }
  const cases = [
    ...seeds.map((seed) => ({
      caseId: seed,
      expected: undefined,
      grow: () => grow(species, { seed }),
      seed,
    })),
    ...(study?.species.id === species.id &&
    study.species.revision === species.revision
      ? study.cases.map(({ id, specimen }) => ({
          caseId: id,
          expected: specimen,
          grow: () =>
            develop(
              species,
              specimen.genome as FlowerGenome<
                Traits,
                Environment,
                CultivarValue
              >
            ),
          seed: specimen.genome.seed,
        }))
      : []),
  ];
  if (cases.length === 0 && issues.length === 0)
    return Object.freeze([
      {
        caseId: "",
        code: "missing-seeds",
        message: "species audit needs at least one reference seed",
        seed: "",
      },
    ]);
  for (const entry of cases) {
    try {
      const first = entry.grow();
      const second = entry.grow();
      const firstJson = canonicalJson(first);
      const secondJson = canonicalJson(second);
      if (firstJson !== secondJson)
        issues.push({
          caseId: entry.caseId,
          code: "non-deterministic",
          message: "growth changed between identical requests",
          seed: entry.seed,
        });
      if (entry.expected && canonicalJson(entry.expected) !== firstJson)
        issues.push({
          caseId: entry.caseId,
          code: "study-drift",
          message: "growth no longer matches the materialized study case",
          seed: entry.seed,
        });
      const roundTrip = JSON.parse(JSON.stringify(first)) as JsonValue;
      if (canonicalJson(roundTrip) !== firstJson)
        issues.push({
          caseId: entry.caseId,
          code: "json-round-trip",
          message: "specimen changed during a JSON round trip",
          seed: entry.seed,
        });
      if (!isDeeplyFrozen(first))
        issues.push({
          caseId: entry.caseId,
          code: "mutable-specimen",
          message: "grown specimens must be deeply immutable",
          seed: entry.seed,
        });
      for (const issue of auditSpecimen(first))
        issues.push({
          caseId: entry.caseId,
          code: issue.code,
          message: `${issue.path}: ${issue.message}`,
          seed: entry.seed,
        });
    } catch (error) {
      issues.push({
        caseId: entry.caseId,
        code: "growth-error",
        message: error instanceof Error ? error.message : String(error),
        seed: entry.seed,
      });
    }
  }
  return Object.freeze(issues);
}

export function assertSpeciesContract<
  Traits,
  CultivarValue,
  Environment extends object,
>(
  species: SpeciesDefinition<Traits, CultivarValue, Environment>,
  options?: SpeciesContractOptions
): void {
  const issues = auditSpecies(species, options);
  if (issues.length)
    throw new Error(
      `species contract failed:\n${issues.map((issue) => `${issue.caseId} [${issue.code}] ${issue.message}`).join("\n")}`
    );
}
