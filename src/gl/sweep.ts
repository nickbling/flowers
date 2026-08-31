import { BufferAttribute, BufferGeometry, Vector3 } from "three";
import type { Point3, SweepGeometry } from "@/src/core/model";
import {
  SWEEP_CAP_SEGMENTS,
  sweepFrames,
  sweepRadius,
  sweepSurfacePoint,
} from "@/src/core/sweep";

export function createSweepGeometry(geometry: SweepGeometry): BufferGeometry {
  const frames = sweepFrames(geometry.path);
  const radialSegments = 12;
  const ring = radialSegments + 1;
  const capped = (
    frame: (typeof frames)[number],
    radius: number,
    angle: number,
    surfaceV: number
  ) => ({
    frame: {
      ...frame,
      center: [
        frame.center[0] + frame.tangent[0] * radius * Math.sin(angle),
        frame.center[1] + frame.tangent[1] * radius * Math.sin(angle),
        frame.center[2] + frame.tangent[2] * radius * Math.sin(angle),
      ] as Point3,
    },
    radius: radius * Math.cos(angle),
    surfaceV,
  });
  const startRadius = geometry.radius[0];
  const endRadius = geometry.radius.at(-1);
  if (endRadius === undefined) throw new Error("sweep needs an end radius");
  const rings = [
    ...Array.from({ length: SWEEP_CAP_SEGMENTS }, (_, index) =>
      capped(
        frames[0],
        startRadius,
        -Math.PI / 2 + (index * Math.PI) / (2 * SWEEP_CAP_SEGMENTS),
        0
      )
    ),
    ...frames.map((frame, index) => ({
      frame,
      radius: sweepRadius(geometry.radius, index / (frames.length - 1)),
      surfaceV: index / (frames.length - 1),
    })),
    ...Array.from({ length: SWEEP_CAP_SEGMENTS }, (_, index) =>
      capped(
        frames.at(-1) as (typeof frames)[number],
        endRadius,
        ((index + 1) * Math.PI) / (2 * SWEEP_CAP_SEGMENTS),
        1
      )
    ),
  ];
  const positions = new Float32Array(rings.length * ring * 3);
  const uvs = new Float32Array(rings.length * ring * 2);
  for (let segment = 0; segment < rings.length; segment += 1) {
    const current = rings[segment];
    for (let side = 0; side < ring; side += 1) {
      const index = segment * ring + side;
      const surfaceU = (side / radialSegments) * 2 - 1;
      const point = sweepSurfacePoint(current.frame, current.radius, surfaceU);
      positions[index * 3] = point[0];
      positions[index * 3 + 1] = point[1];
      positions[index * 3 + 2] = point[2];
      uvs[index * 2] = current.surfaceV;
      uvs[index * 2 + 1] = side / radialSegments;
    }
  }
  const indices: number[] = [];
  for (let segment = 1; segment < rings.length; segment += 1) {
    for (let side = 1; side <= radialSegments; side += 1) {
      const previous = ring * (segment - 1);
      const current = ring * segment;
      const a = previous + side - 1;
      const b = current + side - 1;
      const c = current + side;
      const d = previous + side;
      for (const triangle of [
        [a, b, d],
        [b, c, d],
      ] as const) {
        const points = triangle.map(
          (vertex) =>
            [
              positions[vertex * 3],
              positions[vertex * 3 + 1],
              positions[vertex * 3 + 2],
            ] as Point3
        );
        const ab: Point3 = [
          points[1][0] - points[0][0],
          points[1][1] - points[0][1],
          points[1][2] - points[0][2],
        ];
        const ac: Point3 = [
          points[2][0] - points[0][0],
          points[2][1] - points[0][1],
          points[2][2] - points[0][2],
        ];
        const cross: Point3 = [
          ab[1] * ac[2] - ab[2] * ac[1],
          ab[2] * ac[0] - ab[0] * ac[2],
          ab[0] * ac[1] - ab[1] * ac[0],
        ];
        const scale = Math.hypot(...ab) * Math.hypot(...ac);
        if (scale > 0 && Math.hypot(...cross) > scale * 1e-12)
          indices.push(...triangle);
      }
    }
  }
  const result = new BufferGeometry();
  result.setAttribute("position", new BufferAttribute(positions, 3));
  result.setAttribute("uv", new BufferAttribute(uvs, 2));
  result.setIndex(indices);
  result.computeVertexNormals();
  const normals = result.getAttribute("normal");
  const seam = new Vector3();
  for (let segment = 0; segment < rings.length; segment += 1) {
    const first = segment * ring;
    const last = first + radialSegments;
    seam
      .set(
        normals.getX(first) + normals.getX(last),
        normals.getY(first) + normals.getY(last),
        normals.getZ(first) + normals.getZ(last)
      )
      .normalize();
    normals.setXYZ(first, seam.x, seam.y, seam.z);
    normals.setXYZ(last, seam.x, seam.y, seam.z);
  }
  for (const segment of [0, rings.length - 1]) {
    const first = segment * ring;
    const average = new Vector3();
    for (let side = 0; side < ring; side += 1) {
      average.x += normals.getX(first + side);
      average.y += normals.getY(first + side);
      average.z += normals.getZ(first + side);
    }
    average.normalize();
    for (let side = 0; side < ring; side += 1)
      normals.setXYZ(first + side, average.x, average.y, average.z);
  }
  normals.needsUpdate = true;
  return result;
}
