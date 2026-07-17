import { auditSpecimen } from "@/src/core/audit";
import { catmullRomControls } from "@/src/core/curve";
import { evaluatePigment, type FieldSample } from "@/src/core/evaluate";
import type {
  FlowerModel,
  LaminaGeometry,
  Matrix4,
  Organ,
  OrganAppearance,
  OrganGeometry,
  OrganNode,
  Point2,
  Point3,
} from "@/src/core/model";
import { pigmentUsesSpace } from "@/src/core/pigment";
import type { FlowerSpecimen } from "@/src/core/species";
import {
  type SweepFrame,
  sweepFrameAt,
  sweepFrames,
  sweepPoint,
  sweepRadius,
  sweepSegments,
  sweepSurfacePoint,
} from "@/src/core/sweep";
import { IDENTITY_TRANSFORM, multiplyTransforms } from "@/src/core/transform";
import { type Tone as ColorTone, oklch } from "@/src/shared/color";
import {
  instanceNumber,
  number,
  preciseNumber,
  spatialNumber,
} from "@/src/svg/format";
import {
  createSvgVectorLight,
  shadeSvgTone,
  svgSurfacePalette,
} from "@/src/svg/studio";
import {
  type SvgNode,
  serializeSvg,
  svgNode,
  svgStyle,
} from "@/src/svg/writer";

const VIEWBOX = 480;
const LAMINA_BANDS = 12;

export type SvgRenderOptions = Readonly<{
  /** Optional opaque ground. Omit it for a transparent document. */
  background?: `#${string}`;
  /** Prefix for document-local IDs when several SVGs share one DOM tree. */
  idPrefix?: string;
  /** Fraction of the frame kept clear around the model. */
  padding?: number;
  /** Width and height attributes in CSS pixels. */
  size?: number;
  title?: string;
}>;

type DrawOrgan = Readonly<{
  order: number;
  organ: Organ;
  transform: Matrix4;
}>;

type GeometryBounds = Readonly<{
  maximum: Point3;
  minimum: Point3;
}>;

function transformAttribute(matrix: Matrix4, span: Point2): string {
  const scaleX = Math.hypot(matrix[0], matrix[1]);
  const scaleY = Math.hypot(matrix[4], matrix[5]);
  const orthogonality = matrix[0] * matrix[4] + matrix[1] * matrix[5];
  if (
    Math.abs(scaleX - 1) < 1e-8 &&
    Math.abs(scaleY - 1) < 1e-8 &&
    Math.abs(orthogonality) < 1e-8 &&
    matrix[0] * matrix[5] - matrix[1] * matrix[4] > 0
  ) {
    const angle = (Math.atan2(matrix[1], matrix[0]) * 180) / Math.PI;
    return `translate(${spatialNumber(matrix[12], span[0])} ${spatialNumber(matrix[13], span[1])}) rotate(${instanceNumber(angle)})`;
  }
  const values = [matrix[0], matrix[1], matrix[4], matrix[5]].map(
    preciseNumber
  );
  values.push(
    spatialNumber(matrix[12], span[0]),
    spatialNumber(matrix[13], span[1])
  );
  return `matrix(${values.join(" ")})`;
}

function transformPoint(matrix: Matrix4, point: Point3): Point3 {
  const [x, y, z] = point;
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
  ];
}

type ProjectionPlan = Readonly<{
  definition?: Matrix4;
  key: string;
  use?: Matrix4;
}>;

function stableProjectionValue(value: number): number {
  if (Math.abs(value) < 1e-12) return 0;
  return Math.round(value * 1e12) / 1e12;
}

function projectionPlan(transform: Matrix4): ProjectionPlan {
  if (Math.abs(transform[8]) <= 1e-10 && Math.abs(transform[9]) <= 1e-10)
    return { key: "", use: transform };
  const determinant = transform[0] * transform[5] - transform[1] * transform[4];
  const scale =
    Math.hypot(transform[0], transform[1]) *
    Math.hypot(transform[4], transform[5]);
  if (Math.abs(determinant) > Math.max(1e-12, scale * 1e-8)) {
    const depthX = stableProjectionValue(
      (transform[5] * transform[8] - transform[4] * transform[9]) / determinant
    );
    const depthY = stableProjectionValue(
      (-transform[1] * transform[8] + transform[0] * transform[9]) / determinant
    );
    const definition: Matrix4 = [
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      depthX,
      depthY,
      1,
      0,
      0,
      0,
      0,
      1,
    ];
    return {
      definition,
      key: `/depth/${depthX},${depthY}`,
      use: transform,
    };
  }
  return {
    definition: transform,
    key: `/projection/${transform.join(",")}`,
  };
}

