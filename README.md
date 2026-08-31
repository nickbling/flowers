# flowers

`@nbot/flowers` creates deterministic botanical flowers for SVG and WebGL. A seed grows one immutable specimen, and both renderers consume that same anatomy and pigment.

The maintained catalog includes Daisy, Sunflower and Passionflower. Plumeria uses specialized renderers for its five-petal overlap while preserving the same seed and cultivar across SVG and GL.

## Install

```sh
pnpm add @nbot/flowers
```

Add Three.js only when you use GL:

```sh
pnpm add three
pnpm add -D @types/three
```

Node.js 24 or newer is supported. Browser GL requires WebGL 2.

## Render a flower

```ts
import { grow, renderSvg } from "@nbot/flowers";
import { daisy } from "@nbot/flowers/catalog";

const specimen = grow(daisy, { seed: "garden-42" });
const svg = renderSvg(specimen, { size: 480 });
```

Use the same specimen for GL:

```ts
import { renderFlower } from "@nbot/flowers/gl";

const rendered = renderFlower({ canvas, specimen, size: 480 });
await rendered.ready;
rendered.dispose();
```

`renderFlower()` shows a complete first image before its four studio samples converge. `onProgress`, `AbortSignal` and `dispose()` expose that lifecycle without exposing renderer internals.

## Render a plumeria

```ts
import { plumeria } from "@nbot/flowers";
import { renderPlumeria } from "@nbot/flowers/gl";

const svg = plumeria({ seed: "garden-42", size: 480 });
const rendered = renderPlumeria({ canvas, seed: "garden-42", size: 480 });

await rendered.ready;
rendered.dispose();
```

The SVG has one transparent colorway for every background. The GL render is matte, rounded and softly lit. The page owns the background in both cases.

## Export a high-resolution PNG

The GL entry point owns the temporary canvas, accumulation and cleanup required for export:

```ts
import { exportFlowerPng, exportPlumeriaPng } from "@nbot/flowers/gl";

const flowerPng = await exportFlowerPng({ specimen });
const plumeriaPng = await exportPlumeriaPng({ seed: "garden-42" });
```

Both functions return a transparent 2048 × 2048 PNG `Blob` by default. Pass `size` for a smaller image or `signal` to cancel. Download, storage and other application behavior remain the caller’s responsibility.

The catalog exposes named cultivars and ordered cultivar lists. Plumeria exposes eight parent cultivars and every ordered two-parent cross through `plumeriaVariants` and `getPlumeriaVariant()`.

## Use SVG on a server

SVG generation has no DOM or Three.js dependency. Return the string directly from a Web or Next.js route:

```ts
return new Response(renderSvg(specimen), {
  headers: { "content-type": "image/svg+xml; charset=utf-8" },
});
```

React Server Components may grow a specimen and render its SVG. GL belongs in a Client Component or a browser worker because it needs WebGL; a server route can serve a GL image captured earlier by that renderer.

## Create a species

A species defines two functions:

1. `sample()` turns a seed, cultivar and environment into a complete JSON genome.
2. `develop()` turns that genome into renderer-neutral anatomy.

Authors use laminae, sweeps, ellipsoids and, when necessary, indexed meshes. They bind pigment and tissue once, then reuse each organ through radial placement, phyllotaxis or explicit transforms. Species code never emits SVG, imports Three.js or configures lights.

Every species should have a named study with a reference specimen and meaningful boundary cases:

```ts
assertSpeciesContract(species, { study });
await assertSpeciesMedia(study);
```

See [Authoring a species](docs/authoring-species.md) for a complete example. External collections use the same API and publish a `FlowerPack`; applications compose the packs they trust into a local catalog.

## Entry points

| Import | Purpose |
| --- | --- |
| `@nbot/flowers` | Core API, SVG and Plumeria |
| `@nbot/flowers/core` | Core API without renderers |
| `@nbot/flowers/catalog` | Maintained species, cultivars and studies |
| `@nbot/flowers/svg` | Generic SVG renderer |
| `@nbot/flowers/gl` | Generic and Plumeria GL renderers and PNG export |
| `@nbot/flowers/devkit` | Structural species contracts |
| `@nbot/flowers/devkit/browser` | Cross-media checks and workbench |

Only the GL and browser-devkit entry points import Three.js.

## Develop

```sh
pnpm install
pnpm dev
```

The command builds in watch mode and opens `workbench.html`, where every maintained cultivar can be viewed as SVG and GL. Check a change with:

```sh
pnpm verify
```

Further reading: [Architecture](docs/architecture.md), [Visual standard](docs/visual-language.md) and [Contributing](CONTRIBUTING.md).

## License

MIT
