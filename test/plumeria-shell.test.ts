import { Mesh, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { plumeriaScene } from "@/src/gl";
import { createPlumeriaSkin } from "@/src/gl/plumeria-skin";

function petal(seed: string) {
  const built = plumeriaScene({ seed, debugView: "clay" });
  let mesh: Mesh | undefined;
  built.scene.traverse((object) => {
    if (!mesh && object instanceof Mesh && object.userData.organ === "petal")
      mesh = object;
  });
  if (!mesh) throw new Error("missing petal");
  return { ...built, geometry: mesh.geometry };
}

describe("plumeria shell volume", () => {
  for (const seed of ["reference", "shape-110", "shape-165"]) {
    it(`has broad lens sections and geometrically smooth rims for ${seed}`, () => {
      const built = petal(seed);
      try {
        const position = built.geometry.getAttribute("position");
        const normal = built.geometry.getAttribute("normal");
        const uv = built.geometry.getAttribute("uv");
        const half = position.count / 2;
        const point = (at: number) =>
          new Vector3().fromBufferAttribute(position, at);
        for (const along of [0.5, 0.65, 0.8]) {
          let nearest = 0;
          for (let i = 0; i < half; i += 1)
            if (
              Math.abs(uv.getY(i) - along) < Math.abs(uv.getY(nearest) - along)
            )
              nearest = i;
          const row = Array.from({ length: half }, (_, i) => i).filter(
            (i) => uv.getY(i) === uv.getY(nearest)
          );
          const first = row[0],
            last = row[row.length - 1],
            center = row[Math.floor(row.length / 2)];
          const lateral = point(last).sub(point(first)).setZ(0);
          const width = lateral.length();
          lateral.normalize();
          const depth = position.getZ(center) - position.getZ(center + half);
          // A soft blade is measurably thick, but much wider than it is deep.
          expect(depth / built.length).toBeGreaterThan(0.025);
          expect(depth / width).toBeLessThan(0.2);
          const loop = [
            ...row,
            ...row
              .slice()
              .reverse()
              .map((i) => i + half),
          ];
          let area = 0;
          for (let i = 0; i < loop.length; i += 1) {
            const a = point(loop[i]),
              b = point(loop[(i + 1) % loop.length]);
            area += a.dot(lateral) * b.z - b.dot(lateral) * a.z;
          }
          // A narrow ridge can meet peak depth but not occupy half this box.
          expect(Math.abs(area) / (2 * width * depth)).toBeGreaterThan(0.5);
          for (const [edge, neighbor, sign] of [
            [first, first + 1, -1],
            [last, last - 1, 1],
          ]) {
            const origin = point(edge);
            const front = point(neighbor).sub(origin).normalize();
            const back = point(neighbor + half)
              .sub(origin)
              .normalize();
            // Opposite section tangents at the seam, not averaged cusp shading.
            expect(front.dot(back)).toBeLessThan(-0.95);
            const outward = new Vector3().fromBufferAttribute(normal, edge);
            const rimTangent = point(edge + row.length).sub(
              point(edge - row.length)
            );
            const expected = new Vector3(
              rimTangent.y,
              -rimTangent.x,
              0
            ).normalize();
            if (expected.dot(lateral) * sign < 0) expected.negate();
            expect(outward.dot(expected)).toBeGreaterThan(0.99);
            expect(
              outward.dot(
                new Vector3().fromBufferAttribute(normal, edge + half)
              )
            ).toBeGreaterThan(0.99999);
          }
        }
      } finally {
        built.dispose();
      }
    });
  }
});

it("packs bounded isotropic normal slopes without a pigment channel", () => {
  const texture = createPlumeriaSkin("reference/fiber");
  try {
    const data = texture.image.data as Uint8Array;
    let xx = 0,
      yy = 0,
      xy = 0,
      peak = 0;
    let opaque = true;
    for (let at = 0; at < data.length; at += 4) {
      const z = data[at + 2] / 127.5 - 1;
      const x = (data[at] / 127.5 - 1) / z;
      const y = (data[at + 1] / 127.5 - 1) / z;
      xx += x * x;
      yy += y * y;
      xy += x * y;
      peak = Math.max(peak, Math.hypot(x, y));
      opaque &&= data[at + 3] === 255;
    }
    expect(Math.sqrt((xx + yy) / (data.length / 4))).toBeCloseTo(0.035, 2);
    expect(peak).toBeLessThan(0.2);
    expect(xx / yy).toBeGreaterThan(0.95);
    expect(xx / yy).toBeLessThan(1.05);
    expect(Math.abs(xy / Math.sqrt(xx * yy))).toBeLessThan(0.03);
    expect(opaque).toBe(true);
    expect(texture.channel).toBe(1);
    expect(texture.generateMipmaps).toBe(true);
  } finally {
    texture.dispose();
  }
});
