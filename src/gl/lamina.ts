import { BufferAttribute, BufferGeometry, Vector3 } from "three";
import type { LaminaGeometry, Point3 } from "@/src/core/model";

const CROSS_SECTIONS = 32;

function hash(value: string): number {
  let result = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16_777_619);
  }
  return result >>> 0;
}

export function createLaminaGeometry(
  geometry: LaminaGeometry,
  seed: string
): BufferGeometry {
  const rows = geometry.sections.length;
  const columns = CROSS_SECTIONS + 1;
  const shellSize = rows * columns;
  const positions = new Float32Array(shellSize * 2 * 3);
  const uvs = new Float32Array(shellSize * 2 * 2);
  const phase = (hash(`${seed}/${geometry.id}`) / 0xffff_ffff) * Math.PI * 2;
  for (let row = 0; row < rows; row += 1) {
    const section = geometry.sections[row];
    const v = row / (rows - 1);
    for (let column = 0; column < columns; column += 1) {
      const u = (column / CROSS_SECTIONS) * 2 - 1;
      const edge = u < 0 ? section.left : section.right;
      const across = Math.abs(u);
      const local: Point3 = [
        section.center[0] + (edge[0] - section.center[0]) * across,
        section.center[1] + (edge[1] - section.center[1]) * across,
        section.center[2] + (edge[2] - section.center[2]) * across,
      ];
      const fiberCoordinate =
        (u + 1) * 8.5 +
        0.18 * Math.sin(v * Math.PI * 3 + phase) +
        0.07 * Math.sin(v * Math.PI * 11 + phase * 0.43);
      const fiberDistance = Math.abs(
        fiberCoordinate - Math.round(fiberCoordinate)
      );
      const cavity = Math.exp(-((fiberDistance / 0.16) ** 2));
      const envelope = Math.sin(Math.PI * v) ** 0.35;
      const collapsedPole = row === 0 || row === rows - 1;
      const roundedEdge = collapsedPole
        ? 1
        : 0.12 + 0.88 * Math.sqrt(Math.max(0, 1 - across * across));
      const top =
        local[2] +
        section.thickness * roundedEdge * (0.48 - 0.1 * cavity * envelope);
      const bottom = local[2] - section.thickness * roundedEdge * 0.72;
      const topIndex = row * columns + column;
      const bottomIndex = shellSize + topIndex;
      for (const [index, z] of [
        [topIndex, top],
        [bottomIndex, bottom],
      ] as const) {
        positions[index * 3] = local[0];
        positions[index * 3 + 1] = local[1];
        positions[index * 3 + 2] = z;
        uvs[index * 2] = (u + 1) / 2;
        uvs[index * 2 + 1] = v;
      }
    }
  }
  const indices: number[] = [];
  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const a = row * columns + column;
      const b = a + columns;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
      const bottomA = shellSize + a;
      const bottomB = shellSize + b;
      indices.push(
        bottomA,
        bottomB,
        bottomA + 1,
        bottomB,
        bottomB + 1,
        bottomA + 1
      );
    }
  }
  const close = (first: number, reverse = false) => {
    for (let step = 0; step < columns - 1; step += 1) {
      const topA = first + step;
      const topB = topA + 1;
      const bottomA = shellSize + topA;
      const bottomB = shellSize + topB;
      if (reverse) indices.push(topA, bottomB, bottomA, topA, topB, bottomB);
      else indices.push(topA, bottomA, bottomB, topA, bottomB, topB);
    }
  };
  for (const column of [0, columns - 1]) {
    for (let row = 0; row < rows - 1; row += 1) {
      const topA = row * columns + column;
      const topB = topA + columns;
      const bottomA = shellSize + topA;
      const bottomB = shellSize + topB;
      if (column === 0)
        indices.push(topA, bottomB, bottomA, topA, topB, bottomB);
      else indices.push(topA, bottomA, bottomB, topA, bottomB, topB);
    }
  }
  close(0, true);
  close((rows - 1) * columns);
  const validIndices: number[] = [];
  const point = (vertex: number): Point3 => [
    positions[vertex * 3],
    positions[vertex * 3 + 1],
    positions[vertex * 3 + 2],
  ];
  for (let index = 0; index < indices.length; index += 3) {
    const [a, b, c] = indices.slice(index, index + 3);
    const pa = point(a);
    const pb = point(b);
    const pc = point(c);
    const ab: Point3 = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
    const ac: Point3 = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
    const cross: Point3 = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    const scale = Math.hypot(...ab) * Math.hypot(...ac);
    if (scale > 0 && Math.hypot(...cross) > scale * 1e-12)
      validIndices.push(a, b, c);
  }
  const result = new BufferGeometry();
  result.setAttribute("position", new BufferAttribute(positions, 3));
  result.setAttribute("uv", new BufferAttribute(uvs, 2));
  result.setIndex(validIndices);
  result.computeVertexNormals();
  const normals = result.getAttribute("normal");
  const vertices = result.getAttribute("position");
  for (const surfaceOffset of [0, shellSize]) {
    for (const row of [0, rows - 1]) {
      const first = surfaceOffset + row * columns;
      const collapsed = Array.from(
        { length: columns - 1 },
        (_, column) => first + column + 1
      ).every(
        (vertex) =>
          Math.hypot(
            vertices.getX(vertex) - vertices.getX(first),
            vertices.getY(vertex) - vertices.getY(first),
            vertices.getZ(vertex) - vertices.getZ(first)
          ) < 1e-8
      );
      if (!collapsed) continue;
      const average = new Vector3();
      for (let column = 0; column < columns; column += 1) {
        const vertex = first + column;
        average.x += normals.getX(vertex);
        average.y += normals.getY(vertex);
        average.z += normals.getZ(vertex);
      }
      if (average.lengthSq() < 1e-16)
        average.set(0, 0, surfaceOffset === 0 ? 1 : -1);
      else average.normalize();
      for (let column = 0; column < columns; column += 1)
        normals.setXYZ(first + column, average.x, average.y, average.z);
    }
  }
  normals.needsUpdate = true;
  return result;
}
