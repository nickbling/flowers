import { describe, expect, it } from "vitest";
import {
  createFlowerCatalog,
  defineFlowerPack,
  defineSpecies,
  grow,
  pigment,
} from "@/src/core";

type Traits = Readonly<{ radius: number }>;

function gardenDaisy(revision: number) {
  return defineSpecies<Traits, Record<never, never>>({
    defaultCultivar: {
      id: "wild-white",
      name: "Wild White",
      value: {},
    },
    develop({ anatomy, genome }) {
      const center = anatomy.ellipsoid({
        id: "center",
        radii: [genome.traits.radius, genome.traits.radius, 0.1],
      });
      const centerPaint = anatomy.appearance({
        id: "center",
        pigment: pigment.solid("#e8b51f"),
        tissue: anatomy.tissues.pollen(),
      });
      return anatomy.flower({
        appearances: [centerPaint],
        geometries: [center],
        roots: [
          anatomy.organ({
            appearance: centerPaint,
            geometry: center,
            id: "center",
            semantic: "disk-floret",
          }),
        ],
      });
    },
    id: "@garden/flowers:daisy",
    revision,
    sample({ random }) {
      return { radius: random.range("disk.radius", 0.2, 0.3) };
    },
  });
}

describe("flower packs", () => {
  it("defines a namespaced immutable pack without freezing caller arrays", () => {
    const species = [gardenDaisy(1)] as const;
    const pack = defineFlowerPack({ id: "@garden/flowers", species });

    expect(pack.format).toBe("@nbot/flower-pack");
    expect(pack.species).toEqual(species);
    expect(pack.species).not.toBe(species);
    expect(Object.isFrozen(pack)).toBe(true);
    expect(Object.isFrozen(pack.species)).toBe(true);
    expect(Object.isFrozen(species)).toBe(false);
  });

  it("rejects namespace mistakes and duplicate species revisions", () => {
    const species = gardenDaisy(1);

    expect(() =>
      defineFlowerPack({ id: "Invalid package", species: [species] })
    ).toThrow("npm package name");
    expect(() =>
      defineFlowerPack({ id: "a".repeat(215), species: [species] })
    ).toThrow("npm package name");
    for (const id of ["favicon.ico", "node_modules"])
      expect(() => defineFlowerPack({ id, species: [species] })).toThrow(
        "npm package name"
      );
    expect(() =>
      defineFlowerPack({ id: "@other/flowers", species: [species] })
    ).toThrow("must start with @other/flowers:");
    expect(() =>
      defineFlowerPack({
        id: "@garden/flowers",
        species: [{ ...species, id: "@garden/flowers:Bad" }],
      })
    ).toThrow("lowercase kebab-case");
    expect(() =>
      defineFlowerPack({
        id: "@garden/flowers",
        species: [species, species],
      })
    ).toThrow("more than once");
    expect(() =>
      defineFlowerPack({
        id: "@garden/flowers",
        species: [{ ...species, revision: 0 }],
      })
    ).toThrow("positive safe integer");
    expect(() =>
      defineFlowerPack({
        id: "@garden/flowers",
        species: [{ ...species }],
      })
    ).toThrow("defineSpecies");
    expect(() =>
      defineFlowerPack({
        id: "@garden/flowers",
        species: [Object.freeze({ ...species, sample: null })],
      } as never)
    ).toThrow("incomplete species");
  });

  it("resolves exact revisions and restores a persisted genome", () => {
    const first = gardenDaisy(1);
    const second = gardenDaisy(2);
    const pack = defineFlowerPack({
      id: "@garden/flowers",
      species: [first, second],
    });
    const catalog = createFlowerCatalog([pack]);
    const specimen = grow(first, { seed: "garden-42" });
    const restored = catalog.develop(
      JSON.parse(JSON.stringify(specimen.genome))
    );

    const firstDescriptor = catalog.resolve({ id: first.id, revision: 1 });
    const secondDescriptor = catalog.resolve({ id: first.id, revision: 2 });
    expect(firstDescriptor).toEqual({
      format: "@nbot/flower-species",
      formatVersion: 1,
      id: first.id,
      name: first.name,
      revision: 1,
    });
    expect(secondDescriptor?.revision).toBe(2);
    expect(firstDescriptor).not.toBe(first);
    expect("sample" in (firstDescriptor ?? {})).toBe(false);
    expect(catalog.packs[0].species[0]).toBe(firstDescriptor);
    expect(catalog.resolve({ id: first.id, revision: 3 })).toBeUndefined();
    expect(restored).toEqual(specimen);
  });

  it("keeps catalogs isolated and rejects ambiguous packs", () => {
    const species = gardenDaisy(1);
    const pack = defineFlowerPack({
      id: "@garden/flowers",
      species: [species],
    });
    const empty = createFlowerCatalog([]);

    expect(empty.resolve(species)).toBeUndefined();
    expect(() => createFlowerCatalog([pack, pack])).toThrow(
      "flower pack @garden/flowers more than once"
    );
    expect(() =>
      empty.develop(grow(species, { seed: "garden-42" }).genome)
    ).toThrow("does not contain @garden/flowers:daisy/1");
    expect(() => empty.develop(null)).toThrow("species reference");
  });
});
