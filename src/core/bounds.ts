import {
  catmullRomControls,
  cubicBezierExtrema,
  cubicBezierValue,
} from "@/src/core/curve";
import type {
  FlowerBounds,
  Matrix4,
  Organ,
  OrganGeometry,
  OrganNode,
  Point3,
} from "@/src/core/model";
import { sweepPoint, sweepRadius, sweepSegments } from "@/src/core/sweep";
import { IDENTITY_TRANSFORM, multiplyTransforms } from "@/src/core/transform";

type MutableBounds = {
  maximum: [number, number, number];
  minimum: [number, number, number];
};

function transformPoint(transform: Matrix4, point: Point3): Point3 {
  const [x, y, z] = point;
  return [
    transform[0] * x + transform[4] * y + transform[8] * z + transform[12],
    transform[1] * x + transform[5] * y + transform[9] * z + transform[13],
    transform[2] * x + transform[6] * y + transform[10] * z + transform[14],
  ];
}

function includePoint(bounds: MutableBounds, point: Point3): void {
  if (point.some((value) => !Number.isFinite(value))) return;
  for (let axis = 0; axis < 3; axis += 1) {
    bounds.minimum[axis] = Math.min(bounds.minimum[axis], point[axis]);
    bounds.maximum[axis] = Math.max(bounds.maximum[axis], point[axis]);
  }
}

function includeClosedCurveBounds(
  bounds: MutableBounds,
  points: readonly Point3[]
): void {
  if (points.length < 2) return;
  const at = (index: number): Point3 =>
    points[((index % points.length) + points.length) % points.length];
  for (let index = 0; index < points.length; index += 1) {
    const p0 = at(index - 1);
    const p1 = at(index);
    const p2 = at(index + 1);
    const p3 = at(index + 2);
    for (const axis of [0, 1] as const) {
      const [first, second] = catmullRomControls(
        p0[axis],
        p1[axis],
        p2[axis],
        p3[axis]
      );
      for (const progress of [
        0,
        1,
        ...cubicBezierExtrema(p1[axis], first, second, p2[axis]),
      ]) {
        const value = cubicBezierValue(
          p1[axis],
          first,
          second,
          p2[axis],
          progress
        );
        bounds.minimum[axis] = Math.min(bounds.minimum[axis], value);
        bounds.maximum[axis] = Math.max(bounds.maximum[axis], value);
      }
    }
  }
}

function includeRadius(
  bounds: MutableBounds,
  transform: Matrix4,
  center: Point3,
  radii: Point3
): void {
  const transformed = transformPoint(transform, center);
  const extent: Point3 = [
    Math.hypot(
      transform[0] * radii[0],
      transform[4] * radii[1],
      transform[8] * radii[2]
    ),
    Math.hypot(
      transform[1] * radii[0],
      transform[5] * radii[1],
      transform[9] * radii[2]
    ),
    Math.hypot(
      transform[2] * radii[0],
      transform[6] * radii[1],
      transform[10] * radii[2]
    ),
  ];
  includePoint(bounds, [
    transformed[0] - extent[0],
    transformed[1] - extent[1],
    transformed[2] - extent[2],
  ]);
  includePoint(bounds, [
    transformed[0] + extent[0],
    transformed[1] + extent[1],
    transformed[2] + extent[2],
  ]);
}

function includeOrganBounds(
  geometries: Readonly<Record<string, OrganGeometry>>,
  organ: Organ,
  transform: Matrix4,
  bounds: MutableBounds
): void {
  if (!Object.hasOwn(geometries, organ.geometry)) return;
  const geometry = geometries[organ.geometry];
  if (geometry.kind === "ellipsoid") {
    includeRadius(bounds, transform, [0, 0, 0], geometry.radii);
    return;
  }
  if (geometry.kind === "sweep") {
    const segments = sweepSegments(geometry.path.length);
    for (let index = 0; index <= segments; index += 1) {
      const progress = index / segments;
      const point = sweepPoint(geometry.path, progress);
      const radius = sweepRadius(geometry.radius, progress);
      includeRadius(bounds, transform, point, [radius, radius, radius]);
    }
    return;
  }
  if (geometry.kind === "mesh") {
    for (const point of geometry.positions)
      includePoint(bounds, transformPoint(transform, point));
    return;
  }
  for (const section of geometry.sections)
    for (const point of [section.left, section.center, section.right]) {
      includePoint(
        bounds,
        transformPoint(transform, [
          point[0],
          point[1],
          point[2] - section.thickness,
        ])
      );
      includePoint(
        bounds,
        transformPoint(transform, [
          point[0],
          point[1],
          point[2] + section.thickness,
        ])
      );
    }
  includeClosedCurveBounds(
    bounds,
    geometry.outline.map(([x, y]) => transformPoint(transform, [x, y, 0]))
  );
  includeClosedCurveBounds(bounds, [
    ...geometry.sections.map((section) =>
      transformPoint(transform, section.right)
    ),
    ...geometry.sections
      .slice(1, -1)
      .reverse()
      .map((section) => transformPoint(transform, section.left)),
  ]);
}

function collectBounds(
  geometries: Readonly<Record<string, OrganGeometry>>,
  nodes: readonly OrganNode[],
  parent: Matrix4,
  bounds: MutableBounds
): void {
  for (const node of nodes) {
    if (node.kind === "group") {
      collectBounds(
        geometries,
        node.children,
        multiplyTransforms(parent, node.transform),
        bounds
      );
      continue;
    }
    if (node.kind === "instances") {
      for (const transform of node.transforms)
        includeOrganBounds(
          geometries,
          node.template,
          multiplyTransforms(
            parent,
            multiplyTransforms(transform, node.template.transform)
          ),
          bounds
        );
      continue;
    }
    includeOrganBounds(
      geometries,
      node,
      multiplyTransforms(parent, node.transform),
      bounds
    );
  }
}

export function measureFlowerBounds(
  geometries: Readonly<Record<string, OrganGeometry>>,
  roots: readonly OrganNode[]
): FlowerBounds | undefined {
  const bounds: MutableBounds = {
    maximum: [
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ],
    minimum: [
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    ],
  };
  collectBounds(geometries, roots, IDENTITY_TRANSFORM, bounds);
  if (
    bounds.minimum.some((value) => !Number.isFinite(value)) ||
    bounds.maximum.some((value) => !Number.isFinite(value))
  )
    return undefined;
  return Object.freeze({
    maximum: Object.freeze(bounds.maximum),
    minimum: Object.freeze(bounds.minimum),
  });
}
