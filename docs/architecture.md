# Architecture

`@nbot/flowers` separates botanical identity from rendering:

```text
seed + cultivar + environment
             │
             ▼
       concrete genome
             │
             ▼
        flower model
          ┌──┴──┐
          ▼     ▼
         SVG   WebGL
```

The genome is immutable, versioned JSON. It records every sampled trait needed to rebuild a specimen. `sample()` is the only phase with randomness; `develop()` receives the completed genome and produces deterministic anatomy.

The flower model contains organs, transforms, pigment and tissue. It contains no SVG nodes, Three.js objects, lights or shaders.

## Anatomy

The core geometry vocabulary is deliberately small:

- `lamina` for petals, sepals, tepals, leaves and bracts;
- `sweep` for filaments, styles and tubes;
- `ellipsoid` for simple solids;
- `mesh` for an exceptional unsupported form.

Organs compose through groups, radial placement, phyllotaxis and explicit instances. Repeated organs share one geometry. `anatomy.part()` binds geometry, pigment and tissue once before placement.

Pigment is a declarative field evaluated by both renderers. Tissue describes botanical thickness, softness and translucency; it does not expose material or light settings.

## Renderers

The SVG renderer separates projection, pigment sampling and organ drawing, then emits a complete transparent document with inline paint-critical properties.

The GL renderer separates geometry, material and scene compilation. Generic flowers and Plumeria share one canvas, studio, accumulation and disposal lifecycle. PNG export owns its detached high-resolution canvas and always disposes that lifecycle before returning the encoded image.

SVG is not generated from GL and GL is not generated from SVG. Both begin from the model because converting either finished medium would discard anatomy or material information.

Plumeria keeps specialized SVG and GL geometry for its cyclic overlap and art-directed surface. Both consume one immutable specimen for form and livery; only projection, tessellation and medium-specific tone mapping differ.

## Packages and revisions

Species, packs and catalogs are immutable caller-owned values. Installing a flower pack never mutates a global registry. External species use their npm package as a namespace, and a catalog restores the exact revision recorded in a genome.

Published species and cultivar identities are append-only. A phenotype change creates a new revision; old definitions remain available while persisted genomes still need them.

The root, core, catalog, SVG and Node devkit entry points do not import Three.js or browser globals. GL and the browser devkit form the optional browser boundary.

## Contracts

`assertSpeciesContract()` checks deterministic growth, JSON restoration, immutability, geometry, references and bounds. `assertSpeciesMedia()` renders the same named study through SVG and GL and checks framing, silhouette and spatial color correspondence.

Those checks catch drift. Botanical recognition, form and finish still require visual review in the workbench.
