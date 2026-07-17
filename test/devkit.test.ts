import { describe, expect, it } from "vitest";
import {
  alaskaDaisy,
  catalogPack,
  type DaisyCultivar,
  daisy,
  daisyStudy,
  passionflower,
  passionflowerStudy,
  sunflower,
  sunflowerStudy,
} from "@/src/catalog";
import {
  defineCultivar,
  defineSpecies,
  grow,
  pigment,
  scale,
} from "@/src/core";
import {
  assertSpeciesContract,
  auditSpecies,
  createSpeciesStudy,
  inspectSpecimen,
} from "@/src/devkit";
import { assertSpeciesStudy } from "@/src/devkit/study";

describe("species authoring contract", () => {
  it("materializes a named, distinct visual study", () => {
    const study = createSpeciesStudy(daisy, [
      { id: "reference", intent: "default portrait", seed: "reference" },
      { id: "few-rays", intent: "low ray count", seed: "garden-42" },
      { id: "many-rays", intent: "high ray count", seed: "solstice" },
    ]);

    expect(study.species).toEqual({
      id: daisy.id,
      name: daisy.name,
      revision: daisy.revision,
    });
    expect(study.cases.map((entry) => entry.id)).toEqual([
      "reference",
      "few-rays",
      "many-rays",
    ]);
    expect(
      new Set(study.cases.map((entry) => entry.specimen.model.genomeId)).size
    ).toBe(3);
    expect(Object.isFrozen(study.cases)).toBe(true);
  });

  it("requires a useful visual study instead of a token snapshot", () => {
    expect(() =>
      createSpeciesStudy(daisy, [
        { id: "reference", intent: "default portrait", seed: "reference" },
      ])
    ).toThrow("at least three");
    expect(() =>
      createSpeciesStudy(daisy, [
        { id: "one", intent: "first", seed: "one" },
        { id: "two", intent: "second", seed: "two" },
        { id: "three", intent: "third", seed: "three" },
      ])
    ).toThrow("reference case");
    expect(() =>
      assertSpeciesStudy({
        cases: [],
        species: { id: daisy.id, name: daisy.name, revision: daisy.revision },
      })
    ).toThrow("at least three");
    expect(
      auditSpecies(daisy, {
        study: {
          cases: [],
          species: {
            id: daisy.id,
            name: daisy.name,
            revision: daisy.revision,
          },
        } as never,
      })
    ).toEqual([
      expect.objectContaining({
        caseId: "study",
        code: "study-invalid",
      }),
    ]);
  });

  it("keeps every reference species deterministic and renderer-neutral", () => {
    expect(catalogPack.species).toEqual([daisy, passionflower, sunflower]);
    expect(auditSpecies(daisy)).toEqual([]);
    expect(auditSpecies(passionflower)).toEqual([]);
    expect(auditSpecies(sunflower)).toEqual([]);
    expect(() => assertSpeciesContract(daisy)).not.toThrow();
    expect(() => assertSpeciesContract(passionflower)).not.toThrow();
    expect(() => assertSpeciesContract(sunflower)).not.toThrow();
    expect(() =>
      assertSpeciesContract(daisy, { study: daisyStudy })
    ).not.toThrow();
    expect(() =>
      assertSpeciesContract(passionflower, { study: passionflowerStudy })
    ).not.toThrow();
    expect(() =>
      assertSpeciesContract(sunflower, { study: sunflowerStudy })
    ).not.toThrow();
  });

  it("proves the kernel with three structurally different flowers", () => {
    const daisyInspection = inspectSpecimen(grow(daisy, { seed: "reference" }));
    const sunflowerInspection = inspectSpecimen(
      grow(sunflower, { seed: "reference" })
    );
    const passionflowerInspection = inspectSpecimen(
      grow(passionflower, { seed: "reference" })
    );

    expect(daisyInspection.instances).toBeGreaterThan(170);
    expect(sunflowerInspection.instances).toBeGreaterThan(700);
    expect(passionflowerInspection.instances).toBeGreaterThan(115);
    expect(daisyInspection.geometries).toBe(3);
    expect(sunflowerInspection.geometries).toBe(5);
    expect(passionflowerInspection.geometries).toBe(13);
    expect(daisyInspection.unbatchedGlInstances).toBe(0);
    expect(sunflowerInspection.unbatchedGlInstances).toBe(0);
    expect(passionflowerInspection.unbatchedGlInstances).toBe(0);
  });

  it("lets a cultivar change pigment without renderer code", () => {
    const pink = defineCultivar<DaisyCultivar>({
      id: "garden-pink",
      name: "Garden Pink",
      revision: 1,
      value: {
        ...alaskaDaisy.value,
        diskCore: "#c27f12",
        diskOuter: "#d39218",
        ray: "#f7a9c4",
        rayBase: "#f2bd7a",
      },
    });
    const specimen = grow(daisy, {
      cultivar: pink,
      seed: "reference",
    });

    expect(specimen.genome.cultivar.id).toBe("garden-pink");
    expect(specimen.genome.traits.diskOuter).toBe("#d39218");
    expect(specimen.genome.traits.rayColor).toBe("#f7a9c4");
  });

  it("requires an explicit reference set for a custom audit", () => {
    expect(auditSpecies(daisy, { seeds: [] })).toEqual([
      {
        caseId: "",
        code: "missing-seeds",
        message: "species audit needs at least one reference seed",
        seed: "",
      },
    ]);
  });

  it("audits cultivar and environment cases from the visual study", () => {
    let unstableSamples = 0;
    const stable = defineCultivar({
      id: "stable",
      name: "Stable",
      value: { unstable: false },
    });
    const unstable = defineCultivar({
      id: "unstable",
      name: "Unstable",
      value: { unstable: true },
    });
    const variant = defineSpecies<
      Readonly<{ radius: number }>,
      Readonly<{ unstable: boolean }>,
      Readonly<{ altitude: number }>
    >({
      defaultCultivar: stable,
      defaultEnvironment: { altitude: 0 },
      develop({ anatomy, genome }) {
        const form = anatomy.ellipsoid({
          id: "center",
          radii: [genome.traits.radius, genome.traits.radius, 0.1],
        });
        const paint = anatomy.appearance({
          id: "center",
          pigment: pigment.solid("#ffffff"),
          tissue: anatomy.tissues.pollen(),
        });
        return anatomy.flower({
          appearances: [paint],
          geometries: [form],
          roots: [
            anatomy.organ({
              appearance: paint,
              geometry: form,
              id: "center",
              semantic: "center",
            }),
          ],
        });
      },
      id: "variant-audit",
      sample({ cultivar: selected, environment, random }) {
        if (selected.value.unstable) {
          unstableSamples += 1;
          return { radius: 0.2 + 0.001 * unstableSamples };
        }
        return {
          radius: random.range("radius", 0.2, 0.3) + environment.altitude * 0,
        };
      },
    });
    const study = createSpeciesStudy(variant, [
      { id: "reference", intent: "default", seed: "reference" },
      {
        environment: { altitude: 2_000 },
        id: "high-altitude",
        intent: "environment boundary",
        seed: "high-altitude",
      },
      {
        cultivar: unstable,
        id: "unstable-cultivar",
        intent: "cultivar boundary",
        seed: "unstable",
      },
    ]);

    expect(auditSpecies(variant)).toEqual([]);
    expect(auditSpecies(variant, { study })).toEqual([
      expect.objectContaining({
        caseId: "unstable-cultivar",
        code: "growth-error",
      }),
    ]);
  });

  it("reports instances that the GL adapter must expand", () => {
    const cultivar = defineCultivar({
      id: "plain",
      name: "Plain",
      value: {},
    });
    const species = defineSpecies({
      defaultCultivar: cultivar,
      develop({ anatomy }) {
        const geometry = anatomy.ellipsoid({
          id: "pollen",
          radii: [0.1, 0.1, 0.1],
        });
        const appearance = anatomy.appearance({
          id: "pollen",
          pigment: pigment.solid("#e8b51f"),
          tissue: anatomy.tissues.pollen(),
        });
        return anatomy.flower({
          appearances: [appearance],
          geometries: [geometry],
          roots: [
            anatomy.group({
              children: [
                anatomy.instances(
                  {
                    appearance,
                    geometry,
                    id: "pollen",
                    semantic: "pollen",
                  },
                  [scale(-1, 1, 1), scale(1, 1, 1)]
                ),
              ],
              id: "sheared-parent",
              transform: scale(2, 1, 1),
            }),
          ],
        });
      },
      id: "diagnostic-instances",
      sample: () => ({}),
    });

    expect(
      inspectSpecimen(grow(species, { seed: "reference" })).unbatchedGlInstances
    ).toBe(1);
  });
});
