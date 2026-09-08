import { type BufferGeometry, Line3, Mesh, Raycaster, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { plumeriaScene } from "@/src/gl";
import { preparePlumeriaPetal, sampleRelief } from "@/src/gl/plumeria-surface";
import { laminaPoint } from "@/src/plumeria/petal";
import { growPlumeria } from "@/src/plumeria/specimen";
import { createRng } from "@/src/shared/prng";

const seeds = ["reference", "shape-67", "shape-110", "shape-165"] as const;

// Euclidean welding searches neighboring cells, never rounded-coordinate equality.
function manifold(geometry: BufferGeometry, length: number) {
  const position = geometry.getAttribute("position"),
    index = geometry.getIndex();
  if (!index) throw new Error("petal must be indexed");
  const tolerance = 3e-9 * length;
  const buckets = new Map<string, { key: number; point: Vector3 }[]>();
  const keys: number[] = [];
  let count = 0;
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    const point = new Vector3().fromBufferAttribute(position, vertex);
    const cell = point.toArray().map((n) => Math.floor(n / tolerance));
    let key: number | undefined;
    for (const dx of [-1, 0, 1])
      for (const dy of [-1, 0, 1])
        for (const dz of [-1, 0, 1]) {
          const near = buckets
            .get(`${cell[0] + dx}:${cell[1] + dy}:${cell[2] + dz}`)
            ?.find(
              (candidate) => candidate.point.distanceTo(point) <= tolerance
            );
          if (near) key = near.key;
        }
    if (key === undefined) {
      key = count++;
      const cellKey = cell.join(":");
      const bucket = buckets.get(cellKey) ?? [];
      bucket.push({ key, point });
      buckets.set(cellKey, bucket);
    }
    keys.push(key);
  }
  const edges = new Map<string, { count: number; direction: number }>();
  const adjacent = new Map<number, Set<number>>();
  const a = new Vector3(),
    b = new Vector3(),
    c = new Vector3(),
    ab = new Vector3(),
    ac = new Vector3(),
    cross = new Vector3();
  let collapsed = 0,
    minArea = Infinity,
    minAlignment = Infinity,
    volume = 0;
  const normal = geometry.getAttribute("normal"),
    uv = geometry.getAttribute("uv");
  for (let at = 0; at < index.count; at += 3) {
    const vertices = [index.getX(at), index.getX(at + 1), index.getX(at + 2)];
    const face = vertices.map((v) => keys[v]);
    if (new Set(face).size !== 3) collapsed += 1;
    for (const vertex of face)
      if (!adjacent.has(vertex)) adjacent.set(vertex, new Set());
    for (let edge = 0; edge < 3; edge += 1) {
      const first = face[edge],
        second = face[(edge + 1) % 3];
      const key = `${Math.min(first, second)}:${Math.max(first, second)}`;
      const record = edges.get(key) ?? { count: 0, direction: 0 };
      record.count += 1;
      record.direction += first < second ? 1 : -1;
      edges.set(key, record);
      adjacent.get(first)?.add(second);
      adjacent.get(second)?.add(first);
    }
    a.fromBufferAttribute(position, vertices[0]);
    b.fromBufferAttribute(position, vertices[1]);
    c.fromBufferAttribute(position, vertices[2]);
    cross.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
    minArea = Math.min(minArea, cross.length());
    volume += a.dot(new Vector3().crossVectors(b, c)) / 6;
    if (
      vertices.every(
        (v) =>
          uv.getY(v) > 0 &&
          uv.getY(v) < 1 &&
          uv.getX(v) >= 0.12 &&
          uv.getX(v) <= 0.88
      )
    ) {
      const authored = new Vector3();
      for (const v of vertices)
        authored.add(new Vector3().fromBufferAttribute(normal, v));
      minAlignment = Math.min(
        minAlignment,
        cross.clone().normalize().dot(authored.normalize())
      );
    }
  }
  const first = adjacent.keys().next().value;
  if (first === undefined) throw new Error("no referenced vertices");
  const visited = new Set<number>(),
    pending = [first];
  while (pending.length) {
    const current = pending.pop();
    if (current === undefined || visited.has(current)) continue;
    visited.add(current);
    for (const next of adjacent.get(current) ?? [])
      if (!visited.has(next)) pending.push(next);
  }
  expect(collapsed).toBe(0);
  expect(minArea).toBeGreaterThan(1e-8);
  expect(minAlignment).toBeGreaterThan(0);
  expect(volume / length ** 3).toBeGreaterThan(0);
  expect(new Set([...edges.values()].map((e) => e.count))).toEqual(
    new Set([2])
  );
  expect(new Set([...edges.values()].map((e) => e.direction))).toEqual(
    new Set([0])
  );
  expect(visited.size).toBe(adjacent.size);
}

