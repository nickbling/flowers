# Contributing

Use Node.js 24 and the pnpm version pinned in `package.json`.

```sh
pnpm install
pnpm dev
```

The development command watches the build and opens `workbench.html`. A successful first run shows Daisy, Passionflower, Plumeria and Sunflower with SVG and GL beside each other.

## Add a species

1. Add `src/catalog/<species>.ts` with its cultivars and one `defineSpecies()` value.
2. Export the species and its ordered cultivar list from `src/catalog/index.ts`.
3. Add reference, compact and expanded cases to `src/catalog/studies.ts`.
4. Add identity and resource assertions to `test/catalog.test.ts`.
5. Review every cultivar and study case in the workbench.
6. Run `pnpm verify`.

Start with the [complete small species](docs/authoring-species.md#a-complete-small-species). Use `src/catalog/daisy.ts` as the compact reference and `src/catalog/passionflower.ts` only when the anatomy genuinely needs several whorls and elevated reproductive organs.

An external flower package follows the same workflow, exports a `FlowerPack` under its npm namespace and keeps its own workbench and tests.

## Rules

- One seed, cultivar and environment produce one immutable genome.
- SVG and GL consume the same specimen; a species never defines separate renderer anatomy.
- Repeated organs reuse one geometry.
- Species own anatomy, pigment and tissue. Renderers own SVG paint, Three.js materials and light.
- Published species and cultivar revisions are append-only.
- New core primitives need evidence from two structurally different species.
- Public APIs are validated at their boundary and remain deeply immutable.
- Comments explain only invariants, compatibility constraints or mathematics the code cannot state.

Biome owns TypeScript formatting. Markdown uses one logical paragraph per line. Internal TypeScript imports use `@/src/...`.

## Review

Run the structural contract for every named study and the browser media contract for the same specimens. Then inspect SVG at collection and hero sizes on light, gray, dark, saturated and checkerboard grounds. Inspect final and clay GL on light, gray and dark grounds.

Automation proves identity, geometry, bounds, resources and cross-media correspondence. It does not prove that a flower is beautiful or botanically convincing; that remains a visual review against several references.
