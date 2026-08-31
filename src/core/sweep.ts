import type { Point3 } from "@/src/core/model";

export const SWEEP_CAP_SEGMENTS = 3;

export type SweepFrame = Readonly<{
  binormal: Point3;
  center: Point3;
  normal: Point3;
  tangent: Point3;
}>;

export type SweepCusp = Readonly<{
  progress: number;
  ring: number;
}>;

export function sweepSegments(pathLength: number): number {
  return Math.max(16, (pathLength - 1) * 12);
}

function extrapolate(from: Point3, awayFrom: Point3): Point3 {
  return [
    from[0] * 2 - awayFrom[0],
    from[1] * 2 - awayFrom[1],
    from[2] * 2 - awayFrom[2],
  ];
}

function interval(from: Point3, to: Point3): number {
  return Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]) ** 0.5;
}

function coordinateTangents(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  dt0: number,
  dt1: number,
  dt2: number
): readonly [number, number] {
  const tangent1 =
    ((p1 - p0) / dt0 - (p2 - p0) / (dt0 + dt1) + (p2 - p1) / dt1) * dt1;
  const tangent2 =
    ((p2 - p1) / dt1 - (p3 - p1) / (dt1 + dt2) + (p3 - p2) / dt2) * dt1;
  return [tangent1, tangent2];
}

function coordinate(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  dt0: number,
  dt1: number,
  dt2: number,
  amount: number
): number {
  // Centripetal Catmull–Rom expressed as a cubic Hermite segment. The
  // non-uniform tangents prevent the loops and cusps of uniform splines.
  const [tangent1, tangent2] = coordinateTangents(
    p0,
    p1,
    p2,
    p3,
    dt0,
    dt1,
    dt2
  );
  const squared = amount * amount;
  const cubed = squared * amount;
  return (
    p1 +
    tangent1 * amount +
    (-3 * p1 + 3 * p2 - 2 * tangent1 - tangent2) * squared +
    (2 * p1 - 2 * p2 + tangent1 + tangent2) * cubed
  );
}

function coordinateDerivative(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  dt0: number,
  dt1: number,
  dt2: number,
  amount: number
): number {
  const [tangent1, tangent2] = coordinateTangents(
    p0,
    p1,
    p2,
    p3,
    dt0,
    dt1,
    dt2
  );
  const quadratic = -3 * p1 + 3 * p2 - 2 * tangent1 - tangent2;
  const cubic = 2 * p1 - 2 * p2 + tangent1 + tangent2;
  return tangent1 + 2 * quadratic * amount + 3 * cubic * amount * amount;
}

type SweepSegment = Readonly<{
  amount: number;
  dt0: number;
  dt1: number;
  dt2: number;
  p0: Point3;
  p1: Point3;
  p2: Point3;
  p3: Point3;
}>;

function sweepSegment(
  path: readonly Point3[],
  rawProgress: number
): SweepSegment {
  const progress = Math.max(0, Math.min(1, rawProgress));
  const last = path.length - 1;
  const position = last * progress;
  let segment = Math.floor(position);
  let amount = position - segment;
  if (segment === last) {
    segment -= 1;
    amount = 1;
  }

  const p1 = path[segment];
  const p2 = path[segment + 1];
  const p0 = segment > 0 ? path[segment - 1] : extrapolate(p1, p2);
  const p3 =
    segment + 2 < path.length ? path[segment + 2] : extrapolate(p2, p1);
  let dt0 = interval(p0, p1);
  let dt1 = interval(p1, p2);
  let dt2 = interval(p2, p3);
  if (dt1 < 1e-4) dt1 = 1;
  if (dt0 < 1e-4) dt0 = dt1;
  if (dt2 < 1e-4) dt2 = dt1;
  return { amount, dt0, dt1, dt2, p0, p1, p2, p3 };
}

// Audits and renderers evaluate the same open centripetal Catmull–Rom centerline.
export function sweepPoint(
  path: readonly Point3[],
  rawProgress: number
): Point3 {
  const { amount, dt0, dt1, dt2, p0, p1, p2, p3 } = sweepSegment(
    path,
    rawProgress
  );

  return [
    coordinate(p0[0], p1[0], p2[0], p3[0], dt0, dt1, dt2, amount),
    coordinate(p0[1], p1[1], p2[1], p3[1], dt0, dt1, dt2, amount),
    coordinate(p0[2], p1[2], p2[2], p3[2], dt0, dt1, dt2, amount),
  ];
}

export function sweepRadius(
  radii: readonly number[],
  progress: number
): number {
  const scaled = Math.max(0, Math.min(1, progress)) * (radii.length - 1);
  const from = Math.min(radii.length - 2, Math.floor(scaled));
  const amount = scaled - from;
  return radii[from] + (radii[from + 1] - radii[from]) * amount;
}

function add(left: Point3, right: Point3): Point3 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function subtract(left: Point3, right: Point3): Point3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function multiply(point: Point3, scalar: number): Point3 {
  return [point[0] * scalar, point[1] * scalar, point[2] * scalar];
}

