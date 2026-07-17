# Authoring a species

Start from botanical references, not from a renderer. Identify the organs, symmetry, center structure, silhouette and pigment landmarks that make the flower recognizable. Decide which differences describe individuals and which require named cultivars.

A species has two phases. `sample()` turns a seed, cultivar and environment into a complete JSON genome. `develop()` turns that genome into renderer-neutral anatomy without further randomness.

Use the smallest anatomy that describes the flower. Add curl, crown, ruffle or custom tissue only when the references require it. A species never emits SVG, imports Three.js or configures light.

## A complete small species

This daisy uses one ray geometry around a phyllotactic disk. The cultivar owns its color; the seed owns bounded variation.

```ts
import {
  defineCultivar,
  defineSpecies,
  field,
  pigment,
} from "@nbot/flowers";

type DaisyCultivar = Readonly<{
  disk: `#${string}`;
  petal: `#${string}`;
}>;

type DaisyTraits = Readonly<{
  diskColor: `#${string}`;
  diskRadius: number;
  floretCount: number;
  petalColor: `#${string}`;
  petalCount: number;
  petalLength: number;
}>;

export const wildWhite = defineCultivar<DaisyCultivar>({
  id: "wild-white",
  name: "Wild White",
  value: { disk: "#e8b51f", petal: "#fffdf7" },
});

export const daisy = defineSpecies<DaisyTraits, DaisyCultivar>({
  id: "@garden/meadow:daisy",
  defaultCultivar: wildWhite,

  sample({ cultivar, random }) {
    return {
      diskColor: cultivar.value.disk,
      diskRadius: random.range("disk.radius", 0.22, 0.28),
      floretCount: random.integer("disk.floret-count", 160, 220),
      petalColor: cultivar.value.petal,
      petalCount: random.integer("ray.count", 26, 34),
      petalLength: random.range("ray.length", 0.72, 0.9),
    };
  },

  develop({ anatomy, genome }) {
    const ray = anatomy.lamina({
      id: "ray",
      length: genome.traits.petalLength,
      width: 0.18,
      crown: 0.05,
      thickness: 0.018,
      tip: "round",
    });
    const diskFloret = anatomy.ellipsoid({
      id: "disk-floret",
      radii: [0.017, 0.017, 0.028],
    });
    const rayPart = anatomy.part({
      geometry: ray,
      pigment: pigment.layered(genome.traits.petalColor, [
        {
          id: "warm-base",
          color: genome.traits.diskColor,
          amount: field.multiply(
            0.28,
            field.falloff(0.08, 0.46, field.coordinate("v")),
          ),
        },
      ]),
      tissue: anatomy.tissues.petal(),
    });
    const diskPart = anatomy.part({
      geometry: diskFloret,
      pigment: pigment.solid(genome.traits.diskColor),
      tissue: anatomy.tissues.pollen(),
    });

    return anatomy.flower({
      parts: [rayPart, diskPart],
      roots: [
        anatomy.radial({
          id: "rays",
          semantic: "ray-floret",
          part: rayPart,
          count: genome.traits.petalCount,
          radius: genome.traits.diskRadius * 0.7,
          startAngle: Math.PI / 2,
          tilt: -0.08,
        }),
        anatomy.phyllotaxis({
          id: "disk",
          semantic: "disk-floret",
          part: diskPart,
          count: genome.traits.floretCount,
          radius: genome.traits.diskRadius,
          dome: 0.08,
        }),
      ],
    });
  },
});
```

Grow the specimen once and pass it to either renderer:

```ts
import { grow, renderSvg } from "@nbot/flowers";
import { renderFlower } from "@nbot/flowers/gl";

const specimen = grow(daisy, { seed: "garden-42" });
const svg = renderSvg(specimen, { size: 480 });
const rendered = renderFlower({ canvas, specimen, size: 480 });

await rendered.ready;
rendered.dispose();
```

## Vocabulary

- `lamina` describes petals, sepals, tepals, leaves and bracts.
- `sweep` describes filaments, styles and tubular structures.
- `ellipsoid` describes simple solids such as anthers and pollen.
- `mesh` is the escape hatch for a form the standard primitives cannot express.
- `radial`, `phyllotaxis`, `instances` and `group` place reusable organs.

Pigment is declarative data. Fields may follow surface coordinates, flower coordinates, named features, falloffs, bands and deterministic noise. Both renderers evaluate the same program.

Use semantic random paths such as `ray.count` and `disk.radius`. Adding an unrelated path then leaves existing values unchanged. Keep every range as narrow as the biology supports; broad changes in color or structure belong to cultivars.

Species IDs use `<npm-package>:<species>`. Cultivar IDs are local lowercase kebab-case names. Changing a published phenotype or cultivar value requires a new revision.

## Test the range

Define one reference and at least two meaningful boundaries:

```ts
import {
  assertSpeciesContract,
  createSpeciesStudy,
} from "@nbot/flowers/devkit";

export const daisyStudy = createSpeciesStudy(daisy, [
  { id: "reference", intent: "balanced reference", seed: "reference" },
  { id: "compact", intent: "few short rays", seed: "compact" },
  { id: "expanded", intent: "many long rays", seed: "expanded" },
]);

assertSpeciesContract(daisy, { study: daisyStudy });
```

Run `assertSpeciesMedia(daisyStudy)` in a browser, then inspect the same cases in SVG, final GL and clay GL. Inside this repository, `pnpm dev` opens that workbench.

## Publish a pack

```ts
import { defineFlowerPack } from "@nbot/flowers";

export default defineFlowerPack({
  id: "@garden/meadow",
  species: [daisy],
});
```

The pack ID must match the namespace of every species it contains. Applications compose installed packs into a local catalog; nothing registers globally.
