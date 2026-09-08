# Changelog

## 1.2.0

### Changed

- Unified generic and Plumeria GL startup, progress, cancellation and cleanup in one framework-independent lifecycle; deferred Plumeria's GL preparation without changing its appearance or synchronous SVG API.
- Rebuilt Plumeria GL as five complete ribbon petals, each extending from its tightly wrapped basal tip to its broad blade. Their lower tips converge without a separate tube, collar or plug.
- Made opening primarily radial and outward-bending, with restrained spiral overlap, rounded tissue volume and fixed developmental topology.
- Shared deterministic pigment markings across SVG and a compact GL texture, preserving specimen identity and Candy Stripe's interior stripe.
- Simplified SVG paint preparation and GL mesh/resource ownership; removed unused vertex-pigment and translucency attributes.

### Fixed

- Restored Plumeria's 1.0 seed-to-specimen mapping, replacing the changed 1.1 output, and removed SVG band seams and outlines crossing overlapping petals.
- Replaced fine GL vertex-color bands with continuous pigment texture sampling, separate from the opaque tissue's nondirectional microtexture.
- Made GL throat and halo pigment follow individual petal length; removed added dark cores and shaded halo rings while preserving SVG ink contrast.
- Added a broad directional key and gentler geometric contact shadows to Plumeria, preserving its five identical petals, pigment, material and four-frame default.
- Restored readable SVG pigment strokes, fine grain and central contact shadows instead of an entirely blurred surface.
- Corrected GL clipping and coarse terminal chords at petal tips; refined SVG tip curves against the same outline.
- Added complete-ribbon manifold, collision, basal-closure and development checks, including the previously untested wrapped bases. Only the intentionally converged basal point may be shared between petals.
- Updated development-tool dependencies to resolve PostCSS and nanoid security advisories.

## 1.1.0

### Added

- Added transparent high resolution PNG export for generic flowers and Plumeria through `@nbot/flowers/gl`.
- Added export cancellation and automatic WebGL cleanup.

### Changed

- Shared Plumeria form, pigment and livery data across SVG and GL.
- Improved Plumeria petal thickness, relief and physical overlap.
- Reduced the default GL studio render to four samples.
- Split SVG and GL rendering into focused geometry, pigment, material, scene and lifecycle modules.
- Cached frozen specimen audits and skipped unused pigment feature work.
- Aligned rounded sweep ends in SVG and GL.

### Fixed

- Fixed Plumeria bloom fragments appearing before their petal opened.
- Fixed moon exposure changing physical relief and fiber detail.
- Fixed WebGL cancellation and progress callback cleanup.

## 1.0.0

### Breaking changes

- Node.js 24 or newer is now required.
- Removed `Theme` and the `theme` option. SVG flowers now use one transparent colorway on every background.
- Existing Plumeria seeds render with the new shared specimen and visual treatment.

### Added

- Added immutable genomes and renderer-neutral anatomy shared by SVG and GL.
- Added public species and cultivar authoring with deterministic variation, declarative pigment and reusable botanical organs.
- Added Daisy, Sunflower and Passionflower with maintained cultivar ranges.
- Added generic SVG and Three.js renderers with shared framing, pigment and tissue intent.
- Added matte botanical GL lighting, rounded volume, recessed relief and controlled translucency.
- Added flower packs and caller-owned catalogs for external species packages.
- Added structural and cross-media development checks plus one browser workbench.
- Reworked Plumeria SVG and GL around one shared specimen, including named cultivars and ordered crosses.
- Kept Three.js as an optional peer used only by GL and browser development tools.

## 0.3.0

- Moved final color grading into the generated SVG so WebKit and Chromium preserve the same palette.
- Added denser color, a warmer center and the opt-in `shadow` ground treatment.
- Made the SVG static by default. `bloom: true` adds hooks for the exported `BLOOM_CSS` animation.
- Changed the rendered result for existing seeds without changing the existing options.

## 0.2.0

- Added a key light, stronger throat color and finer fiber texture.
- Improved pale edges on light backgrounds and added the opt-in `glow` ground treatment.
- Changed the rendered result for existing seeds without changing the API.

## 0.1.0

- Added deterministic, dependency-free plumeria SVG generation with light and dark themes and an opt-in opening animation.
