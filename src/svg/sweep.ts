import type { Matrix4, OrganGeometry, Point2, Point3 } from "@/src/core/model";
import {
  SWEEP_CAP_SEGMENTS,
  type SweepFrame,
  sweepFrameAt,
  sweepFrames,
  sweepRadius,
  sweepSurfacePoint,
} from "@/src/core/sweep";
import { projectPoint, stableProjectionValue } from "@/src/svg/projection";

export type ProjectedSweep = Readonly<{
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

export function sweepSurfaceU(
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

export function projectedSweep(
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
  const lastFrame = frames.at(-1);
  const endRadius = geometry.radius.at(-1);
  if (!lastFrame || endRadius === undefined)
    throw new Error("sweep needs an end frame and radius");
  const capPoint = (
    frame: SweepFrame,
    radius: number,
    surfaceAngle: number,
    axialAngle: number
  ): Point2 =>
    projectPoint(
      sweepSurfacePoint(
        {
          ...frame,
          center: [
            frame.center[0] + frame.tangent[0] * radius * Math.sin(axialAngle),
            frame.center[1] + frame.tangent[1] * radius * Math.sin(axialAngle),
            frame.center[2] + frame.tangent[2] * radius * Math.sin(axialAngle),
          ],
        },
        radius * Math.cos(axialAngle),
        surfaceUForAngle(surfaceAngle)
      ),
      projection
    );
  const branch = (side: 0 | 1): readonly Point2[] => [
    ...Array.from({ length: SWEEP_CAP_SEGMENTS }, (_, index) =>
      capPoint(
        frames[0],
        geometry.radius[0],
        surfaceAngles[side][0],
        -Math.PI / 2 + (index * Math.PI) / (2 * SWEEP_CAP_SEGMENTS)
      )
    ),
    ...sidePoints[side],
    ...Array.from({ length: SWEEP_CAP_SEGMENTS }, (_, index) =>
      capPoint(
        lastFrame,
        endRadius,
        surfaceAngles[side][surfaceAngles[side].length - 1],
        ((index + 1) * Math.PI) / (2 * SWEEP_CAP_SEGMENTS)
      )
    ),
  ];
  const branches = [branch(0), branch(1)] as const;
  return {
    frames,
    halves: [
      [...path, ...[...branches[0]].reverse()],
      [...branches[1], ...[...path].reverse()],
    ],
    key,
    outline: [...branches[0], ...[...branches[1]].reverse()],
    surfaceAngles,
  };
}
