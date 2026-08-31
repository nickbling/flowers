import { BufferAttribute, BufferGeometry, SphereGeometry } from "three";
import type { IndexedMeshGeometry, OrganGeometry } from "@/src/core/model";
import { createLaminaGeometry } from "@/src/gl/lamina";
import { createSweepGeometry } from "@/src/gl/sweep";

function meshGeometry(geometry: IndexedMeshGeometry): BufferGeometry {
  const result = new BufferGeometry();
  result.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(geometry.positions.flat()), 3)
  );
  if (geometry.surfaceCoordinates)
    result.setAttribute(
      "uv",
      new BufferAttribute(
        new Float32Array(geometry.surfaceCoordinates.flat()),
        2
      )
    );
  result.setIndex([...geometry.indices]);
  result.computeVertexNormals();
  return result;
}

export function createGeometry(
  geometry: OrganGeometry,
  seed: string
): BufferGeometry {
  if (geometry.kind === "lamina") return createLaminaGeometry(geometry, seed);
  if (geometry.kind === "sweep") return createSweepGeometry(geometry);
  if (geometry.kind === "ellipsoid") {
    const result = new SphereGeometry(1, 20, 14);
    result.scale(...geometry.radii);
    return result;
  }
  return meshGeometry(geometry);
}