function dot(left: Point3, right: Point3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross(left: Point3, right: Point3): Point3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function normalize(point: Point3): Point3 {
  const length = Math.hypot(...point);
  if (length === 0) throw new Error("cannot normalize a zero-length vector");
  return multiply(point, 1 / length);
}

function tangentSample(
  path: readonly Point3[],
  progress: number
): Readonly<{ tolerance: number; vector: Point3 }> {
  const { amount, dt0, dt1, dt2, p0, p1, p2, p3 } = sweepSegment(
    path,
    progress
  );
  const vector = [0, 1, 2].map((axis) =>
    coordinateDerivative(
      p0[axis],
      p1[axis],
      p2[axis],
      p3[axis],
      dt0,
      dt1,
      dt2,
      amount
    )
  ) as [number, number, number];
  const segmentScale = Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]);
  return { tolerance: segmentScale * 1e-10, vector };
}

// Reject stationary rings before their undefined frames fold the tube surface.
export function findSweepCusp(
  path: readonly Point3[],
  segments = sweepSegments(path.length)
): SweepCusp | null {
  for (let ring = 0; ring <= segments; ring += 1) {
    const progress = ring / segments;
    const { tolerance, vector } = tangentSample(path, progress);
    if (Math.hypot(...vector) <= tolerance) return { progress, ring };
  }
  return null;
}

function tangent(path: readonly Point3[], progress: number): Point3 {
  const { tolerance, vector } = tangentSample(path, progress);
  if (Math.hypot(...vector) <= tolerance)
    throw new RangeError(
      `sweep centerline has an undefined tangent at progress ${progress}; round exact reversals with another control point`
    );
  return normalize(vector);
}

function rotateAround(point: Point3, axis: Point3, angle: number): Point3 {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return add(
    add(multiply(point, cosine), multiply(cross(axis, point), sine)),
    multiply(axis, dot(axis, point) * (1 - cosine))
  );
}

// Vector and Three adapters share these parallel-transport frames.
export function sweepFrames(
  path: readonly Point3[],
  segments = sweepSegments(path.length)
): readonly SweepFrame[] {
  const tangents = Array.from({ length: segments + 1 }, (_, index) =>
    tangent(path, index / segments)
  );
  const first = tangents[0];
  const magnitudes = first.map(Math.abs) as [number, number, number];
  let smallest = 0;
  if (magnitudes[1] <= magnitudes[smallest]) smallest = 1;
  if (magnitudes[2] <= magnitudes[smallest]) smallest = 2;
  const reference: Point3 = [
    smallest === 0 ? 1 : 0,
    smallest === 1 ? 1 : 0,
    smallest === 2 ? 1 : 0,
  ];
  const firstAcross = normalize(cross(first, reference));
  const normals: Point3[] = [normalize(cross(first, firstAcross))];
  const binormals: Point3[] = [normalize(cross(first, normals[0]))];

  for (let index = 1; index <= segments; index += 1) {
    const axis = cross(tangents[index - 1], tangents[index]);
    const axisLength = Math.hypot(...axis);
    const normal =
      axisLength > Number.EPSILON
        ? rotateAround(
            normals[index - 1],
            multiply(axis, 1 / axisLength),
            Math.acos(
              Math.min(
                1,
                Math.max(-1, dot(tangents[index - 1], tangents[index]))
              )
            )
          )
        : normals[index - 1];
    normals.push(normalize(normal));
    binormals.push(normalize(cross(tangents[index], normals[index])));
  }

  return Array.from({ length: segments + 1 }, (_, index) => ({
    binormal: binormals[index],
    center: sweepPoint(path, index / segments),
    normal: normals[index],
    tangent: tangents[index],
  }));
}

export function sweepFrameAt(
  frames: readonly SweepFrame[],
  progress: number
): SweepFrame {
  const scaled = Math.max(0, Math.min(1, progress)) * (frames.length - 1);
  const fromIndex = Math.min(frames.length - 2, Math.floor(scaled));
  const amount = scaled - fromIndex;
  const from = frames[fromIndex];
  const to = frames[fromIndex + 1];
  const interpolate = (left: Point3, right: Point3): Point3 =>
    add(left, multiply(subtract(right, left), amount));
  const tangentAt = normalize(interpolate(from.tangent, to.tangent));
  let normalAt = normalize(interpolate(from.normal, to.normal));
  const binormalAt = normalize(cross(tangentAt, normalAt));
  normalAt = normalize(cross(binormalAt, tangentAt));
  return {
    binormal: binormalAt,
    center: interpolate(from.center, to.center),
    normal: normalAt,
    tangent: tangentAt,
  };
}

// The ring coordinate u follows the Three adapter's [-1, 1] seam.
export function sweepSurfacePoint(
  frame: SweepFrame,
  radius: number,
  surfaceU: number
): Point3 {
  const angle = Math.PI * (surfaceU + 1);
  const offset = add(
    multiply(frame.normal, -Math.cos(angle)),
    multiply(frame.binormal, Math.sin(angle))
  );
  return add(frame.center, multiply(offset, radius));
}
