export function smootherstep(value: number): number {
  const x = Math.min(1, Math.max(0, value));
  return x * x * x * (x * (6 * x - 15) + 10);
}

export function plumeriaHalfDepth(
  along: number,
  across: number,
  halfWidth: number,
  thickness: number
): number {
  const interior = Math.max(0, 1 - across * across);
  const body =
    smootherstep((along - 0.32) / 0.18) *
    (1 - smootherstep((along - 0.85) / 0.15));
  // A positive elliptical base keeps a vertical rim tangent; extra body
  // fades quadratically toward the overlapping edges, not into a sharp lip.
  return (
    1.04 *
    smootherstep((along - 0.05) / 0.18) *
    thickness *
    halfWidth *
    Math.sqrt(interior) *
    (1 - 0.6 * across * across) *
    (1 + 1.5 * body * interior ** 2)
  );
}
