# Decisions

Every consequential choice made while growing this thing, with the alternative that lost and why. Companion to the [README](README.md), which describes what is; this file remembers what was decided.

## Architecture

**Genotype is not the render.** `genome.ts` produces an abstract phenotype (OKLCH tones, reaches, fullness); `render.ts` is one interpreter of it. Keeping the data and the drawing apart means another renderer (canvas, raster) can reuse the genome without touching it.

**One id namespace per theme.** Two flowers of the same seed can share one document, and SVG resolves `url(#...)` against the whole of it, so same-seed flowers collided and the dark one silently painted with the light palette. Ids embed the theme. Found as a live bug, locked by a test.

## Geometry

**Beta-kernel flanks on a parabolic midrib, not the superformula.** Gielis curves draw radially symmetric silhouettes; they cannot do imbrication, asymmetric flanks, or the pinwheel. The working grammar is botanical vocabulary: lamina, midrib, throat, fibers, margin. Other species will be configurations of the same vocabulary, not new equations.

**The pinwheel closes with a clipped redraw.** Painter's order cannot close a cycle of five mutual overlaps. Petal 0 is drawn again, clipped inside petal 4's silhouette, contact shadow first.

**Wedge clip inflated 1.2%.** A clip tracing petal 4's exact outline leaves a 1px antialiasing seam where petal 4's bright rim bleeds through; past the edge the redraw lands on identical pixels and the seam dissolves.

**One shared petal form per flower.** Real corollas grow five copies of one genetic program. Per-petal jittered shapes (length, bend) read as a crooked flower, not as nature. Per-petal life lives in paint only. It also halves the defs.

**Born straight, by the fifth harmonic.** A five-petal corolla has five-fold symmetry, so how far it is turned is exactly the phase of the fifth angular harmonic of its mass. Rotating every petal by a turns the whole flower by a (the five 72° copies factor out), so the lean that zeroes that phase stands the flower upright: the straightener and the ruler that checks it are the same mathematics, with no constant to tune. It is measured on the union of the five petals (the fused bases near the hub cancel, the separated tips that carry the orientation dominate) via the star-shaped identity that the radius cube is the jacobian, not a weight. The lean is baked into the petal's own frame, so the corolla is pure `rotate(i·72°)`. Earlier tries lost: the head centroid left the bent tip turned, and a calibrated overlap constant was a fudge. Posture carries no random jitter; variety lives in shape and color.

**Edge ripple, damped at the shoulder.** A 2.5-wave ripple keeps outlines from reading laser-cut, but at the kernel's peak the shoulder carries the flower's silhouette and a bump there reads as deformity. Damp factor `1 - 0.65·kernel²`.

**Slender corollas are as common as plump ones.** Fullness draws concave (`1 - rng^0.8·0.9`); flank widths reach down to 0.30/0.21 of length; tips are usually round (taper floor 0), pointed ones the exception. Plenty of slender corollas grow in the wild, not just plump ones.

**The visual mass is centered, not the hub.** A five-pointed star reaches `L` up but only `cos 36° · L ≈ 0.81·L` down; centering the hub leaves every flower sitting high in its box. The whole corolla shifts down by `0.0955·L` so the bounding mass centers.

## Color

**OKLCH everywhere, hex only at the edge.** sRGB ramps detour through grey; OKLCH geodesics pass through warm orange the way petals fade. Gradient stops are sampled along the geodesic and converted last, with gamut mapping by walking chroma down.

**Both themes lift chroma, the light more.** Warm paper washes pale petals out by simultaneous contrast, so the light theme takes the bigger push; dark lifts less but still lifts, since the graded look reads best with saturated color on either ground. The first version pushed only dark, which a side-by-side harness exposed as backwards.

