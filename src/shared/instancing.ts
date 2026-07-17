import type { Matrix4, Point3 } from "@/src/core/model";

function determinant(transform: Matrix4): number {
  return (
    transform[0] *
      (transform[5] * transform[10] - transform[9] * transform[6]) -
    transform[4] *
      (transform[1] * transform[10] - transform[9] * transform[2]) +
    transform[8] * (transform[1] * transform[6] - transform[5] * transform[2])
  );
}

function hasOrthogonalBasis(transform: Matrix4): boolean {
  const x: Point3 = [transform[0], transform[1], transform[2]];
  const y: Point3 = [transform[4], transform[5], transform[6]];
  const z: Point3 = [transform[8], transform[9], transform[10]];
  const orthogonal = (left: Point3, right: Point3) => {
    const product = Math.hypot(...left) * Math.hypot(...right);
    const dot = left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
    return product > 0 && Math.abs(dot) <= product * 1e-8;
  };
  return orthogonal(x, y) && orthogonal(x, z) && orthogonal(y, z);
}

export function supportsInstancedNormals(transform: Matrix4): boolean {
  return determinant(transform) > 0 && hasOrthogonalBasis(transform);
}
