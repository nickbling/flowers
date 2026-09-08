import { Mesh, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { plumeriaScene } from "@/src/gl";

// Resolve the genuine small lumen without coarse pixel-grid coverage aliasing.
const RESOLUTION = 720;
const seeds = ["reference", "shape-67", "shape-110", "shape-165"] as const;

type Bounds = readonly [number, number, number, number];
type Projection = Readonly<{
  area: number;
  centerCoverage: number;
  diameter: number;
}>;

function sceneBounds(seed: string): Bounds {
  const built = plumeriaScene({ debugView: "clay", development: 1, seed });
  const point = new Vector3();
  let minimumX = Infinity;
  let minimumY = Infinity;
  let maximumX = -Infinity;
  let maximumY = -Infinity;
  try {
    built.scene.updateMatrixWorld(true);
    built.scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      if (object.userData.organ !== "petal") return;
      const position = object.geometry.getAttribute("position");
      for (const vertex of Array(position.count).keys()) {
        point
          .set(
            position.getX(vertex),
            position.getY(vertex),
            position.getZ(vertex)
          )
          .applyMatrix4(object.matrixWorld);
        minimumX = Math.min(minimumX, point.x);
        minimumY = Math.min(minimumY, point.y);
        maximumX = Math.max(maximumX, point.x);
        maximumY = Math.max(maximumY, point.y);
      }
    });
  } finally {
    built.dispose();
  }
  const diameter = Math.max(maximumX - minimumX, maximumY - minimumY);
  const padding = 0.04 * diameter;
  return [
    minimumX - padding,
    minimumY - padding,
    maximumX + padding,
    maximumY + padding,
  ];
}

function projection(
  seed: string,
  development: number,
  bounds: Bounds
): Projection {
  const built = plumeriaScene({ debugView: "clay", development, seed });
  const [minimumX, minimumY, maximumX, maximumY] = bounds;
  const pixelWidth = (maximumX - minimumX) / RESOLUTION;
  const pixelHeight = (maximumY - minimumY) / RESOLUTION;
  const occupied = new Uint8Array(RESOLUTION * RESOLUTION);
  const point = new Vector3();
  let flowerMinimumX = Infinity;
  let flowerMinimumY = Infinity;
  let flowerMaximumX = -Infinity;
  let flowerMaximumY = -Infinity;

  const rasterize = (
    first: readonly [number, number],
    second: readonly [number, number],
    third: readonly [number, number]
  ): void => {
    const denominator =
      (second[1] - third[1]) * (first[0] - third[0]) +
      (third[0] - second[0]) * (first[1] - third[1]);
    if (Math.abs(denominator) < 1e-10) return;
    const fromX = Math.max(
      0,
      Math.floor(
        (Math.min(first[0], second[0], third[0]) - minimumX) / pixelWidth
      )
    );
    const toX = Math.min(
      RESOLUTION - 1,
      Math.ceil(
        (Math.max(first[0], second[0], third[0]) - minimumX) / pixelWidth
      )
    );
    const fromY = Math.max(
      0,
      Math.floor(
        (Math.min(first[1], second[1], third[1]) - minimumY) / pixelHeight
      )
    );
    const toY = Math.min(
      RESOLUTION - 1,
      Math.ceil(
        (Math.max(first[1], second[1], third[1]) - minimumY) / pixelHeight
      )
    );
    for (let y = fromY; y <= toY; y += 1) {
      const sampleY = minimumY + (y + 0.5) * pixelHeight;
      for (let x = fromX; x <= toX; x += 1) {
        const sampleX = minimumX + (x + 0.5) * pixelWidth;
        const one =
          ((second[1] - third[1]) * (sampleX - third[0]) +
            (third[0] - second[0]) * (sampleY - third[1])) /
          denominator;
        const two =
          ((third[1] - first[1]) * (sampleX - third[0]) +
            (first[0] - third[0]) * (sampleY - third[1])) /
          denominator;
        if (one >= 0 && two >= 0 && one + two <= 1)
          occupied[y * RESOLUTION + x] = 1;
      }
    }
  };

  try {
    built.scene.updateMatrixWorld(true);
    built.scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      if (object.userData.organ !== "petal") return;
      const geometry = object.geometry;
      const index = geometry.getIndex();
      const position = geometry.getAttribute("position");
      if (!index) throw new Error("flower geometry must be indexed");
      const projected = Array.from({ length: position.count }, (_, vertex) => {
        point
          .set(
            position.getX(vertex),
            position.getY(vertex),
            position.getZ(vertex)
          )
          .applyMatrix4(object.matrixWorld);
        flowerMinimumX = Math.min(flowerMinimumX, point.x);
        flowerMinimumY = Math.min(flowerMinimumY, point.y);
        flowerMaximumX = Math.max(flowerMaximumX, point.x);
        flowerMaximumY = Math.max(flowerMaximumY, point.y);
        return [point.x, point.y] as const;
      });
      for (const face of Array(index.count / 3).keys())
        rasterize(
          projected[index.getX(3 * face)],
          projected[index.getX(3 * face + 1)],
          projected[index.getX(3 * face + 2)]
        );
    });
  } finally {
    built.dispose();
  }

  const diameter = Math.max(
    flowerMaximumX - flowerMinimumX,
    flowerMaximumY - flowerMinimumY
  );
  let centerPixels = 0;
  let coveredCenterPixels = 0;
  for (const pixel of Array(occupied.length).keys()) {
    const x = pixel % RESOLUTION;
    const y = Math.floor(pixel / RESOLUTION);
    const sampleX = minimumX + (x + 0.5) * pixelWidth;
    const sampleY = minimumY + (y + 0.5) * pixelHeight;
    if (Math.hypot(sampleX, sampleY) > 0.06 * diameter) continue;
    centerPixels += 1;
    coveredCenterPixels += occupied[pixel];
  }
  const pixels = occupied.reduce((total, value) => total + value, 0);
  return {
    area: pixels * pixelWidth * pixelHeight,
    centerCoverage: coveredCenterPixels / centerPixels,
    diameter,
  };
}

