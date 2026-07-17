import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  auditSpecimen,
  type Cultivar,
  flowerVariantId,
  grow,
  jsonFingerprint,
  renderSvg,
  type SpeciesDefinition,
} from "@/src";
import {
  catalog,
  catalogPack,
  catalogStudies,
  constanceEliottPassionflower,
  daisy,
  daisyCultivars,
  ladyMargaretPassionflower,
  passionflower,
  passionflowerCultivars,
  passionflowerStudy,
  sunflower,
  sunflowerCultivars,
} from "@/src/catalog";
import { auditSpecies, inspectSpecimen } from "@/src/devkit";
import { flowerScene } from "@/src/gl/flower";

const MAINTAINED_SPECIES = [daisy, passionflower, sunflower] as const;
const REFERENCES = [
  { species: daisy, specimen: grow(daisy, { seed: "reference" }) },
  {
    species: passionflower,
    specimen: grow(passionflower, { seed: "reference" }),
  },
  { species: sunflower, specimen: grow(sunflower, { seed: "reference" }) },
] as const;

function assertCultivars<Traits, Value, Environment extends object>(
  species: SpeciesDefinition<Traits, Value, Environment>,
  cultivars: readonly Cultivar<Value>[]
): void {
  for (const cultivar of cultivars) {
    const specimen = grow(species, { cultivar, seed: "reference" });
    expect(specimen.genome.cultivar.id).toBe(cultivar.id);
    expect(auditSpecimen(specimen)).toEqual([]);
    expect(renderSvg(specimen)).toContain("<svg");
    const scene = flowerScene(specimen);
    expect(scene.flower.children.length).toBeGreaterThan(2);
    scene.dispose();
  }
}