function projectPoint(point: Point3, projection?: Matrix4): Point2 {
  if (!projection) return [point[0], point[1]];
  const transformed = transformPoint(projection, point);
  return [transformed[0], transformed[1]];
}

type ProjectedEllipse = Readonly<{
  angle: number;
  center: Point2;
  radiusX: number;
  radiusY: number;
}>;

function projectEllipsoid(radii: Point3, transform: Matrix4): ProjectedEllipse {
  const xx =
    (transform[0] * radii[0]) ** 2 +
    (transform[4] * radii[1]) ** 2 +
    (transform[8] * radii[2]) ** 2;
  const yy =
    (transform[1] * radii[0]) ** 2 +
    (transform[5] * radii[1]) ** 2 +
    (transform[9] * radii[2]) ** 2;
  const xy =
    transform[0] * transform[1] * radii[0] ** 2 +
    transform[4] * transform[5] * radii[1] ** 2 +
    transform[8] * transform[9] * radii[2] ** 2;
  const discriminant = Math.hypot(xx - yy, 2 * xy);
  const radiusX = Math.sqrt(Math.max(0, (xx + yy + discriminant) / 2));
  const radiusY = Math.sqrt(Math.max(0, (xx + yy - discriminant) / 2));
  const center = projectPoint([0, 0, 0], transform);
  return {
    angle: (Math.atan2(2 * xy, xx - yy) * 90) / Math.PI,
    center,
    radiusX,
    radiusY,
  };
}

function flatten(
  nodes: readonly OrganNode[],
  parent = IDENTITY_TRANSFORM,
  output: DrawOrgan[] = []
): readonly DrawOrgan[] {
  for (const node of nodes) {
    if (node.kind === "group") {
      flatten(
        node.children,
        multiplyTransforms(parent, node.transform),
        output
      );
      continue;
    }
    if (node.kind === "instances") {
      for (const transform of node.transforms)
        output.push({
          order: output.length,
          organ: node.template,
          transform: multiplyTransforms(
            parent,
            multiplyTransforms(transform, node.template.transform)
          ),
        });
      continue;
    }
    output.push({
      order: output.length,
      organ: node,
      transform: multiplyTransforms(parent, node.transform),
    });
  }
  return output;
}

function catmullRom(points: readonly Point2[], closed: boolean): string {
  if (points.length === 0) return "";
  if (points.length === 1)
    return `M ${preciseNumber(points[0][0])} ${preciseNumber(points[0][1])}`;
  const at = (index: number): Point2 => {
    if (closed)
      return points[((index % points.length) + points.length) % points.length];
    return points[Math.min(points.length - 1, Math.max(0, index))];
  };
  const limit = closed ? points.length : points.length - 1;
  let path = `M ${preciseNumber(points[0][0])} ${preciseNumber(points[0][1])}`;
  for (const [index] of points.entries()) {
    if (index === limit) break;
    const p0 = at(index - 1);
    const p1 = at(index);
    const p2 = at(index + 1);
    const p3 = at(index + 2);
    const [firstX, secondX] = catmullRomControls(p0[0], p1[0], p2[0], p3[0]);
    const [firstY, secondY] = catmullRomControls(p0[1], p1[1], p2[1], p3[1]);
    path += ` C ${preciseNumber(firstX)} ${preciseNumber(firstY)} ${preciseNumber(secondX)} ${preciseNumber(secondY)} ${preciseNumber(p2[0])} ${preciseNumber(p2[1])}`;
  }
  return closed ? `${path} Z` : path;
}

function polygon(points: readonly Point2[]): string {
  return `${points
    .map(
      ([x, y], index) =>
        `${index === 0 ? "M" : "L"} ${preciseNumber(x)} ${preciseNumber(y)}`
    )
    .join(" ")} Z`;
}

function geometryBounds(geometry: OrganGeometry): GeometryBounds {
  if (geometry.kind === "ellipsoid")
    return {
      maximum: geometry.radii,
      minimum: [-geometry.radii[0], -geometry.radii[1], -geometry.radii[2]],
    };
  const points: readonly Point3[] =
    geometry.kind === "lamina"
      ? geometry.outline.map(([x, y]) => [x, y, 0])
      : geometry.kind === "sweep"
        ? geometry.path
        : geometry.positions;
  const radius = geometry.kind === "sweep" ? Math.max(...geometry.radius) : 0;
  return {
    maximum: [
      Math.max(...points.map((point) => point[0])) + radius,
      Math.max(...points.map((point) => point[1])) + radius,
      Math.max(...points.map((point) => point[2])) + radius,
    ],
    minimum: [
      Math.min(...points.map((point) => point[0])) - radius,
      Math.min(...points.map((point) => point[1])) - radius,
      Math.min(...points.map((point) => point[2])) - radius,
    ],
  };
}

