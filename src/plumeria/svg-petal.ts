import {
  curlBand,
  laminaBand,
  laminaPoint,
  midrib,
  midribPath,
  type PetalForm,
  petalOutline,
} from "@/src/plumeria/petal";
import { evaluatePlumeriaPigment, vectorTone } from "@/src/plumeria/pigment";
import type { PlumeriaSpecimen } from "@/src/plumeria/specimen";
import { mixTone, toHex } from "@/src/shared/color";
import { number, preciseNumber } from "@/src/svg/format";
import { type SvgNode, svgNode, svgPaint, svgStyle } from "@/src/svg/writer";

const BANDS_PER_SIDE = 8;
const COLOR_STOPS = [0, 0.06, 0.14, 0.24, 0.38, 0.54, 0.7, 0.85, 1];
const FIBERS = [-0.72, -0.46, -0.22, 0, 0.22, 0.46, 0.72];

type PetalPaint = Readonly<{
  definitions: readonly SvgNode[];
  layers: readonly SvgNode[];
}>;

function fiberPath(form: PetalForm, across: number): string {
  const side: 1 | -1 = across < 0 ? -1 : 1;
  const width = Math.abs(across);
  return Array.from({ length: 19 }, (_, index) => {
    const progress = index / 18;
    const along = 0.04 + 0.9 * ((1 - Math.cos(Math.PI * progress)) / 2);
    const [x, y] = laminaPoint(form, side, along, width);
    return `${index ? "L" : "M"} ${number(x)} ${number(y)}`;
  }).join(" ");
}

export function createPlumeriaPetalPaint(
  specimen: PlumeriaSpecimen,
  id: (key: string) => string
): PetalPaint {
  const { form, genome, livery } = specimen;
  const [fromX, fromY] = midrib(form, 0);
  const [toX, toY] = midrib(form, 1);
  const definitions: SvgNode[] = [];
  const layers: SvgNode[] = [];

  for (const side of [-1, 1] as const) {
    for (let index = 0; index < BANDS_PER_SIDE; index += 1) {
      const inner = index / BANDS_PER_SIDE;
      const outer = (index + 1) / BANDS_PER_SIDE;
      const across = (side * (inner + outer)) / 2;
      const key = `band-${side < 0 ? "l" : "r"}-${index}`;
      const gradient = id(`paint-${side < 0 ? "l" : "r"}-${index}`);
      definitions.push(
        svgNode(
          "linearGradient",
          {
            gradientUnits: "userSpaceOnUse",
            id: gradient,
            x1: preciseNumber(fromX),
            x2: preciseNumber(toX),
            y1: preciseNumber(fromY),
            y2: preciseNumber(toY),
          },
          COLOR_STOPS.map((along) => {
            const [x, y] = laminaPoint(form, side, along, Math.abs(across));
            const tone = vectorTone(
              evaluatePlumeriaPigment(
                genome,
                livery,
                along,
                across,
                Math.hypot(x, y) / form.length
              )
            );
            return svgNode("stop", {
              offset: `${number(along * 100)}%`,
              style: svgStyle({ "stop-color": toHex(tone) }),
            });
          })
        ),
        svgNode("path", {
          d: laminaBand(form, side, inner, outer, 0, 1, 24),
          id: id(key),
          style: svgPaint("context-fill", "context-stroke"),
        })
      );
      const fill = `url(#${gradient})`;
      layers.push(
        svgNode("use", {
          href: `#${id(key)}`,
          style: svgPaint(fill, fill, {
            "stroke-linejoin": "round",
            "stroke-width": 0.8,
          }),
        })
      );
    }
  }

  const midpoint = vectorTone(
    evaluatePlumeriaPigment(genome, livery, 0.55, 0, 0.55)
  );
  const fiberTone = toHex({
    c: midpoint.c * 0.8 + 0.012,
    h: midpoint.h - 10,
    l: Math.max(0, midpoint.l - 0.13),
  });
  const rimTone = toHex(
    mixTone(genome.body.tip, { c: 0.006, h: genome.body.tip.h, l: 0.99 }, 0.7)
  );
  definitions.push(
    svgNode("path", {
      d: petalOutline(form),
      id: id("p"),
      style: svgPaint("context-fill", "context-stroke"),
    }),
    svgNode("path", {
      d: curlBand(form),
      id: id("roll"),
      style: svgPaint("context-fill", "context-stroke"),
    }),
    svgNode("clipPath", { id: id("clip") }, [
      svgNode("use", {
        href: `#${id("p")}`,
        style: svgPaint("inherit", "inherit"),
      }),
    ]),
    ...FIBERS.map((across, index) =>
      svgNode("path", {
        d: across === 0 ? midribPath(form) : fiberPath(form, across),
        id: id(`fiber-${index}`),
        style: svgPaint("context-fill", "context-stroke"),
      })
    )
  );

  layers.unshift(
    svgNode("use", {
      href: `#${id("p")}`,
      style: svgPaint(toHex(midpoint)),
    })
  );
  layers.push(
    ...FIBERS.map((across, index) =>
      svgNode("use", {
        href: `#${id(`fiber-${index}`)}`,
        style: svgPaint("none", fiberTone, {
          "stroke-linecap": "round",
          "stroke-opacity": across === 0 ? 0.11 : 0.055,
          "stroke-width": across === 0 ? 0.75 : 0.42,
        }),
      })
    ),
    svgNode("use", {
      href: `#${id("p")}`,
      style: svgPaint("none", rimTone, {
        "stroke-opacity": 0.52,
        "stroke-width": 1.15,
      }),
    }),
    svgNode("use", {
      href: `#${id("roll")}`,
      style: svgPaint("#ffffff", "none", { "fill-opacity": 0.13 }),
    })
  );
  return { definitions, layers };
}