describe("maintained flower catalog", () => {
  it("uses semantic cultivar identities throughout the catalog", () => {
    const groups = [
      [daisy, daisyCultivars],
      [passionflower, passionflowerCultivars],
      [sunflower, sunflowerCultivars],
    ] as const;
    const ids = groups.flatMap(([species, cultivars]) =>
      cultivars.map((cultivar) => flowerVariantId(species, cultivar))
    );

    expect(new Set(ids).size).toBe(ids.length);
    expect(daisyCultivars.map(({ id }) => id)).toEqual([
      "alaska",
      "banana-cream",
      "crazy-daisy",
      "real-neat",
    ]);
    expect(passionflowerCultivars.map(({ id }) => id)).toEqual([
      "caerulea",
      "constance-eliott",
      "amethyst",
      "incense",
      "lady-margaret",
    ]);
    expect(sunflowerCultivars.map(({ id }) => id)).toEqual([
      "procut-white-lite",
      "lemon-queen",
      "procut-orange",
      "procut-red-lemon-bicolor",
      "procut-red",
      "teddy-bear",
    ]);
    for (const id of ids) {
      expect(id).toMatch(
        /^@nbot\/flowers:[a-z]+(?:-[a-z]+)*\/[a-z]+(?:-[a-z]+)*$/
      );
      expect(id).not.toMatch(/catalog-\d+/);
    }
  });

  it("grows every catalog cultivar through both shared renderers", () => {
    assertCultivars(daisy, daisyCultivars);
    assertCultivars(passionflower, passionflowerCultivars);
    assertCultivars(sunflower, sunflowerCultivars);
  });

  it("rejects malformed variant identity inputs", () => {
    expect(() =>
      flowerVariantId({ id: "not/a/species" }, { id: "alaska" })
    ).toThrow("species id");
    expect(() =>
      flowerVariantId({ id: daisy.id }, { id: "Catalog 310" })
    ).toThrow("cultivar id");
  });

  it("publishes named compact, reference and expanded visual studies", () => {
    expect(catalogStudies).toHaveLength(MAINTAINED_SPECIES.length);
    for (const study of catalogStudies) {
      expect(study.cases.map((entry) => entry.id)).toEqual([
        "reference",
        "compact",
        "expanded",
      ]);
      const compact = study.cases[1].specimen.model.portrait.bounds;
      const expanded = study.cases[2].specimen.model.portrait.bounds;
      const span = (bounds: typeof compact) =>
        Math.max(
          bounds.maximum[0] - bounds.minimum[0],
          bounds.maximum[1] - bounds.minimum[1]
        );
      expect(span(expanded)).toBeGreaterThan(span(compact));
    }
  });

  it("keeps passionflower color families explicit", () => {
    expect(
      passionflowerStudy.cases.map((entry) => entry.specimen.genome.cultivar.id)
    ).toEqual([
      "caerulea",
      constanceEliottPassionflower.id,
      ladyMargaretPassionflower.id,
    ]);
    expect(passionflowerStudy.cases[1].specimen.genome.traits).toMatchObject({
      coronaRoot: constanceEliottPassionflower.value.coronaRoot,
      petalColor: constanceEliottPassionflower.value.petal,
      tepalAccent: constanceEliottPassionflower.value.tepalAccent,
    });
    expect(passionflowerStudy.cases[2].specimen.genome.traits).toMatchObject({
      coronaRoot: ladyMargaretPassionflower.value.coronaRoot,
      petalColor: ladyMargaretPassionflower.value.petal,
      tepalAccent: ladyMargaretPassionflower.value.tepalAccent,
    });
  });

  it("uses collision-safe identities and passes the species contract", () => {
    expect(catalogPack.id).toBe("@nbot/flowers");
    expect(catalogPack.species).toEqual(MAINTAINED_SPECIES);
    expect(catalog.packs).toHaveLength(1);
    expect(catalog.species).toHaveLength(MAINTAINED_SPECIES.length);
    for (const species of MAINTAINED_SPECIES) {
      expect(species.id.startsWith("@nbot/flowers:")).toBe(true);
      expect(catalog.resolve(species)).toMatchObject({
        id: species.id,
        revision: species.revision,
      });
    }
    for (const issues of [
      auditSpecies(daisy, {
        seeds: ["reference", "garden-42", "solstice"],
      }),
      auditSpecies(passionflower, {
        seeds: ["reference", "garden-42", "solstice"],
      }),
      auditSpecies(sunflower, {
        seeds: ["reference", "garden-42", "solstice"],
      }),
    ])
      expect(issues).toEqual([]);
  });

  it("freezes the first maintained reference genomes", () => {
    const expected = new Map([
      [daisy.id, "3cdua9wi3rxmh"],
      [passionflower.id, "mzoa08t7qq5w"],
      [sunflower.id, "38zc1nmmrrknf"],
    ]);

    for (const { species, specimen } of REFERENCES) {
      expect(jsonFingerprint(specimen.genome)).toBe(expected.get(species.id));
    }
  });

  it("models compound flowers without expanding repeated organs in SVG", () => {
    const expectedMinimumInstances = new Map([
      [daisy.id, 170],
      [passionflower.id, 115],
      [sunflower.id, 700],
    ]);
    const svgBudgets = new Map([
      [daisy.id, { gzip: 23_000, raw: 110_000 }],
      [passionflower.id, { gzip: 50_000, raw: 225_000 }],
      [sunflower.id, { gzip: 65_000, raw: 325_000 }],
    ]);
    for (const { species, specimen } of REFERENCES) {
      const inspection = inspectSpecimen(specimen);
      const svg = renderSvg(specimen);
      const budget = svgBudgets.get(species.id);
      if (!budget) throw new Error(`missing SVG budget for ${species.id}`);

      expect(inspection.instances).toBeGreaterThan(
        expectedMinimumInstances.get(species.id) ?? 0
      );
      expect(inspection.unbatchedGlInstances).toBe(0);
      expect(svg.startsWith("<svg")).toBe(true);
      expect(Buffer.byteLength(svg)).toBeLessThan(budget.raw);
      expect(gzipSync(svg).byteLength).toBeLessThan(budget.gzip);
    }
  });

  it("builds and disposes generic GL scenes for every maintained species", () => {
    for (const { specimen } of REFERENCES) {
      const built = flowerScene(specimen);

      expect(built.flower.children.length).toBeGreaterThan(2);
      expect(built.camera.position.z).toBeGreaterThan(
        specimen.model.portrait.bounds.maximum[2]
      );
      expect(() => built.dispose()).not.toThrow();
      expect(() => built.dispose()).not.toThrow();
    }
  });
});
