import { bloom as animateBloom, type Bloom, still } from "@/src/plumeria/bloom";
import {
  growPlumeria,
  PLUMERIA_PETAL_COUNT,
  PLUMERIA_VIEWBOX,
  plumeriaCultivarName,
} from "@/src/plumeria/specimen";
import { createPlumeriaPetalPaint } from "@/src/plumeria/svg-petal";
import type { PlumeriaSelection } from "@/src/plumeria/variants";
import { mixTone, toHex } from "@/src/shared/color";
import { fullMoon } from "@/src/shared/moon";
import { number, preciseNumber } from "@/src/svg/format";
import {
  type SvgAttribute,
  type SvgNode,
  serializeSvg,
  svgNode,
  svgPaint,
  svgStyle,
} from "@/src/svg/writer";

export type PlumeriaOptions = Readonly<{
  seed: string;
  date?: string;
  bloom?: boolean;
  glow?: boolean;
  idPrefix?: string;
  shadow?: boolean;
  size?: number;
}> &
  PlumeriaSelection;

type PlumeriaIdentityOptions = Readonly<{ seed: string }> & PlumeriaSelection;

const CENTER = PLUMERIA_VIEWBOX / 2;
const PETAL_STEP = 360 / PLUMERIA_PETAL_COUNT;

export function cultivar({
  seed,
  cultivar: custom,
  variant,
}: PlumeriaIdentityOptions): string {
  return plumeriaCultivarName(seed, custom, variant);
}

export function plumeria({
  seed,
  cultivar: custom,
  variant,
  date,
  bloom = false,
  glow = false,
  idPrefix,
  shadow = false,
  size = PLUMERIA_VIEWBOX,
}: PlumeriaOptions): string {
  if (!Number.isSafeInteger(size) || size < 1 || size > 4096)
    throw new RangeError("SVG size must be an integer from 1 to 4096");
  if (idPrefix !== undefined && !/^[a-z][a-z0-9_-]*$/i.test(idPrefix))
    throw new TypeError(
      "SVG idPrefix must start with a letter and contain only letters, digits, underscores or hyphens"
    );

  const specimen = growPlumeria(
    seed,
    date ? fullMoon(date) : 0,
    custom,
    variant
  );
  const prefix = `p${idPrefix ? `${idPrefix}-` : ""}${specimen.uid}`;
  const id = (key: string) => `${prefix}-${key}`;
  const href = (key: string) => `#${id(key)}`;
  const { form, frame, genome } = specimen;
  const originX = CENTER - frame.scale * frame.centerX;
  const originY = CENTER - frame.scale * frame.centerY;
  const transform = `translate(${number(originX)} ${number(originY)}) scale(${preciseNumber(frame.scale)})`;
  const animation: Bloom = bloom
    ? animateBloom(originX, originY, PLUMERIA_PETAL_COUNT)
    : still;
  const animatedPetal = (index: number, node: SvgNode) =>
    bloom ? svgNode("g", animation.petal(index), [node]) : node;
  const faded = (node: SvgNode) =>
    bloom ? svgNode("g", animation.fade, [node]) : node;
  const angles = Array.from({ length: PLUMERIA_PETAL_COUNT }, (_, index) =>
    number(index * PETAL_STEP)
  );
  const petalPaint = createPlumeriaPetalPaint(specimen, id);
  const definitions = [...petalPaint.definitions];
  const shadowColor = toHex({
    c: genome.body.base.c * 0.5 + 0.018,
    h: genome.body.base.h - 12,
    l: Math.max(0.2, genome.body.base.l - 0.42),
  });

  definitions.push(
    svgNode(
      "filter",
      {
        height: "150%",
        id: id("contact"),
        width: "150%",
        x: "-25%",
        y: "-25%",
      },
      [svgNode("feGaussianBlur", { stdDeviation: 2.2 })]
    )
  );

  const petals: SvgNode[] = [];
  for (const [index, angle] of angles.entries()) {
    petals.push(
      svgNode("g", animation.petal(index), [
        svgNode(
          "g",
          {
            id: id(`g${index}`),
            transform: `${transform} rotate(${angle})`,
          },
          petalPaint.layers
        ),
      ])
    );
    if (index === angles.length - 1) continue;
    petals.push(
      animatedPetal(
        index + 1,
        svgNode(
          "g",
          {
            "clip-path": `url(#${id("clip")})`,
            transform: `${transform} rotate(${angle})`,
          },
          [
            svgNode("use", {
              filter: `url(#${id("contact")})`,
              href: href("p"),
              style: svgPaint(shadowColor, "none", { opacity: 0.18 }),
              transform: `rotate(${number(PETAL_STEP)})`,
            }),
          ]
        )
      )
    );
  }

  definitions.push(
    svgNode("clipPath", { id: id("wedge") }, [
      svgNode("use", {
        href: href("p"),
        style: svgPaint("inherit", "inherit"),
        transform: `${transform} rotate(${angles.at(-1)}) scale(1.012)`,
      }),
    ])
  );
  petals.push(
    animatedPetal(
      PLUMERIA_PETAL_COUNT - 1,
      svgNode("g", { "clip-path": `url(#${id("wedge")})` }, [
        svgNode("use", {
          href: href("g0"),
          style: svgPaint("inherit", "inherit"),
        }),
      ])
    )
  );

  const content: SvgNode[] = [];
  if (glow) {
    const glowId = id("ambient");
    const glowTone = toHex(mixTone(genome.body.base, genome.throat.tone, 0.7));
    definitions.push(
      svgNode("radialGradient", { id: glowId }, [
        svgNode("stop", {
          offset: "0%",
          style: svgStyle({ "stop-color": glowTone, "stop-opacity": 0.065 }),
        }),
        svgNode("stop", {
          offset: "100%",
          style: svgStyle({ "stop-color": glowTone, "stop-opacity": 0 }),
        }),
      ])
    );
    const fadeStyle = animation.fade.style;
    content.push(
      svgNode("ellipse", {
        ...animation.fade,
        cx: number(originX),
        cy: number(originY + 6),
        rx: number(form.length * frame.scale),
        ry: number(form.length * frame.scale * 0.94),
        style: `${svgPaint(`url(#${glowId})`)}${fadeStyle ? `;${fadeStyle}` : ""}`,
      })
    );
  }

  if (shadow) {
    definitions.push(
      svgNode(
        "filter",
        {
          height: "180%",
          id: id("dropf"),
          width: "180%",
          x: "-40%",
          y: "-40%",
        },
        [svgNode("feGaussianBlur", { stdDeviation: 5.5 })]
      )
    );
    content.push(
      faded(
        svgNode(
          "g",
          {
            filter: `url(#${id("dropf")})`,
            opacity: 0.32,
            transform: `translate(${number(originX + 4)} ${number(originY + 18)}) scale(${preciseNumber(0.9 * frame.scale)})`,
          },
          angles.map((angle) =>
            svgNode("use", {
              href: href("p"),
              style: svgPaint(shadowColor),
              transform: `rotate(${angle})`,
            })
          )
        )
      )
    );
  }

  content.push(svgNode("g", animation.corolla, petals));
  const attributes: Readonly<Record<string, SvgAttribute>> = {
    "aria-label": `A ${genome.cultivar} plumeria`,
    height: size,
    role: "img",
    style: svgPaint("#000"),
    viewBox: `0 0 ${PLUMERIA_VIEWBOX} ${PLUMERIA_VIEWBOX}`,
    width: size,
    xmlns: "http://www.w3.org/2000/svg",
  };
  return serializeSvg(
    svgNode("svg", attributes, [svgNode("defs", {}, definitions), ...content])
  );
}
