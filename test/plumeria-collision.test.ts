import { Line3, Matrix4, Mesh, Vector3 } from "three";
import { MeshBVH } from "three-mesh-bvh";
import { describe, expect, it } from "vitest";
import { plumeriaScene } from "@/src/gl";
import { preparePlumeriaPetal, sampleRelief } from "@/src/gl/plumeria-surface";
import { growPlumeria } from "@/src/plumeria/specimen";
import { createRng } from "@/src/shared/prng";

const seeds = ["reference", "shape-67", "shape-110", "shape-165"] as const;
const stages = [
  0, 0.15, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.75, 0.8, 0.85,
  0.9, 0.95, 1,
];

describe("complete plumeria ribbon clearance", () => {
  for (const seed of seeds)
    for (const development of stages) {
      it(`has no ribbon intersections for ${seed} at ${development}`, () => {
        const built = plumeriaScene({ debugView: "clay", seed, development });
        try {
          const mesh = built.scene.getObjectByProperty("type", "Mesh");
          if (!(mesh instanceof Mesh)) throw new Error("missing petal");
          const tree = new MeshBVH(mesh.geometry, { indirect: true });
          const toleranceSquared = (3e-9 * built.length) ** 2;
          const basalTip = new Vector3().fromBufferAttribute(
            mesh.geometry.getAttribute("position"),
            0
          );
          const contact = new Line3();
          // No excluded throat band: only the deliberately shared basal point
          // may touch. Any intersection extending away from it is a failure.
          for (const separation of [1, 2]) {
            const transform = new Matrix4().makeRotationZ(
              (-separation * 2 * Math.PI) / 5
            );
            const intersects = tree.bvhcast(tree, transform, {
              intersectsTriangles(a, b) {
                if (!a.intersectsTriangle(b, contact)) return false;
                return (
                  contact.start.distanceToSquared(basalTip) >
                    toleranceSquared ||
                  contact.end.distanceToSquared(basalTip) > toleranceSquared
                );
              },
            });
            expect(intersects, `rotation ${separation * 72} degrees`).toBe(
              false
            );
          }
          const same = (a: Vector3, b: Vector3) =>
            a.distanceToSquared(b) <= toleranceSquared;
          const selfIntersects = tree.bvhcast(tree, new Matrix4(), {
            intersectsTriangles(a, b, first, second) {
              if (first >= second) return false;
              // Only the welded one-ring is adjacent. No spatial/along band skip.
              if (
                [a.a, a.b, a.c].some((p) =>
                  [b.a, b.b, b.c].some((q) => same(p, q))
                )
              )
                return false;
              return a.intersectsTriangle(b);
            },
          });
          expect(
            selfIntersects,
            "nonadjacent triangles of the same ribbon"
          ).toBe(false);
        } finally {
          built.dispose();
        }
      });
    }

  for (const seed of seeds)
    it(`nests wrapped edges in one cyclic direction for ${seed}`, () => {
      const grown = growPlumeria(seed);
      const sample = preparePlumeriaPetal(
        grown.form,
        sampleRelief(createRng(`${seed}/relief`), grown.genome.form.fullness)
      );
      // Matching azimuths in the basal overlap, not merely matching material rows.
      const section = sample(0.1);
      const center = section.point(0),
        edge = section.point(1);
      const halfAngle =
        Math.atan2(center[1], center[0]) - Math.atan2(edge[1], edge[0]);
      expect(2 * halfAngle).toBeGreaterThan((2 * Math.PI) / 5);
      const u = Math.PI / (5 * halfAngle);
      const high = section.point(u),
        low = section.point(-u);
      for (let petal = 0; petal < 5; petal += 1) {
        const a = Math.atan2(high[1], high[0]) - (petal * 2 * Math.PI) / 5;
        const b =
          Math.atan2(low[1], low[0]) - (((petal + 1) % 5) * 2 * Math.PI) / 5;
        expect(
          Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))
        ).toBeLessThan(1e-10);
        expect(Math.hypot(high[0], high[1])).toBeLessThan(
          Math.hypot(low[0], low[1])
        );
        expect(high[2]).toBeGreaterThan(low[2]);
      }
    });
});