describe("five complete plumeria ribbons", () => {
  for (const seed of seeds)
    it(`closes the lower outlet with the ${seed} petal tips`, () => {
      const built = plumeriaScene({ debugView: "clay", seed });
      try {
        const meshes: Mesh[] = [];
        built.scene.traverse((object) => {
          if (object instanceof Mesh) meshes.push(object);
        });
        built.scene.updateMatrixWorld(true);
        expect(meshes).toHaveLength(5);
        const position = meshes[0].geometry.getAttribute("position");
        for (let column = 0; column < 73; column += 1) {
          expect(Math.hypot(position.getX(column), position.getY(column))).toBe(
            0
          );
          expect(position.getZ(column)).toBe(position.getZ(0));
        }
        // Actual triangle hits from below: no alpha, camera angle or added plug
        // can satisfy this. The upper recess remains deep rather than capped.
        for (const radius of [0, 0.004, 0.008]) {
          const angles =
            radius === 0
              ? [0]
              : Array.from({ length: 16 }, (_, i) => (i * Math.PI) / 8);
          for (const angle of angles) {
            const ray = new Raycaster(
              new Vector3(
                radius * built.length * Math.cos(angle),
                radius * built.length * Math.sin(angle),
                -built.length
              ),
              new Vector3(0, 0, 1)
            );
            const hit = ray.intersectObjects(meshes, false)[0];
            expect(hit).toBeDefined();
            expect(hit.point.z / built.length).toBeLessThan(-0.5);
          }
        }
        const down = new Raycaster(
          new Vector3(0, 0, built.length),
          new Vector3(0, 0, -1)
        );
        expect(
          down.intersectObjects(meshes, false)[0]?.point.z / built.length
        ).toBeLessThan(-0.5);
      } finally {
        built.dispose();
      }
    });
  for (const seed of seeds)
    for (const development of [0, 0.5, 1]) {
      it(`keeps each ${seed} petal a complete oriented manifold at ${development}`, () => {
        const built = plumeriaScene({ debugView: "clay", seed, development });
        try {
          const meshes: Mesh[] = [];
          built.scene.traverse((object) => {
            if (object instanceof Mesh) meshes.push(object);
          });
          expect(meshes).toHaveLength(5);
          for (const [i, mesh] of meshes.entries()) {
            expect(mesh.userData.organ).toBe("petal");
            expect(mesh.geometry).toBe(meshes[0].geometry);
            expect(mesh.position.toArray()).toEqual([0, 0, 0]);
            expect(mesh.scale.toArray()).toEqual([1, 1, 1]);
            expect(mesh.rotation.x).toBe(0);
            expect(mesh.rotation.y).toBe(0);
            expect(mesh.rotation.z).toBe((-i * 2 * Math.PI) / 5);
          }
          const geometry = meshes[0].geometry;
          manifold(geometry, built.length);
          const uv = geometry.getAttribute("uv"),
            positions = geometry.getAttribute("position"),
            normals = geometry.getAttribute("normal");
          const half = positions.count / 2,
            columns = 73,
            rows = half / columns;
          const referencedRows = new Set(
            Array.from(geometry.getIndex()?.array ?? [], (i) =>
              Math.floor((i % half) / columns)
            )
          );
          expect(referencedRows.size).toBe(rows);
          expect(referencedRows.has(0)).toBe(true);
          const grown = growPlumeria(seed);
          const sample = preparePlumeriaPetal(
            grown.form,
            sampleRelief(
              createRng(`${seed}/relief`),
              grown.genome.form.fullness
            ),
            development
          );
          let maximumError = 0;
          for (let row = 0; row < rows; row += 1) {
            const section = sample(Math.sqrt(uv.getY(row * columns)));
            for (let column = 0; column < columns; column += 1) {
              const v = row * columns + column;
              const expected = section.point(2 * uv.getX(v) - 1);
              const midpoint = [0, 1, 2].map(
                (c) =>
                  (positions.array[3 * v + c] +
                    positions.array[3 * (v + half) + c]) /
                  2
              );
              maximumError = Math.max(
                maximumError,
                Math.hypot(
                  ...midpoint.map((p, c) => p - section.scale * expected[c])
                ) / built.length
              );
              if (
                row === 0 ||
                row === rows - 1 ||
                column === 0 ||
                column === columns - 1
              ) {
                expect(
                  new Vector3()
                    .fromBufferAttribute(positions, v)
                    .distanceTo(
                      new Vector3().fromBufferAttribute(positions, v + half)
                    )
                ).toBe(0);
                expect(
                  new Vector3()
                    .fromBufferAttribute(normals, v)
                    .dot(new Vector3().fromBufferAttribute(normals, v + half))
                ).toBeGreaterThan(0.999);
              }
            }
          }
          expect(maximumError).toBeLessThan(3e-7);
          if (development === 1) {
            for (const column of [0, columns - 1]) {
              const a = (rows - 2) * columns + column,
                b = a + columns;
              const start = new Vector3(
                positions.getX(a),
                positions.getY(a),
                0
              );
              const end = new Vector3(positions.getX(b), positions.getY(b), 0);
              const chord = new Line3(start, end);
              const closest = new Vector3();
              for (let i = 0; i <= 32; i += 1) {
                const along = uv.getY(a) + ((1 - uv.getY(a)) * i) / 32;
                const [x, y] = laminaPoint(
                  grown.form,
                  column === 0 ? -1 : 1,
                  along,
                  1
                );
                const point = new Vector3(x, -y, 0);
                chord.closestPointToPoint(point, true, closest);
                expect(point.distanceTo(closest) / built.length).toBeLessThan(
                  4e-4
                );
              }
            }
          }
          expect(
            Math.min(
              ...Array.from({ length: half }, (_, i) => positions.getZ(i))
            ) / built.length
          ).toBeLessThan(-0.55);
        } finally {
          built.dispose();
        }
      });
    }
  for (const seed of seeds)
    it(`unwraps ${seed} by widening and outward bending, not corkscrew rotation`, () => {
      const grown = growPlumeria(seed);
      const sample = preparePlumeriaPetal(
        grown.form,
        sampleRelief(createRng(`${seed}/relief`), grown.genome.form.fullness)
      );
      const vector = (t: number, u: number) =>
        new Vector3(...sample(t).point(u));
      const tangent = (t: number) =>
        vector(t + 1e-4, 0)
          .sub(vector(t - 1e-4, 0))
          .normalize();
      expect(tangent(0.1).z).toBeGreaterThan(0.97);
      expect(Math.hypot(tangent(0.8).x, tangent(0.8).y)).toBeGreaterThan(0.95);
      const widths = [0, 0.25, 0.5, 0.75].map(
        (t) => vector(t, 1).distanceTo(vector(t, -1)) / grown.form.length
      );
      expect(widths[0]).toBeLessThan(0.07);
      for (let i = 1; i < widths.length; i += 1)
        expect(widths[i]).toBeGreaterThan(widths[i - 1]);
      expect(widths[3]).toBeGreaterThan(0.45);
      expect(vector(1, 1).distanceTo(vector(1, -1))).toBeLessThan(1e-8);
      // Azimuth is undefined at the converged basal pole itself.
      const angles = Array.from({ length: 128 }, (_, i) => {
        const p = vector((i + 1) / 128, 0);
        return Math.atan2(p.y, p.x);
      });
      expect(Math.max(...angles) - Math.min(...angles)).toBeLessThan(
        Math.PI / 6
      );
      const bladeAngles = angles.slice(95);
      expect(Math.max(...bladeAngles) - Math.min(...bladeAngles)).toBeLessThan(
        Math.PI / 18
      );
      for (const t of [0.75, 0.8, 0.85, 0.9, 0.95]) {
        const chord = vector(t, 1).sub(vector(t, -1));
        expect(
          Math.atan2(Math.abs(chord.z), Math.hypot(chord.x, chord.y))
        ).toBeLessThan(Math.PI / 12);
      }
      // A wrapped strip has a bowed transverse section, not a flat narrow stem.
      const middle = vector(0.1, 0),
        first = vector(0.1, -1),
        last = vector(0.1, 1);
      expect(
        middle.distanceTo(first.clone().add(last).multiplyScalar(0.5)) /
          first.distanceTo(last)
      ).toBeGreaterThan(0.15);
      for (const join of [0.25, 0.3, 0.5, 0.6, 0.65, 0.68, 0.85, 0.93])
        for (const u of [-0.9, 0, 0.9]) {
          const p = vector(join, u);
          const before = p
            .clone()
            .sub(vector(join - 1e-5, u))
            .normalize();
          const after = vector(join + 1e-5, u)
            .sub(p)
            .normalize();
          expect(before.dot(after)).toBeGreaterThan(0.999);
        }
    });
});