**Vibrance, not brightness.** Chroma rides toward the gamut edge with an additive floor that lifts pale tones proportionally hardest, and gamut mapping walks any overshoot back. On light the body stays luminous: an earlier recipe darkened it for contrast and every flower read as standing in shade on bright paper. Legibility moved to the edges instead — a brighter rim, a hotter heart, an ivory floor on the body tones.

**The key light lives inside the color.** The volume lift was pure white and the lit petals faded to pastel: in sRGB, white buys brightness by draining saturation. On light the highlight now carries the body's own hue warmed toward the sun's gold; dark keeps neutral white, where a small lift never washes.

**Shade is dense color, never grey.** Contact shadows carry real chroma and the dark half of each petal falls into a saturated cast of the body itself, applied with weight — a black veil at low alpha only dirtied it. Grey shading was what read as a spent flower.

**Eight cultivar recipes, plus hybrids, as OKLCH spans.** Celadine, Rainbow, Pink Pearl, Sunset, Fuchsia, Gold, Candy Stripe, Carmine. Hybrids 22% of the time, with dominant-parent naming. A ninth, a lavender "Moonlit", lived one day and was retired: it never looked like a plumeria.

**Exposure and hue drift make recipes infinite.** Every bloom prints at its own exposure (pale and milky through deep and saturated, biased gentle: punch centered below 1) and the whole palette drifts together, so harmony survives but no pink repeats. The throat follows at 0.35 strength: even the palest bloom keeps its golden anchor.

**Full moons bloom pale and silvery.** With a `date`, the moon is arithmetic on it (one known new moon plus the synodic month). It only pales the exposure; an earlier version picked a lavender cultivar and another summoned a luna moth, both retired.

## Paint

**No outlines, anywhere.** Petals separate as in photographs: a double contact shadow (crisp line opening into penumbra) under every covering edge, a thin rim of light on the waxy margin, and one key light across the corolla, cast per petal as a gradient for volume. Pale cultivars hold against light paper through the ivory floor on their body tones and the opt-in cast shadow.

**Shadows fade out near the hub.** Contact shadows fade out near the center through a radial mask with a progressive roll-off; the first version's three-stop ramp ended dead and the eye drew a circle (mach banding). Same lesson on the throat core's tail.

**The tube was the phantom ring.** The milky disc that fused petal bases washed the center and stopped on a visible rim. Found by layer-toggling (full, no-shadows, no-core, no-tube, no-grain); now a small funnel glow with a long quiet tail.

**Throat in two registers, starred.** A steady shared core the displacement never touches, plus a flame ellipse per petal so the gold reads as a star (one radial circle cannot follow five petals), its edge torn by per-petal turbulence.

**Thin strokes never ride the strong displacement.** The flame's tear (scale 34 to 84) smears veins into fog. Veins get a whisper of blur outside it; the iris-fiber field flows under its own gentle filter (scale 12). Fibers in two registers plus light beams and throat crypts are what make petals read like living tissue up close.

**The margin is geometry, not a filtered stroke.** A displaced stroke frayed into what read as random stains. Now a ring between the outline and a wandering inset (neighbor-averaged noise, so it curves instead of stepping), pooling at the head, dying along the flanks.

**Anisotropic grain runs lengthwise.** High frequency across the petal, low along it; one shared filter that each petal rotates into a new pattern.

**One key light, faked per petal.** A flat directional fill made each petal read as a cut-out. The key (top left) is baked into a per-petal gradient with the petal's own rotation undone, so the five copies read as one lit dome: bright shoulder toward the light, deeper shadow away, body color through the middle.

**The grade is baked, not filtered.** The first grade was an SVG filter over the composited flower. WebKit rasterizes filter chains in software and painted it visibly paler than Chromium (flower saturation 17% vs 25% on the same seeds); the identical saturate → contrast → gamma chain applied per color at generation time makes the engines match to the decimal and cuts WebKit first paint by a third. Softened toward pale bodies, which a full lift would blow into the paper.

