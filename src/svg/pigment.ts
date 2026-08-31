import { polylineDistance } from "@/src/core/curve";
import { evaluatePigment, type FieldSample } from "@/src/core/evaluate";
import type {
  LaminaGeometry,
  Matrix4,
  OrganAppearance,
  OrganGeometry,
  Point3,
} from "@/src/core/model";
import type { FlowerSpecimen } from "@/src/core/species";
import {
  sweepFrameAt,
  sweepFrames,
  sweepPoint,
  sweepRadius,
  sweepSurfacePoint,
} from "@/src/core/sweep";
import { transformPoint } from "@/src/core/transform";
import { type Tone as ColorTone, oklch } from "@/src/shared/color";
import { preciseNumber } from "@/src/svg/format";
import {
  type GeometryBounds,
  geometryBounds,
  nonzeroGradientEndpoints,
  projectEllipsoid,
  projectPoint,
} from "@/src/svg/projection";
import { shadeSvgTone } from "@/src/svg/studio";
import { type ProjectedSweep, sweepSurfaceU } from "@/src/svg/sweep";
import { type SvgNode, svgNode, svgStyle } from "@/src/svg/writer";

function ellipsoidSurfaceSample(
  geometry: Extract<OrganGeometry, { kind: "ellipsoid" }>,
  transform: Matrix4,
  progress: number
): Readonly<{ local: Point3; surfaceU: number; surfaceV: number }> {
  const scaledView: Point3 = [
    geometry.radii[0] * transform[2],
    geometry.radii[1] * transform[6],
    geometry.radii[2] * transform[10],
  ];
  const viewLength = Math.hypot(...scaledView);
  const view: Point3 = [
    scaledView[0] / viewLength,
    scaledView[1] / viewLength,
    scaledView[2] / viewLength,
  ];
  const tangentFor = (axis: Point3): Point3 => {
    const alignment = axis[0] * view[0] + axis[1] * view[1] + axis[2] * view[2];
    return [
      axis[0] - alignment * view[0],
      axis[1] - alignment * view[1],
      axis[2] - alignment * view[2],
    ];
  };
  let tangent = tangentFor([
    geometry.radii[0] * transform[0],
    geometry.radii[1] * transform[4],
    geometry.radii[2] * transform[8],
  ]);
  let tangentLength = Math.hypot(...tangent);
  if (tangentLength < 1e-12) {
    tangent = tangentFor([
      geometry.radii[0] * transform[1],
      geometry.radii[1] * transform[5],
      geometry.radii[2] * transform[9],
    ]);
    tangentLength = Math.hypot(...tangent);
  }
  const direction: Point3 = [
    tangent[0] / tangentLength,
    tangent[1] / tangentLength,
    tangent[2] / tangentLength,
  ];
  const angle = progress * (Math.PI / 2);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const unit: Point3 = [
    view[0] * cosine + direction[0] * sine,
    view[1] * cosine + direction[1] * sine,
    view[2] * cosine + direction[2] * sine,
  ];
  const local: Point3 = [
    geometry.radii[0] * unit[0],
    geometry.radii[1] * unit[1],
    geometry.radii[2] * unit[2],
  ];
  const longitude =
    (((Math.atan2(unit[2], -unit[0]) / (2 * Math.PI)) % 1) + 1) % 1;
  return {
    local,
    surfaceU: longitude * 2 - 1,
    surfaceV: Math.acos(Math.min(1, Math.max(-1, unit[1]))) / Math.PI,
  };
}

export function laminaSectionPoint(
  geometry: LaminaGeometry,
  surfaceU: number,
  progress: number
): Point3 {
  const scaled =
    Math.min(1, Math.max(0, progress)) * (geometry.sections.length - 1);
  const fromIndex = Math.min(geometry.sections.length - 2, Math.floor(scaled));
  const amount = scaled - fromIndex;
  const pointAt = (sectionIndex: number): Point3 => {
    const section = geometry.sections[sectionIndex];
    const edge = surfaceU < 0 ? section.left : section.right;
    const across = Math.abs(surfaceU);
    return [
      section.center[0] + (edge[0] - section.center[0]) * across,
      section.center[1] + (edge[1] - section.center[1]) * across,
      section.center[2] + (edge[2] - section.center[2]) * across,
    ];
  };
  const from = pointAt(fromIndex);
  const to = pointAt(fromIndex + 1);
  return [
    from[0] + (to[0] - from[0]) * amount,
    from[1] + (to[1] - from[1]) * amount,
    from[2] + (to[2] - from[2]) * amount,
  ];
}

