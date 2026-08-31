import { catmullRomControls } from "@/src/core/curve";
import type {
  Matrix4,
  Organ,
  OrganGeometry,
  OrganNode,
  Point2,
  Point3,
} from "@/src/core/model";
import { sweepPoint, sweepRadius, sweepSegments } from "@/src/core/sweep";
import {
  IDENTITY_TRANSFORM,
  multiplyTransforms,
  transformPoint,
} from "@/src/core/transform";
import { instanceNumber, preciseNumber, spatialNumber } from "@/src/svg/format";
import type { ProjectedSweep } from "@/src/svg/sweep";

export type DrawOrgan = Readonly<{
  order: number;
  organ: Organ;
  transform: Matrix4;
}>;

export type GeometryBounds = Readonly<{
  maximum: Point3;
  minimum: Point3;
}>;

export function transformAttribute(matrix: Matrix4, span: Point2): string {
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

export type ProjectionPlan = Readonly<{
  definition?: Matrix4;
  key: string;
  use?: Matrix4;
}>;

export function stableProjectionValue(value: number): number {
  if (Math.abs(value) < 1e-12) return 0;
  return Math.round(value * 1e12) / 1e12;
}

export function projectionPlan(transform: Matrix4): ProjectionPlan {
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

export function projectPoint(point: Point3, projection?: Matrix4): Point2 {
  if (!projection) return [point[0], point[1]];
  const transformed = transformPoint(projection, point);
  return [transformed[0], transformed[1]];
}

export type ProjectedEllipse = Readonly<{
  angle: number;
  center: Point2;
  radiusX: number;
  radiusY: number;
}>;

export function projectEllipsoid(
  radii: Point3,
  transform: Matrix4
): ProjectedEllipse {
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

export function flatten(
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

export function catmullRom(points: readonly Point2[], closed: boolean): string {
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

export function polygon(points: readonly Point2[]): string {
  return `${points
    .map(
      ([x, y], index) =>
        `${index === 0 ? "M" : "L"} ${preciseNumber(x)} ${preciseNumber(y)}`
    )
    .join(" ")} Z`;
}

export function geometryBounds(geometry: OrganGeometry): GeometryBounds {
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

export function renderedDepth(
  geometry: OrganGeometry,
  transform: Matrix4
): number {
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

export function meshDepthCoefficients(transform: Matrix4): Point3 {
  // Triangle ordering uses these coefficients without normalization. Preserve
  // them verbatim so a cached definition cannot cross an ordering threshold
  // that another transform did not.
  return [transform[2], transform[6], transform[10]];
}

export function nonzeroGradientEndpoints(
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
