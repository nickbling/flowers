# Visual standard

SVG and GL represent the same specimen in different media. They should share anatomy, proportions, pigment landmarks and orientation without sharing pixels.

## Shared facts

Both renderers preserve:

- organ identities, counts, hierarchy and order;
- repeated-organ geometry and symmetry;
- silhouette landmarks and relative proportions;
- throats, margins, bands, midribs and freckles;
- tissue thickness, softness and translucency;
- framing and preferred light direction.

Grow once and pass that specimen to both renderers.

## SVG

SVG is a botanical illustration, not a flattened screenshot of GL.

- Use one transparent colorway on light, dark, saturated and patterned grounds.
- Preserve true white through overlap and restrained edge separation rather than gray fill.
- Keep silhouette and primary color masses legible at 64 px.
- Let fine detail follow anatomy and appear only at larger sizes.
- Build the center from real organs and overlap, not an invented cover disk.
- Keep paint-critical properties inline so host CSS cannot repaint the flower.

## GL

GL is soft botanical tissue with readable volume.

- Broad organs have rounded silhouettes and visible thickness.
- Materials are matte and diffuse-dominant, without clearcoat or metallic glare.
- HDR light reveals curvature and overlap without bleaching pigment.
- Grooves are recessed relief whose shadows come from geometry and normals.
- Contact shadow explains depth without outlining every organ.
- Translucency remains restrained and follows tissue thickness.

Review clay GL before pigment. If the anatomy is flat or confused in clay, material and light cannot rescue it.

## Variation and review

A seed varies one plausible individual inside a cultivar. Large changes in color, structure or proportion belong to named cultivars, and published phenotype changes require a new revision.

Automation checks identity, geometry, bounds, repeated-organ reuse and SVG/GL correspondence. A maintainer still reviews botanical recognition, every cultivar, the named boundary cases, SVG at collection and hero sizes, and final and clay GL on light, gray and dark grounds.
