# flowers

Procedural botanical SVGs, grown from a seed. Hand it a string and you get an SVG flower; the same string grows the same flower on any machine. The point is determinism: a flower can be regrown from its seed instead of stored.

Deterministic, dependency-free, isomorphic. One species today, a five-petaled plumeria; the vocabulary is built so others can grow beside it.

## Install

```
pnpm add @nbot/flowers
```

## Usage

```ts
import { cultivar, plumeria } from "@nbot/flowers";

const svg = plumeria({ seed: "2026-06-14" });
const name = cultivar({ seed: "2026-06-14" }); // "pink pearl", "rainbow × gold", ...
```

`plumeria` returns a complete `<svg>` string. It renders the same flower on the server and in the browser, with no dependencies to carry along.

## Design

**The pinwheel.** A real plumeria overlaps like a pinwheel: every petal covers one neighbor and slips under the other, all the way around, which no single draw order can close. The renderer draws the five petals, then redraws the first clipped inside the last (`render.ts`, the wedge). The sliver restores the missing overlap, contact shadow included.

**Petals** (`petal.ts`). Each petal is a Beta kernel `t^a·(1-t)^b` offset along the normal of a parabolic midrib. The covering flank is broad, the tucked flank slim, different exponents per side. The midrib's parabola is emitted as an exact quadratic Bézier (control point `(0, -L/2)`); the outline is Catmull-Rom converted to cubics, sampled densest where the kernel curves hardest. Each petal is born already upright: its lean is the phase of the corolla's fifth harmonic, the exact measure of how far a five-fold figure is turned, so one petal stands skyward and the star needs no correction downstream.

**Genomes** (`genome.ts`). A flower is a sampled genome: one of eight cultivar recipes, modeled on real frangipani (Celadine, Rainbow, Pink Pearl, Sunset, Fuchsia, Gold, Candy Stripe, Carmine), or, some days, a hybrid of two, printed at a per-bloom exposure (pale and milky through deep and saturated). Recipes are spans in OKLCH; every sampled tone stays in the perceptual neighborhood of its cultivar.

**Color** (`color.ts`). All mixing happens in OKLCH with shortest-arc hue, so a gold-to-pink ramp passes through warm orange instead of grey. Gradient stops are sampled along OKLCH geodesics and converted to hex only at the edge of the system, gamut-mapped by walking chroma down.

**No outlines.** Petals separate the way photographs do: a double contact shadow under every covering edge (crisp line opening into penumbra), a thin rim of light on the waxy edge, and one key light from the top left, cast as a per-petal gradient so the corolla reads as a rounded dome instead of five flat cut-outs. Every shade is dense color, never grey: contact shadows carry chroma, and the dark half of each petal falls into a saturated cast of the body itself. On light paper the body tones take an ivory floor so even the whitest cultivar keeps a step of contrast, and an opt-in cast shadow (`shadow: true`) seats the corolla on the surface. A radial mask fades the contact shadows near the hub, so the center stays lit instead of falling in its own shade.

**The throat.** Two registers: a steady shared core, plus a flame ellipse per petal so the gold reads as a star, its edge torn into tongues by per-petal turbulence displacement. An amber glow pools at the hub — color, never a white haze — and a silky radiation of hair-fine golden rays converges on the dark eye, one 72° sector defined once and rotated five times. Vein fans die into the body before the rim, fine radial fibers weave an iris-like texture, and an anisotropic grain runs lengthwise like real petal striations.

**The grade.** The same saturate → contrast → gamma chain a phone's auto mode would run, baked into every color at generation time instead of an SVG filter: WebKit rasterizes filter chains in software and rendered them visibly paler than Chromium, so baking makes every engine paint the identical flower and drops the costliest filter. Softened on pale cultivars, whose near-white petals a full lift would blow into the background.

**The moon** (`moon.ts`). Pass a `date` and the moon of that day is arithmetic on it (one known new moon and the synodic month). Full-moon blooms come out paler and silvery.

**Bloom.** The SVG is always a still document; animation ships beside it, never inside it. `bloom: true` labels the petals with data attributes (origin and delay), and the exported `BLOOM_CSS`, injected once per page, unfurls every hooked flower around its hub with a staggered fade, honoring `prefers-reduced-motion`. A different entrance is one override of the `nbf-*` keyframes away.

**Glow.** By default the flower carries no backdrop, since a library should not assume the surface it lands on. Pass `glow: true` and it rests on a soft ground: a warm shade on paper, a faint throat-colored halo on dark. Presentation is opt-in, like the animation.

**Theming.** Light and dark are the same geometry, re-toned by vibrance rather than brightness: chroma rides toward the gamut edge while lightness holds, so the bloom burns with color instead of washing toward white. On dark the tones ease deeper against the black; on light the body stays luminous — the key light itself carries the body's hue warmed toward the sun's gold, since a pure-white lift buys brightness by draining saturation. Element ids embed the theme, so two flowers of the same seed can share one document and `url(#...)` still resolves the right one.

## API

```ts
plumeria(options): string   // a complete <svg> document
cultivar(options): string   // the name of the flower that seed grows
```

| option | type | default |  |
| --- | --- | --- | --- |
| `seed` | `string` |  | identity; same seed, same flower |
| `date` | `string?` | undefined | ISO day; the moon of that day pales the bloom |
| `bloom` | `boolean?` | `false` | `true` adds the animation hooks that `BLOOM_CSS` drives |
| `glow` | `boolean?` | `false` | `true` rests the flower on a soft ground glow |
| `shadow` | `boolean?` | `false` | `true` seats the flower on a cast shadow (light theme only) |
| `theme` | `"light" \| "dark"` | `"light"` | re-tones, never restructures |
| `size` | `number?` | `480` | width/height attributes; viewBox is always 480 |

The SVG never carries `<style>`: with `bloom: true` it gains only data attributes, and the exported `BLOOM_CSS` (a constant string, no per-flower state) plays the entrance for every hooked flower on the page.

The contract, locked by tests: deterministic per `(seed, theme)`; structure identical across themes; ids disjoint across themes; every `url(#...)` reference defined in-document; numerically sound and comfortably under 48 KB.

## Layout

```
src/
  shared/
    color.ts    OKLCH to sRGB, perceptual mixing
    prng.ts     xmur3 + sfc32, deterministic randomness
    moon.ts     lunar phase from the date
  plumeria/
    genome.ts   cultivar recipes and sampling
    petal.ts    petal geometry
    bloom.ts    the opening animation, opt-in
    render.ts   composition: layers, shadows, svg
```

`shared` knows nothing of any one flower; a second species lives beside `plumeria`, reuses `shared`, and never touches it.

## License

MIT
