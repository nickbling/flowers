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

The GL renderer separates geometry, material and scene compilation. Generic flowers and Plumeria share one canvas, studio, accumulation and disposal lifecycle. Plumeria uses a broad directional key with softened shadow strength and a sampled sky. The key and sky own two shadow maps; the four-frame default is unchanged. Light may vary across the five identical petals without changing their shared geometry or pigment. Generic profiles retain their unshadowed key and sampled sky. Production proof captures use the same render surface as the public renderer. PNG export owns its detached high-resolution canvas and always disposes that lifecycle before returning the encoded image.

SVG is not generated from GL and GL is not generated from SVG. Both begin from the model because converting either finished medium would discard anatomy or material information.

Plumeria keeps specialized SVG and GL geometry for its cyclic overlap and art-directed surface. Both consume the established 1.0 sprout contract for form, genome and livery; projection, tessellation and surface treatment belong to each medium. SVG keeps illustrative pigment strokes and fine grain; GL uses physical volume and skin. Their shared identity does not require flattening either treatment.

The GL corolla contains exactly five complete petals sharing one `BufferGeometry`, placed at exact 72° rotations. Each petal includes its own narrow wrapped base, opening throat and broad blade. Their overlapping lower portions create the apparent tube and converge at the basal tips, closing its lower outlet; no separate basal mesh or common attachment ring exists. Each petal is a closed tissue shell with rounded front/back volume and its own continuous margins.

`plumeria-surface.ts` owns shape and development; `loft.ts` samples that surface into a mesh. A common meridian coordinate system keeps neighboring ribbons in a consistent overlap order while they widen and bend outward. Only a gentle angular bias remains in the opened blade. A scalar inverse preserves its canonical `laminaPoint()` projection. Development retains the same indices, attributes and rotation-only instances.

Pigment uses a compact texture in each petal's along/across material coordinates, prepared from the same markings as SVG. Throat and halo follow petal length, not a projected radius around the flower. Mark profiles preserve their footprint and integrated coverage without imposing a dark center; the halo changes color rather than adding a shaded ring. SVG ink contrast stays in its own adapter. Physical microtexture has separate mature rest-space coordinates; both coordinate sets remain fixed during opening. The scene owns one geometry, one material and the pigment/normal maps, disposing each once.

## Packages and revisions

Species, packs and catalogs are immutable caller-owned values. Installing a flower pack never mutates a global registry. External species use their npm package as a namespace, and a catalog restores the exact revision recorded in a genome.

Published species and cultivar identities are append-only. A phenotype change creates a new revision; old definitions remain available while persisted genomes still need them.

The root, core, catalog, SVG and Node devkit entry points do not import Three.js or browser globals. GL and the browser devkit form the optional browser boundary.

## Contracts

`assertSpeciesContract()` checks deterministic growth, JSON restoration, immutability, geometry, references and bounds. `assertSpeciesMedia()` renders the same named study through SVG and GL and checks framing, silhouette and spatial color correspondence.

Those checks catch drift. Botanical recognition, form and finish still require visual review in the workbench.
