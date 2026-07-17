import type {
  FlowerModel,
  OrganAppearance,
  OrganGeometry,
} from "@/src/core/model";
import type { Tone } from "@/src/shared/color";
import { number, preciseNumber, spatialNumber } from "@/src/svg/format";
import { type SvgNode, svgNode, svgStyle } from "@/src/svg/writer";

export type SvgSurfacePalette = Readonly<{
  fiberHighlight: Tone;
  fiberShadow: Tone;
  outline: Tone;
  outlineOpacity: number;
  rim: Tone;
}>;

export type SvgVectorLight = Readonly<{
  definitions: readonly SvgNode[];
  overlay?: SvgNode;
}>;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function shadeSvgTone(
  tone: Tone,
  progress: number,
  surfaceU: number,
  appearance: OrganAppearance,
  geometry: OrganGeometry["kind"]
): Tone {
  if (geometry !== "lamina") {
    const highlight = Math.exp(-(((progress - 0.62) / 0.3) ** 2));
    const base = Math.exp(-((progress / 0.18) ** 2));
    const fold = Math.exp(-(((progress - 0.2) / 0.24) ** 2));
    return {
      c: tone.c * (1 + 0.035 * highlight),
      h: tone.h,
      l: clamp(
        tone.l +
          0.025 * appearance.tissue.softness * highlight -
          0.045 * base -
          0.014 * fold +
          0.016 * (1 - surfaceU * surfaceU)
      ),
    };
  }
  const shoulder = Math.exp(-(((progress - 0.62) / 0.29) ** 2));
  const base = Math.exp(-((progress / 0.18) ** 2));
  const fold = Math.exp(-(((progress - 0.2) / 0.22) ** 2));
  const edge = Math.abs(surfaceU) ** 1.7;
  const transverse = 0.008 * (1 - surfaceU * surfaceU) - 0.018 * edge;
  return {
    c: tone.c * (1 + 0.06 * shoulder + 0.04 * base + 0.025 * edge),
    h: tone.h,
    l: clamp(
      tone.l +
        0.014 * appearance.tissue.softness * shoulder -
        0.068 * base -
        0.018 * fold +
        transverse
    ),
  };
}

export function svgSurfacePalette(tone: Tone): SvgSurfacePalette {
  const paleness = clamp((tone.l - 0.78) / 0.18);
  return {
    fiberHighlight: {
      c: tone.c * 0.32,
      h: tone.h,
      l: clamp(tone.l + 0.1),
    },
    fiberShadow: {
      c: tone.c * 0.78,
      h: tone.h,
      l: clamp(tone.l - 0.14),
    },
    outline: {
      c: tone.c * 0.75,
      h: tone.h,
      l: clamp(tone.l - 0.21),
    },
    outlineOpacity: 0.42 + 0.28 * paleness,
    rim: {
      c: tone.c * 0.34,
      h: tone.h,
      l: clamp(tone.l + 0.11),
    },
  };
}

export function createSvgVectorLight(
  model: FlowerModel,
  prefix: string,
  compositionId: string
): SvgVectorLight {
  const [rawX, rawY, rawZ] = model.portrait.keyLight;
  const length = Math.hypot(rawX, rawY, rawZ);
  const lightX = rawX / length;
  const lightY = rawY / length;
  const lightZ = rawZ / length;
  const planar = Math.hypot(lightX, lightY);
  if (planar < 1e-10) return { definitions: [] };

  const directionX = lightX / planar;
  const directionY = lightY / planar;
  const { maximum, minimum } = model.portrait.bounds;
  const width = maximum[0] - minimum[0];
  const height = maximum[1] - minimum[1];
  const centerX = (minimum[0] + maximum[0]) / 2;
  const centerY = (minimum[1] + maximum[1]) / 2;
  const extent =
    (Math.abs(directionX) * width + Math.abs(directionY) * height) / 2;
  const gradientId = `${prefix}-key-light`;
  const maskId = `${prefix}-silhouette`;
  const shadowOpacity = 0.042 + 0.02 * planar;
  const highlightOpacity = 0.034 + 0.016 * planar + 0.006 * Math.max(0, lightZ);

  const gradient = svgNode(
    "linearGradient",
    {
      gradientUnits: "userSpaceOnUse",
      id: gradientId,
      x1: spatialNumber(centerX - directionX * extent, width),
      x2: spatialNumber(centerX + directionX * extent, width),
      y1: spatialNumber(centerY - directionY * extent, height),
      y2: spatialNumber(centerY + directionY * extent, height),
    },
    [
      svgNode("stop", {
        offset: "0%",
        style: svgStyle({
          "stop-color": "#263044",
          "stop-opacity": number(shadowOpacity),
        }),
      }),
      svgNode("stop", {
        offset: "45%",
        style: svgStyle({ "stop-color": "#263044", "stop-opacity": 0 }),
      }),
      svgNode("stop", {
        offset: "55%",
        style: svgStyle({ "stop-color": "#fffaf0", "stop-opacity": 0 }),
      }),
      svgNode("stop", {
        offset: "100%",
        style: svgStyle({
          "stop-color": "#fffaf0",
          "stop-opacity": number(highlightOpacity),
        }),
      }),
    ]
  );
  const mask = svgNode(
    "mask",
    {
      height: preciseNumber(height),
      id: maskId,
      maskContentUnits: "userSpaceOnUse",
      maskUnits: "userSpaceOnUse",
      style: svgStyle({ "mask-type": "alpha" }),
      width: preciseNumber(width),
      x: spatialNumber(minimum[0], width),
      y: spatialNumber(minimum[1], height),
    },
    [svgNode("use", { href: `#${compositionId}` })]
  );
  const overlay = svgNode("rect", {
    height: preciseNumber(height),
    mask: `url(#${maskId})`,
    style: svgStyle({ fill: `url(#${gradientId})`, stroke: "none" }),
    width: preciseNumber(width),
    x: spatialNumber(minimum[0], width),
    y: spatialNumber(minimum[1], height),
  });
  return { definitions: [gradient, mask], overlay };
}