function renderedDepth(geometry: OrganGeometry, transform: Matrix4): number {
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  const include = (point: Point3, radius = 0) => {
    const center = transformPoint(transform, point)[2];
    const extent =
      radius * Math.hypot(transform[2], transform[6], transform[10]);
    minimum = Math.min(minimum, center - extent);
    maximum = Math.max(maximum, center + extent);
  };

  if (geometry.kind === "ellipsoid") {
    // An ellipsoid is symmetric, so its transformed depth midpoint is its
    // transformed origin regardless of rotation or non-uniform scale.
    return transformPoint(transform, [0, 0, 0])[2];
  }
  if (geometry.kind === "sweep") {
    const segments = sweepSegments(geometry.path.length);
    for (let index = 0; index <= segments; index += 1) {
      const progress = index / segments;
      include(
        sweepPoint(geometry.path, progress),
        sweepRadius(geometry.radius, progress)
      );
    }
  } else if (geometry.kind === "mesh") {
    geometry.positions.forEach((point) => {
      include(point);
    });
  } else {
    geometry.sections.forEach((section) => {
      for (const point of [section.left, section.center, section.right]) {
        include([point[0], point[1], point[2] - section.thickness]);
        include([point[0], point[1], point[2] + section.thickness]);
      }
    });
  }
  return (minimum + maximum) / 2;
}

function meshDepthCoefficients(transform: Matrix4): Point3 {
  // Triangle ordering uses these coefficients without normalization. Preserve
  // them verbatim so a cached definition cannot cross an ordering threshold
  // that another transform did not.
  return [transform[2], transform[6], transform[10]];
}

function pointDistance(
  point: Point2,
  feature: readonly Point2[],
  closed = false
): number {
  let distance = Number.POSITIVE_INFINITY;
  const segments = closed ? feature.length : feature.length - 1;
  for (const [index, from] of feature.entries()) {
    if (index === segments) break;
    const to = feature[(index + 1) % feature.length];
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const lengthSquared = dx * dx + dy * dy;
    const amount =
      lengthSquared === 0
        ? 0
        : Math.min(
            1,
            Math.max(
              0,
              ((point[0] - from[0]) * dx + (point[1] - from[1]) * dy) /
                lengthSquared
            )
          );
    distance = Math.min(
      distance,
      Math.hypot(
        point[0] - (from[0] + dx * amount),
        point[1] - (from[1] + dy * amount)
      )
    );
  }
  return distance;
}

type ProjectedSweep = Readonly<{
  frames: readonly SweepFrame[];
  halves: readonly [readonly Point2[], readonly Point2[]];
  key: string;
  outline: readonly Point2[];
  surfaceAngles: readonly [readonly number[], readonly number[]];
}>;

function projectVector(transform: Matrix4, vector: Point3): Point2 {
  return [
    transform[0] * vector[0] +
      transform[4] * vector[1] +
      transform[8] * vector[2],
    transform[1] * vector[0] +
      transform[5] * vector[1] +
      transform[9] * vector[2],
  ];
}

function visibleSweepAngle(frame: SweepFrame, transform: Matrix4): number {
  const tangent = projectVector(transform, frame.tangent);
  const normal = projectVector(transform, frame.normal);
  const binormal = projectVector(transform, frame.binormal);
  const tangentLength = Math.hypot(...tangent);
  const side: Point2 =
    tangentLength > 1e-10
      ? [-tangent[1] / tangentLength, tangent[0] / tangentLength]
      : Math.hypot(normal[0], binormal[0]) >= Math.hypot(normal[1], binormal[1])
        ? [1, 0]
        : [0, 1];
  const cosine = -(normal[0] * side[0] + normal[1] * side[1]);
  const sine = binormal[0] * side[0] + binormal[1] * side[1];
  if (Math.hypot(cosine, sine) < 1e-12) return 0;
  return Math.atan2(sine, cosine);
}

function continuousAngles(values: readonly number[]): readonly number[] {
  const result = [values[0]];
  for (const [index, rawValue] of values.entries()) {
    if (index === 0) continue;
    let value = rawValue;
    while (value - result[index - 1] > Math.PI) value -= 2 * Math.PI;
    while (value - result[index - 1] < -Math.PI) value += 2 * Math.PI;
    result.push(value);
  }
  return result;
}