export function fieldSample(
  geometry: OrganGeometry,
  transform: Matrix4,
  bounds: GeometryBounds,
  progress: number,
  seed: string,
  surfaceU = 0,
  sweep?: ProjectedSweep
): FieldSample {
  if (geometry.kind === "ellipsoid") {
    // A radial SVG gradient runs from the visible center toward the rim. Find
    // that hemisphere in local ellipsoid space so rotations and reflections
    // sample the same visible tissue as GL.
    const sample = ellipsoidSurfaceSample(geometry, transform, progress);
    return fieldSampleAt(
      geometry,
      transform,
      sample.local,
      seed,
      sample.surfaceU,
      sample.surfaceV
    );
  }
  const local: Point3 =
    geometry.kind === "lamina"
      ? laminaSectionPoint(geometry, surfaceU, progress)
      : geometry.kind === "sweep"
        ? sweepSurfacePoint(
            sweepFrameAt(sweep?.frames ?? sweepFrames(geometry.path), progress),
            sweepRadius(geometry.radius, progress),
            surfaceU
          )
        : [
            (bounds.minimum[0] + bounds.maximum[0]) / 2 +
              (surfaceU * (bounds.maximum[0] - bounds.minimum[0])) / 2,
            bounds.minimum[1] +
              (bounds.maximum[1] - bounds.minimum[1]) * progress,
            0,
          ];
  return fieldSampleAt(geometry, transform, local, seed, surfaceU, progress);
}

export function fieldSampleAt(
  geometry: OrganGeometry,
  transform: Matrix4,
  local: Point3,
  seed: string,
  surfaceU: number,
  surfaceV: number
): FieldSample {
  const [x, y, z] = local;
  const flower = transformPoint(transform, local);
  const features =
    geometry.kind === "lamina"
      ? {
          outline: polylineDistance([x, y], geometry.outline, true),
          ...Object.fromEntries(
            Object.entries(geometry.features).map(([name, points]) => [
              name,
              polylineDistance([x, y], points),
            ])
          ),
        }
      : undefined;
  return {
    features,
    flower: { x: flower[0], y: flower[1], z: flower[2] },
    organ: { x, y, z },
    seed,
    surface: { u: surfaceU, v: surfaceV },
  };
}

export function svgColor(tone: ColorTone): string {
  return oklch(tone.l, tone.c, tone.h);
}

export function gradient(
  id: string,
  geometry: OrganGeometry,
  appearance: OrganAppearance,
  transform: Matrix4,
  specimen: FlowerSpecimen,
  surfaceU = 0,
  projection?: Matrix4,
  sweep?: ProjectedSweep,
  sweepSide?: 0 | 1
): SvgNode {
  const bounds = geometryBounds(geometry);
  const stopCount = geometry.kind === "lamina" ? 7 : 9;
  const stops = Array.from({ length: stopCount }, (_, index) => {
    const progress = index / (stopCount - 1);
    const sampledSurfaceU =
      sweep && sweepSide !== undefined
        ? sweepSurfaceU(sweep, sweepSide, progress)
        : surfaceU;
    const sampled = evaluatePigment(
      appearance.pigment,
      fieldSample(
        geometry,
        transform,
        bounds,
        progress,
        specimen.model.genomeId,
        sampledSurfaceU,
        sweep
      )
    );
    return svgNode("stop", {
      offset: `${progress * 100}%`,
      style: svgStyle({
        "stop-color": svgColor(
          shadeSvgTone(
            sampled,
            progress,
            sampledSurfaceU,
            appearance,
            geometry.kind
          )
        ),
        "stop-opacity": 1,
      }),
    });
  });
  if (geometry.kind === "ellipsoid") {
    if (projection) {
      const ellipse = projectEllipsoid(geometry.radii, projection);
      return svgNode(
        "radialGradient",
        {
          cx: "-0.18",
          cy: "-0.2",
          gradientTransform: `translate(${preciseNumber(ellipse.center[0])} ${preciseNumber(ellipse.center[1])}) rotate(${preciseNumber(ellipse.angle)}) scale(${preciseNumber(ellipse.radiusX)} ${preciseNumber(ellipse.radiusY)})`,
          gradientUnits: "userSpaceOnUse",
          id,
          r: "1",
        },
        stops
      );
    }
    return svgNode(
      "radialGradient",
      { cx: "35%", cy: "30%", id, r: "72%" },
      stops
    );
  }
  const localEndpoints: readonly [Point3, Point3] =
    geometry.kind === "lamina"
      ? [
          laminaSectionPoint(geometry, surfaceU, 0),
          laminaSectionPoint(geometry, surfaceU, 1),
        ]
      : geometry.kind === "sweep"
        ? [sweepPoint(geometry.path, 0), sweepPoint(geometry.path, 1)]
        : [
            [(bounds.minimum[0] + bounds.maximum[0]) / 2, bounds.minimum[1], 0],
            [(bounds.minimum[0] + bounds.maximum[0]) / 2, bounds.maximum[1], 0],
          ];
  const [from, to] = nonzeroGradientEndpoints(
    geometry,
    projection,
    [
      projectPoint(localEndpoints[0], projection),
      projectPoint(localEndpoints[1], projection),
    ],
    sweep
  );
  return svgNode(
    "linearGradient",
    {
      gradientUnits: "userSpaceOnUse",
      id,
      x1: preciseNumber(from[0]),
      x2: preciseNumber(to[0]),
      y1: preciseNumber(from[1]),
      y2: preciseNumber(to[1]),
    },
    stops
  );
}