describe("plumeria development", () => {
  it("keeps one exact topology and bounded motion throughout development", () => {
    const stages = Array.from({ length: 121 }, (_, index) => index / 120);
    let previousPetal: Float32Array | undefined;
    let petalIndices: number[] | undefined;
    let petalLayout: string | undefined;

    const layout = (mesh: Mesh): string =>
      JSON.stringify(
        Object.entries(mesh.geometry.attributes)
          .sort(([first], [second]) => first.localeCompare(second))
          .map(([name, attribute]) => [
            name,
            attribute.itemSize,
            attribute.count,
            attribute.normalized,
          ])
      );
    const maximumMotion = (
      previous: Float32Array | undefined,
      current: Float32Array
    ): number => {
      if (!previous) return 0;
      let maximum = 0;
      for (let at = 0; at < current.length; at += 3)
        maximum = Math.max(
          maximum,
          Math.hypot(
            current[at] - previous[at],
            current[at + 1] - previous[at + 1],
            current[at + 2] - previous[at + 2]
          )
        );
      return maximum;
    };

    for (const development of stages) {
      const built = plumeriaScene({
        debugView: "clay",
        development,
        seed: "reference",
      });
      try {
        const petal = built.scene.getObjectByProperty("type", "Mesh");
        if (!(petal instanceof Mesh)) throw new Error("missing petal");
        const petalPosition = new Float32Array(
          petal.geometry.getAttribute("position").array
        );
        const nextPetalIndices = Array.from(
          petal.geometry.getIndex()?.array ?? [],
          Number
        );
        petalIndices ??= nextPetalIndices;
        petalLayout ??= layout(petal);
        expect(nextPetalIndices).toEqual(petalIndices);
        expect(layout(petal)).toBe(petalLayout);
        expect(
          maximumMotion(previousPetal, petalPosition) / built.length,
          `whole-ribbon motion at development ${development}`
        ).toBeLessThan(0.095);
        previousPetal = petalPosition;
      } finally {
        built.dispose();
      }
    }
  }, 15_000);

  it.each([
    0.1, 0.25, 0.5, 0.75, 0.9,
  ])("keeps continuous velocity and acceleration around development %s", (center) => {
    const h = 0.001;
    const sample = (development: number) => {
      const built = plumeriaScene({
        debugView: "clay",
        development,
        seed: "reference",
      });
      try {
        const petal = built.scene.getObjectByProperty("type", "Mesh");
        if (!(petal instanceof Mesh)) throw new Error("missing petal");
        return {
          length: built.length,
          petal: new Float32Array(
            petal.geometry.getAttribute("position").array
          ),
        };
      } finally {
        built.dispose();
      }
    };
    const stages = [-2, -1, 0, 1, 2].map((offset) =>
      sample(center + offset * h)
    );
    // Three samples measure the jump between one-sided velocities. Four
    // samples measure the difference between the one-sided accelerations;
    // their shared center term cancels algebraically.
    const maximumVector = (
      first: Float32Array,
      second: Float32Array,
      third: Float32Array,
      fourth?: Float32Array
    ): number => {
      let maximum = 0;
      for (let at = 0; at < first.length; at += 3) {
        const component = (index: number) =>
          fourth
            ? (fourth[at + index] -
                2 * third[at + index] +
                2 * second[at + index] -
                first[at + index]) /
              h ** 2
            : (third[at + index] - 2 * second[at + index] + first[at + index]) /
              h;
        maximum = Math.max(
          maximum,
          Math.hypot(component(0), component(1), component(2))
        );
      }
      return maximum;
    };

    const velocityJump =
      maximumVector(stages[1].petal, stages[2].petal, stages[3].petal) /
      stages[2].length;
    const accelerationJump =
      maximumVector(
        stages[0].petal,
        stages[1].petal,
        stages[3].petal,
        stages[4].petal
      ) / stages[2].length;
    expect(velocityJump, "whole-ribbon velocity jump").toBeLessThan(0.055);
    expect(accelerationJump, "whole-ribbon acceleration jump").toBeLessThan(10);
  });

  for (const seed of seeds) {
    it(`opens progressively without exposing the ${seed} center`, () => {
      const bounds = sceneBounds(seed);
      const closed = projection(seed, 0, bounds);
      const halfOpen = projection(seed, 0.5, bounds);
      const open = projection(seed, 1, bounds);
      const built = plumeriaScene({ debugView: "clay", seed });
      try {
        expect(closed.diameter / open.diameter).toBeLessThanOrEqual(0.38);
        expect(halfOpen.diameter / open.diameter).toBeGreaterThanOrEqual(0.5);
        expect(halfOpen.diameter / open.diameter).toBeLessThanOrEqual(0.78);
        expect(halfOpen.area / closed.area).toBeGreaterThanOrEqual(1.25);
        expect(open.area / halfOpen.area).toBeGreaterThanOrEqual(1.25);
        expect(open.centerCoverage).toBeGreaterThanOrEqual(0.99);
        const petal = built.scene.getObjectByProperty("type", "Mesh");
        if (!(petal instanceof Mesh)) throw new Error("missing petal");
        const positions = petal.geometry.getAttribute("position");
        const baseRadius = Math.max(
          ...Array.from({ length: 73 }, (_, i) =>
            Math.hypot(positions.getX(i + 73), positions.getY(i + 73))
          )
        );
        expect(baseRadius).toBeGreaterThan(0);
        expect((2 * baseRadius) / open.diameter).toBeLessThanOrEqual(0.08);
      } finally {
        built.dispose();
      }
    });
  }
});