function surfaceUForAngle(angle: number): number {
  const wrapped = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return wrapped / Math.PI - 1;
}

function sweepSurfaceU(
  sweep: ProjectedSweep,
  side: 0 | 1,
  progress: number
): number {
  const angles = sweep.surfaceAngles[side];
  const scaled = Math.max(0, Math.min(1, progress)) * (angles.length - 1);
  const from = Math.min(angles.length - 2, Math.floor(scaled));
  const amount = scaled - from;
  return surfaceUForAngle(
    angles[from] + (angles[from + 1] - angles[from]) * amount
  );
}

function projectedSweep(
  geometry: Extract<OrganGeometry, { kind: "sweep" }>,
  transform: Matrix4,
  projection?: Matrix4
): ProjectedSweep {
  const frames = sweepFrames(geometry.path);
  const path = frames.map((frame) => projectPoint(frame.center, projection));
  const firstAngles = continuousAngles(
    frames.map((frame) => visibleSweepAngle(frame, transform))
  );
  const surfaceAngles = [
    firstAngles,
    firstAngles.map((angle) => angle + Math.PI),
  ] as const;
  const pointsFor = (angles: readonly number[]): readonly Point2[] =>
    frames.map((frame, index) => {
      const progress = index / (frames.length - 1);
      return projectPoint(
        sweepSurfacePoint(
          frame,
          sweepRadius(geometry.radius, progress),
          surfaceUForAngle(angles[index])
        ),
        projection
      );
    });
  const sidePoints = [
    pointsFor(surfaceAngles[0]),
    pointsFor(surfaceAngles[1]),
  ] as const;
  const projectedLength = path.slice(1).reduce((length, point, index) => {
    const previous = path[index];
    return length + Math.hypot(point[0] - previous[0], point[1] - previous[1]);
  }, 0);
  const key = JSON.stringify(
    surfaceAngles.map((angles) =>
      angles.map((angle) => stableProjectionValue(surfaceUForAngle(angle)))
    )
  );
  if (projectedLength < 1e-10) {
    const widest = geometry.radius.reduce(
      (selected, radius, index) =>
        radius > geometry.radius[selected] ? index : selected,
      0
    );
    const progress = widest / (geometry.radius.length - 1);
    const frame = sweepFrameAt(frames, progress);
    const radius = geometry.radius[widest];
    const from = visibleSweepAngle(frame, transform);
    const pointAt = (angle: number): Point2 =>
      projectPoint(
        sweepSurfacePoint(frame, radius, surfaceUForAngle(angle)),
        projection
      );
    const arc = (start: number) =>
      Array.from({ length: 13 }, (_, index) =>
        pointAt(start + (index * Math.PI) / 12)
      );
    return {
      frames,
      halves: [arc(from), arc(from + Math.PI)],
      key,
      outline: Array.from({ length: 24 }, (_, index) =>
        pointAt(from + (index * 2 * Math.PI) / 24)
      ),
      surfaceAngles,
    };
  }
  const [first, second] = sidePoints;
  return {
    frames,
    halves: [
      [...path, ...[...first].reverse()],
      [...second, ...[...path].reverse()],
    ],
    key,
    outline: [...first, ...[...second].reverse()],
    surfaceAngles,
  };
}

function nonzeroGradientEndpoints(
  geometry: Exclude<OrganGeometry, { kind: "ellipsoid" }>,
  projection: Matrix4 | undefined,
  endpoints: readonly [Point2, Point2],
  sweep?: ProjectedSweep
): readonly [Point2, Point2] {
  const [from, to] = endpoints;
  if (Math.hypot(to[0] - from[0], to[1] - from[1]) > 1e-10) return endpoints;

  // An open sweep may return to its starting point, and a planar organ may be
  // viewed edge-on. SVG gradients with coincident endpoints are undefined, so
  // use the longest visible extent as a deterministic fallback direction.
  let points: readonly Point2[];
  if (geometry.kind === "lamina")
    points = geometry.outline.map(([x, y]) =>
      projectPoint([x, y, 0], projection)
    );
  else if (geometry.kind === "sweep") {
    if (!sweep)
      throw new Error("projected sweep is required for sweep gradients");
    points = sweep.outline;
  } else
    points = geometry.positions.map((point) => projectPoint(point, projection));
  const minimumX = Math.min(...points.map((point) => point[0]));
  const maximumX = Math.max(...points.map((point) => point[0]));
  const minimumY = Math.min(...points.map((point) => point[1]));
  const maximumY = Math.max(...points.map((point) => point[1]));
  const width = maximumX - minimumX;
  const height = maximumY - minimumY;
  if (width > 1e-10 && width >= height) {
    const centerY = (minimumY + maximumY) / 2;
    return [
      [minimumX, centerY],
      [maximumX, centerY],
    ];
  }
  if (height > 1e-10) {
    const centerX = (minimumX + maximumX) / 2;
    return [
      [centerX, minimumY],
      [centerX, maximumY],
    ];
  }
  return [from, [from[0] + 1, from[1]]];
}

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