**Pale cultivars hold their edge by shade, not outline.** A near-white rim vanishes on warm paper, so white and pastel petals dissolved. The first cure was a soft inner shadow along the free edge; it read as a grey smudge and retired. Now the body tones take an ivory floor on light (a step of chroma and lightness against the paper) and the opt-in cast shadow does the seating. On dark, white on black already separates, and the contact shadow stays full to carry the boundaries.

**The cast shadow is anchored, and opt-in.** A wide soft shadow spread past every edge and dissolved pale petals into the paper — a halo, not a shadow. Anchored (smaller silhouette, dropped well below, barely blurred) it pools under the corolla and the top edges stay crisp. And it ships off by default: everything inside the outline is the flower's job, everything that touches the surface is the consumer's — the same restraint that keeps glow and bloom opt-in.

**The hub radiates silk, and glows amber.** The radiation is one 72° sector of hair-fine rays in two gold registers, scattered roots and bows, defined once and rotated five times — an iris repeats radially, so the reuse reads true. Anatomy tries (collarette, crypts) read as an eye, not a flower, and died. The hub's glow stays close to the throat's own gold: mixed toward white it was a milky veil, the plastic kind of light.

**The specular hugs the shoulder.** Every free-standing highlight shape — flat ellipse, torn streak, soft lobe with a hot core — eventually read as a disc stranded mid-petal. The specular is the petal's own outline stroked wide and soft with the volume gradient: tied to the edge, it cannot float.

**One paleness axis tunes the paint.** A single measure of how light the body is scales the tip shade, the contact shadow, the cast shadow, the fiber contrast, the grade curve, and the highlight, so white, pastel, and saturated cultivars each get what they need from one number, not per-cultivar branches.

**The ground glow is opt-in.** A baked ground assumes a surface the consumer may not have, so `glow` defaults off and the flower ships bare, the same restraint that keeps the entrance animation opt-in. Pale petals no longer need it to separate; the ivory floor does that intrinsically.

## Motion

**Petals open in scale only; rotation belongs to the corolla.** Any per-petal rotation opens a dark sliver of backdrop between neighbors mid-flight (the "black wedge" bug; it looked like a shadow, it was geometry). Petals fade and scale from the hub, fully opaque by 45% of the timeline, and one shared -6° twist of the whole corolla carries the rotary feel. Gapless by construction.

**Entrance climbs the stack, bottom up.** Petal 0 opens first and each new petal is laid over the one before, the way a hand would stack them. A contact shadow belongs to the petal that casts it, not the one it falls on, so each seam's shadow rides its caster's delay and never appears before the petal that throws it. The closing wedge (petal 0 over petal 4) enters with petal 4, the last to bloom, since the seam cannot close until both edges are on stage.

**The settled flower is the default; bloom is opt-in.** A library should not impose presentation. `plumeria` returns the still flower; `bloom: true` adds the entrance. The animation lives in its own module, kept out of the render, and the petal group ids are exposed so a different entrance can be driven from outside.

**The entrance can live outside the document.** `bloom: "hooks"` emits only data attributes (per-element origin and delay) and the exported `BLOOM_CSS` — one uid-free stylesheet — drives every hooked flower on the page. Sanitizers that strip `<style>` from SVG keep the markup intact, and a different entrance is one CSS override away. `bloom: true` stays for the self-contained file an `<img>` can play.

## Species

**Species are append-only, Unicode-style.** A species freezes when declared done; improvements become its next version for new seeds, and old seeds keep rendering under the version they were born with, so the past never changes. A new flower is a new species beside the old, not a new equation inside it. There is no approval process: a flower conforms if it passes the test-vectors, and that is the whole gate.

**The freeze is a 1.0 promise.** Before 1.0 the plumeria itself is still being shaped: 0.2.0 and 0.3.0 each rework its light and color, so an existing seed grows the newest bloom and the test-vectors are reminted with the release. Past 1.0 that door closes, and a changed look becomes a new species version, never an edit to a frozen one.
