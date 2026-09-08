import { BufferAttribute, BufferGeometry } from "three";
import { smootherstep } from "@/src/gl/plumeria-shell";
import {
  preparePlumeriaPetal,
  type Relief,
  type Vec3,
} from "@/src/gl/plumeria-surface";
import type { PetalForm } from "@/src/plumeria/petal";

const ROWS = 129;
const COLUMNS = 73;

function normalize(vector: Vec3, fallback: Vec3): Vec3 {
  const length = Math.hypot(...vector);
  return length > 1e-10
    ? [vector[0] / length, vector[1] / length, vector[2] / length]
    : fallback;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/** A complete, closed, softly inflated ribbon. Five rotations make the flower. */
export function petalGeometry(
  form: PetalForm,
  relief: Relief,
  development = 1
): BufferGeometry {
  const faceVertices = ROWS * COLUMNS;
  const positions = new Float32Array(2 * faceVertices * 3);
  const uvs = new Float32Array(2 * faceVertices * 2);
  const restUvs = new Float32Array(2 * faceVertices * 2);
  const surface = new Float64Array(faceVertices * 3);
  const prepare = preparePlumeriaPetal(form, relief, development);
  const rest = development === 1 ? prepare : preparePlumeriaPetal(form, relief);
  // Spend the same grid on the curved tip instead of ending in long chords.
  const rows = Array.from({ length: ROWS }, (_, index) => {
    const t = index / (ROWS - 1);
    const tip = Math.max(0, (t - 0.8) / 0.2);
    return prepare(t + 0.2 * tip * tip * (1 - tip));
  });
  const restRows = development === 1 ? rows : rows.map((row) => rest(row.t));
  const angles = Array.from({ length: COLUMNS }, (_, column) => {
    const sine = Math.sin((((2 * column) / (COLUMNS - 1) - 1) * Math.PI) / 2);
    return [sine, Math.sin((sine * Math.PI) / 2)] as const;
  });
  // Resolve the elliptical rim without collapsing cells as the tip narrows.
  // Sampling depends on material t alone, never on development or the seed.
  const across = rows.map(({ t }) => {
    const concentration = 1 - smootherstep((t - 0.94) / 0.06);
    return angles.map(
      ([single, double]) => single + concentration * (double - single)
    );
  });
  let materialDistance = 0;
  for (const [rowIndex, row] of rows.entries()) {
    if (rowIndex > 0) {
      const current = restRows[rowIndex].center,
        previous = restRows[rowIndex - 1].center;
      materialDistance += Math.hypot(
        current[0] - previous[0],
        current[1] - previous[1],
        current[2] - previous[2]
      );
    }
    for (const [column, u] of across[rowIndex].entries()) {
      const vertex = rowIndex * COLUMNS + column;
      surface.set(row.point(u), 3 * vertex);
      for (const at of [vertex, vertex + faceVertices]) {
        uvs[2 * at] = (u + 1) / 2;
        uvs[2 * at + 1] = row.along;
        restUvs[2 * at] = (restRows[rowIndex].halfWidth * u) / form.length;
        restUvs[2 * at + 1] = materialDistance / form.length;
      }
    }
  }

  const difference = (a: number, b: number): Vec3 => [
    surface[3 * b] - surface[3 * a],
    surface[3 * b + 1] - surface[3 * a + 1],
    surface[3 * b + 2] - surface[3 * a + 2],
  ];
  for (const [rowIndex, row] of rows.entries()) {
    for (const [column, u] of across[rowIndex].entries()) {
      const vertex = rowIndex * COLUMNS + column;
      const lateral = difference(
        rowIndex * COLUMNS + Math.max(0, column - 1),
        rowIndex * COLUMNS + Math.min(COLUMNS - 1, column + 1)
      );
      const longitudinal = difference(
        Math.max(0, rowIndex - 1) * COLUMNS + column,
        Math.min(ROWS - 1, rowIndex + 1) * COLUMNS + column
      );
      const normal = normalize(cross(lateral, longitudinal), row.normal);
      // Follow the rolled wall at the base; vertical lens depth preserves the
      // established canonical blade projection and rounded edge law.
      const direction = normalize(
        [
          normal[0] * (1 - row.opening),
          normal[1] * (1 - row.opening),
          normal[2] * (1 - row.opening) + row.opening,
        ],
        row.normal
      );
      const depth =
        rowIndex === 0 || rowIndex === ROWS - 1 ? 0 : row.depthAt(u);
      for (const [at, sign] of [
        [vertex, 1],
        [vertex + faceVertices, -1],
      ]) {
        for (let component = 0; component < 3; component += 1) {
          positions[3 * at + component] =
            row.scale *
            (surface[3 * vertex + component] +
              sign * depth * direction[component]);
        }
      }
    }
  }

  const indices: number[] = [];
  for (let row = 0; row < ROWS - 1; row += 1) {
    for (let column = 0; column < COLUMNS - 1; column += 1) {
      const a = row * COLUMNS + column,
        b = a + COLUMNS;
      // Both ends collapse to a tip; omit the corresponding zero-area half.
      if (row > 0)
        indices.push(
          a,
          a + 1,
          b,
          a + faceVertices,
          b + faceVertices,
          a + 1 + faceVertices
        );
      if (row === ROWS - 2) continue;
      indices.push(
        b,
        a + 1,
        b + 1,
        b + faceVertices,
        b + 1 + faceVertices,
        a + 1 + faceVertices
      );
    }
  }
  const geometry = new BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
  geometry.setAttribute("uv1", new BufferAttribute(restUvs, 2));
  geometry.computeVertexNormals();

  // Join only this petal's own front and back skins. No inter-organ root seam
  // or forced axial normals: every triangle above comes from the same chart.
  const normals = geometry.getAttribute("normal");
  const join = (vertices: readonly number[]) => {
    let x = 0,
      y = 0,
      z = 0;
    for (const at of vertices) {
      x += normals.getX(at);
      y += normals.getY(at);
      z += normals.getZ(at);
    }
    const normal = normalize([x, y, z], [0, 0, -1]);
    for (const at of vertices) normals.setXYZ(at, ...normal);
  };
  for (let row = 1; row < ROWS - 1; row += 1) {
    for (const column of [0, COLUMNS - 1]) {
      const vertex = row * COLUMNS + column;
      join([vertex, vertex + faceVertices]);
    }
  }
  for (const row of [0, ROWS - 1]) {
    const tip = row * COLUMNS;
    join(
      Array.from({ length: COLUMNS }, (_, i) => tip + i).flatMap((i) => [
        i,
        i + faceVertices,
      ])
    );
  }
  return geometry;
}