function laminaSectionPoint(
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

function fieldSample(
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

function fieldSampleAt(
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
          outline: pointDistance([x, y], geometry.outline, true),
          ...Object.fromEntries(
            Object.entries(geometry.features).map(([name, points]) => [
              name,
              pointDistance([x, y], points),
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

function color(tone: ColorTone): string {
  return oklch(tone.l, tone.c, tone.h);
}

function gradient(
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
        "stop-color": color(
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

function pathStyle(
  fill: string,
  stroke: string,
  strokeWidth: number,
  extra: Readonly<Record<string, number | string | undefined>> = {}
): string {
  return svgStyle({
    fill,
    "paint-order": "stroke fill",
    stroke,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "stroke-width": strokeWidth,
    "vector-effect": "non-scaling-stroke",
    ...extra,
  });
}

function laminaNodes(
  geometry: LaminaGeometry,
  fills: readonly string[],
  outline: string,
  rim: string,
  fiberShadow: string,
  fiberHighlight: string,
  thickness: number,
  outlineOpacity: number,
  projection?: Matrix4
): readonly SvgNode[] {
  const sectionPoint = (surfaceU: number, sectionIndex: number): Point2 =>
    projectPoint(
      laminaSectionPoint(
        geometry,
        surfaceU,
        sectionIndex / (geometry.sections.length - 1)
      ),
      projection
    );
  const projectedOutline = projection
    ? [
        ...geometry.sections.map((_, index) => sectionPoint(1, index)),
        ...geometry.sections
          .slice(1, -1)
          .map((_, index) =>
            sectionPoint(-1, geometry.sections.length - 2 - index)
          ),
      ]
    : geometry.outline;
  const shape = catmullRom(projectedOutline, true);
  const midrib = catmullRom(
    geometry.sections.map((_, index) => sectionPoint(0, index)),
    false
  );
  const features = Object.entries(geometry.features)
    .filter(([name]) => name !== "midrib")
    .map(([, points]) =>
      svgNode("path", {
        d: catmullRom(
          points.map(([x, y]) => projectPoint([x, y, 0], projection)),
          false
        ),
        style: pathStyle("none", outline, 0.45, {
          "stroke-opacity": 0.16,
        }),
      })
    );
  const bands = fills.map((fill, index) => {
    const fromU = -1 + (2 * index) / fills.length;
    const toU = -1 + (2 * (index + 1)) / fills.length;
    const forward = geometry.sections.map((_, sectionIndex) =>
      sectionPoint(toU, sectionIndex)
    );
    const reverse = [...geometry.sections].reverse().map((_, reverseIndex) => {
      const sectionIndex = geometry.sections.length - 1 - reverseIndex;
      return sectionPoint(fromU, sectionIndex);
    });
    return svgNode("path", {
      d: catmullRom([...forward, ...reverse], true),
      style: pathStyle(fill, fill, 0.38, { "stroke-opacity": 1 }),
    });
  });
  const fiberProfiles = [
    [-0.67, 0.06, 0.86, 0.38, 0.095],
    [-0.32, 0.11, 0.78, 0.31, 0.075],
    [-0.05, 0.04, 0.96, 0.36, 0.11],
    [0.31, 0.08, 0.88, 0.32, 0.085],
    [0.66, 0.12, 0.82, 0.29, 0.075],
  ] as const;
  const fibers = fiberProfiles.flatMap(
    ([surfaceU, start, end, strokeWidth, opacity]) => {
      const first = Math.max(
        1,
        Math.floor(start * (geometry.sections.length - 1))
      );
      const last = Math.min(
        geometry.sections.length - 2,
        Math.ceil(end * (geometry.sections.length - 1))
      );
      const path = (offset: number) =>
        catmullRom(
          Array.from({ length: last - first + 1 }, (_, index) =>
            sectionPoint(surfaceU + offset, first + index)
          ),
          false
        );
      return [
        svgNode("path", {
          d: path(0),
          style: pathStyle("none", fiberShadow, strokeWidth, {
            "stroke-opacity": opacity,
          }),
        }),
        svgNode("path", {
          d: path(0.014),
          style: pathStyle("none", fiberHighlight, strokeWidth * 0.78, {
            "stroke-opacity": opacity * 0.82,
          }),
        }),
      ];
    }
  );
  return [
    svgNode("path", {
      d: shape,
      style: pathStyle("none", outline, 1.1 + 1.9 * thickness, {
        "stroke-opacity": outlineOpacity,
      }),
    }),
    ...bands,
    ...fibers,
    svgNode("path", {
      d: midrib,
      style: pathStyle("none", outline, 0.55, { "stroke-opacity": 0.14 }),
    }),
    ...features,
    svgNode("path", {
      d: shape,
      style: pathStyle("none", rim, 0.35 + 1.1 * thickness, {
        "stroke-opacity": 0.48,
      }),
    }),
  ];
}

function geometryNode(
  id: string,
  gradientIds: readonly string[],
  geometry: OrganGeometry,
  appearance: OrganAppearance,
  transform: Matrix4,
  specimen: FlowerSpecimen,
  projection?: Matrix4,
  projected?: ProjectedSweep
): readonly SvgNode[] {
  const midpointSurfaceU = projected ? sweepSurfaceU(projected, 0, 0.5) : 0;
  const midpoint = evaluatePigment(
    appearance.pigment,
    fieldSample(
      geometry,
      transform,
      geometryBounds(geometry),
      0.5,
      specimen.model.genomeId,
      midpointSurfaceU,
      projected
    )
  );
  const palette = svgSurfacePalette(midpoint);
  const outline = color(palette.outline);
  const rim = color(palette.rim);
  const fill = gradientIds[0] ? `url(#${gradientIds[0]})` : color(midpoint);
  if (geometry.kind === "lamina")
    return [
      svgNode(
        "g",
        { id },
        laminaNodes(
          geometry,
          gradientIds.map((gradientId) => `url(#${gradientId})`),
          outline,
          rim,
          color(palette.fiberShadow),
          color(palette.fiberHighlight),
          appearance.tissue.thickness,
          palette.outlineOpacity,
          projection
        )
      ),
    ];
  if (geometry.kind === "ellipsoid") {
    const ellipse = projection
      ? projectEllipsoid(geometry.radii, projection)
      : {
          angle: 0,
          center: [0, 0] as Point2,
          radiusX: geometry.radii[0],
          radiusY: geometry.radii[1],
        };
    return [
      svgNode("ellipse", {
        cx: preciseNumber(ellipse.center[0]),
        cy: preciseNumber(ellipse.center[1]),
        id,
        rx: preciseNumber(ellipse.radiusX),
        ry: preciseNumber(ellipse.radiusY),
        style: pathStyle(fill, outline, 0.65, { "stroke-opacity": 0.3 }),
        transform:
          Math.abs(ellipse.angle) > 1e-8
            ? `rotate(${number(ellipse.angle)} ${preciseNumber(ellipse.center[0])} ${preciseNumber(ellipse.center[1])})`
            : undefined,
      }),
    ];
  }
  if (geometry.kind === "sweep") {
    const sweep = projected ?? projectedSweep(geometry, transform, projection);
    return [
      svgNode("g", { id }, [
        ...sweep.halves.map((half, index) =>
          svgNode("path", {
            d: polygon(half),
            style: svgStyle({
              fill: `url(#${gradientIds[index]})`,
              stroke: "none",
            }),
          })
        ),
        svgNode("path", {
          d: polygon(sweep.outline),
          style: pathStyle("none", outline, 0.35, {
            "stroke-opacity": 0.24,
          }),
        }),
      ]),
    ];
  }
  const bounds = geometryBounds(geometry);
  const triangles = Array.from(
    { length: geometry.indices.length / 3 },
    (_, triangle) => {
      const points = [0, 1, 2].map(
        (offset) => geometry.positions[geometry.indices[triangle * 3 + offset]]
      );
      const depth =
        points.reduce(
          (sum, point) => sum + transformPoint(transform, point)[2],
          0
        ) / 3;
      return { depth, points, triangle };
    }
  ).sort((left, right) => {
    if (left.depth < right.depth) return -1;
    if (left.depth > right.depth) return 1;
    return left.triangle - right.triangle;
  });
  const children = triangles.map(({ points, triangle }) => {
    const projectedPoints = points.map((point) =>
      projectPoint(point, projection)
    );
    const coordinates = geometry.surfaceCoordinates
      ? [0, 1, 2].map(
          (offset) =>
            geometry.surfaceCoordinates?.[
              geometry.indices[triangle * 3 + offset]
            ]
        )
      : undefined;
    const local = [0, 1, 2].map((axis) =>
      points.reduce((sum, point) => sum + point[axis], 0)
    ) as [number, number, number];
    local[0] /= 3;
    local[1] /= 3;
    local[2] /= 3;
    const surfaceU = coordinates
      ? (coordinates.reduce(
          (sum, coordinate) => sum + (coordinate?.[0] ?? 0),
          0
        ) /
          3) *
          2 -
        1
      : ((local[0] - bounds.minimum[0]) /
          Math.max(1e-9, bounds.maximum[0] - bounds.minimum[0])) *
          2 -
        1;
    const surfaceV = coordinates
      ? coordinates.reduce(
          (sum, coordinate) => sum + (coordinate?.[1] ?? 0),
          0
        ) / 3
      : (local[1] - bounds.minimum[1]) /
        Math.max(1e-9, bounds.maximum[1] - bounds.minimum[1]);
    const triangleFill = color(
      shadeSvgTone(
        evaluatePigment(
          appearance.pigment,
          fieldSampleAt(
            geometry,
            transform,
            local,
            specimen.model.genomeId,
            surfaceU,
            surfaceV
          )
        ),
        surfaceV,
        surfaceU,
        appearance,
        geometry.kind
      )
    );
    return svgNode("path", {
      d: `${projectedPoints
        .map(
          ([x, y], index) =>
            `${index === 0 ? "M" : "L"} ${preciseNumber(x)} ${preciseNumber(y)}`
        )
        .join(" ")} Z`,
      style: pathStyle(triangleFill, outline, 0.45, {
        "stroke-opacity": 0.2,
      }),
    });
  });
  return [svgNode("g", { id }, children)];
}

function validateOptions(
  options: SvgRenderOptions
): Required<Pick<SvgRenderOptions, "padding" | "size">> & SvgRenderOptions {
  const size = options.size ?? VIEWBOX;
  const padding = options.padding ?? 0.075;
  if (!Number.isSafeInteger(size) || size < 1 || size > 4096)
    throw new RangeError("SVG size must be an integer from 1 to 4096");
  if (!Number.isFinite(padding) || padding < 0 || padding >= 0.4)
    throw new RangeError("SVG padding must be from 0 to 0.4");
  if (options.background && !/^#[0-9a-f]{6}$/i.test(options.background))
    throw new TypeError("SVG background must be a six-digit hex color");
  if (
    options.idPrefix !== undefined &&
    !/^[a-z][a-z0-9_-]*$/i.test(options.idPrefix)
  )
    throw new TypeError(
      "SVG idPrefix must start with a letter and contain only letters, digits, underscores or hyphens"
    );
  return { ...options, padding, size };
}

function portraitTransform(model: FlowerModel, padding: number): string {
  const { maximum, minimum } = model.portrait.bounds;
  const width = maximum[0] - minimum[0];
  const height = maximum[1] - minimum[1];
  const usable = VIEWBOX * (1 - padding * 2);
  const scale = usable / Math.max(width, height);
  const centerX = (minimum[0] + maximum[0]) / 2;
  const centerY = (minimum[1] + maximum[1]) / 2;
  return `translate(${VIEWBOX / 2} ${VIEWBOX / 2}) scale(${preciseNumber(scale)} ${preciseNumber(-scale)}) translate(${spatialNumber(-centerX, width)} ${spatialNumber(-centerY, height)})`;
}

export function renderSvg(
  specimen: FlowerSpecimen,
  rawOptions: SvgRenderOptions = {}
): string {
  const options = validateOptions(rawOptions);
  const issues = auditSpecimen(specimen);
  if (issues.length)
    throw new Error(
      `cannot render an invalid flower specimen:\n${issues
        .map((issue) => `${issue.path} [${issue.code}] ${issue.message}`)
        .join("\n")}`
    );
  const fingerprint = specimen.model.genomeId.split("/").at(-1);
  if (!fingerprint) throw new Error("flower model has no identity fingerprint");
  const prefix = `${options.idPrefix ? `${options.idPrefix}-` : ""}f${fingerprint}`;
  const definitions: SvgNode[] = [];
  const definitionIds = new Map<string, string>();
  const portraitSpan: Point2 = [
    specimen.model.portrait.bounds.maximum[0] -
      specimen.model.portrait.bounds.minimum[0],
    specimen.model.portrait.bounds.maximum[1] -
      specimen.model.portrait.bounds.minimum[1],
  ];
  const draws = [...flatten(specimen.model.roots)].sort((left, right) => {
    const leftGeometry = specimen.model.geometries[left.organ.geometry];
    const rightGeometry = specimen.model.geometries[right.organ.geometry];
    const depth =
      renderedDepth(leftGeometry, left.transform) -
      renderedDepth(rightGeometry, right.transform);
    return depth === 0 ? left.order - right.order : depth;
  });
  const uses = draws.map(({ organ, transform }) => {
    const geometry = specimen.model.geometries[organ.geometry];
    const appearance = specimen.model.appearances[organ.appearance];
    const projection = projectionPlan(transform);
    const projected =
      geometry.kind === "sweep"
        ? projectedSweep(geometry, transform, projection.definition)
        : undefined;
    const flowerPigment = pigmentUsesSpace(appearance.pigment, "flower");
    const viewSensitiveEllipsoid =
      geometry.kind === "ellipsoid" &&
      (pigmentUsesSpace(appearance.pigment, "organ") ||
        pigmentUsesSpace(appearance.pigment, "surface"));
    const pigmentKey = flowerPigment
      ? transform
      : viewSensitiveEllipsoid
        ? [
            transform[0],
            transform[1],
            transform[2],
            transform[4],
            transform[5],
            transform[6],
            transform[8],
            transform[9],
            transform[10],
          ]
        : undefined;
    const meshDepthKey =
      geometry.kind === "mesh" ? meshDepthCoefficients(transform) : undefined;
    const key = JSON.stringify([
      organ.geometry,
      organ.appearance,
      projection.key,
      projected?.key,
      pigmentKey,
      meshDepthKey,
    ]);
    let id = definitionIds.get(key);
    if (!id) {
      id = `${prefix}-shape-${definitionIds.size}`;
      const gradientIds = Array.from(
        {
          length:
            geometry.kind === "mesh"
              ? 0
              : geometry.kind === "lamina"
                ? LAMINA_BANDS
                : geometry.kind === "sweep"
                  ? 2
                  : 1,
        },
        (_, gradientIndex) => `${id}-paint-${gradientIndex}`
      );
      definitions.push(
        ...gradientIds.map((gradientId, gradientIndex) =>
          gradient(
            gradientId,
            geometry,
            appearance,
            transform,
            specimen,
            geometry.kind === "lamina"
              ? -1 + (2 * (gradientIndex + 0.5)) / LAMINA_BANDS
              : 0,
            projection.definition,
            projected,
            geometry.kind === "sweep" ? (gradientIndex as 0 | 1) : undefined
          )
        ),
        ...geometryNode(
          id,
          gradientIds,
          geometry,
          appearance,
          transform,
          specimen,
          projection.definition,
          projected
        )
      );
      definitionIds.set(key, id);
    }
    return svgNode("use", {
      "data-organ": organ.semantic,
      href: `#${id}`,
      transform: projection.use
        ? transformAttribute(projection.use, portraitSpan)
        : undefined,
    });
  });
  const title =
    options.title ??
    `${specimen.genome.cultivar.name} ${specimen.genome.species.id}`;
  const children: SvgNode[] = [svgNode("title", {}, [title])];
  if (options.background)
    children.push(
      svgNode("rect", {
        height: VIEWBOX,
        style: svgStyle({ fill: options.background, stroke: "none" }),
        width: VIEWBOX,
        x: 0,
        y: 0,
      })
    );
  // Directional light is applied once in flower space. Keeping it outside the
  // organ definitions preserves exact instancing while preventing a petal's
  // local highlight from rotating independently with every radial copy.
  const compositionId = `${prefix}-composition`;
  definitions.push(svgNode("g", { id: compositionId }, uses));
  const light = createSvgVectorLight(specimen.model, prefix, compositionId);
  definitions.push(...light.definitions);
  children.push(
    svgNode("defs", {}, definitions),
    svgNode(
      "g",
      { transform: portraitTransform(specimen.model, options.padding) },
      [
        svgNode("use", { href: `#${compositionId}` }),
        ...(light.overlay ? [light.overlay] : []),
      ]
    )
  );
  return serializeSvg(
    svgNode(
      "svg",
      {
        "aria-label": title,
        height: options.size,
        role: "img",
        style: svgStyle({ fill: "#000", stroke: "none" }),
        viewBox: `0 0 ${VIEWBOX} ${VIEWBOX}`,
        width: options.size,
        xmlns: "http://www.w3.org/2000/svg",
      },
      children
    )
  );
}
