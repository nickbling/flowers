import type { Matrix4 } from "@/src/core/model";

const matrix = (values: readonly number[]): Matrix4 =>
  Object.freeze([...values]) as Matrix4;

export const IDENTITY_TRANSFORM: Matrix4 = matrix([
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
]);

export function multiplyTransforms(a: Matrix4, b: Matrix4): Matrix4 {
  const result = Array<number>(16).fill(0);
  for (let column = 0; column < 4; column += 1)
    for (let row = 0; row < 4; row += 1)
      for (let inner = 0; inner < 4; inner += 1)
        result[column * 4 + row] += a[inner * 4 + row] * b[column * 4 + inner];
  return matrix(result);
}

function finite(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
}

export function translate(x = 0, y = 0, z = 0): Matrix4 {
  finite(x, "translation x");
  finite(y, "translation y");
  finite(z, "translation z");
  return matrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
}

export function scale(x: number, y = x, z = x): Matrix4 {
  for (const [axis, value] of Object.entries({ x, y, z })) {
    finite(value, `scale ${axis}`);
    if (value === 0) throw new RangeError(`scale ${axis} must not be zero`);
  }
  return matrix([x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]);
}

export function rotateX(radians: number): Matrix4 {
  finite(radians, "x rotation");
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return matrix([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
}

export function rotateY(radians: number): Matrix4 {
  finite(radians, "y rotation");
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return matrix([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
}

export function rotateZ(radians: number): Matrix4 {
  finite(radians, "z rotation");
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return matrix([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

export type RadialTransformOptions = Readonly<{
  count: number;
  radius?: number;
  startAngle?: number;
  tilt?: number;
  z?: number;
}>;

function positiveCount(count: number): void {
  if (!Number.isSafeInteger(count) || count < 1)
    throw new RangeError("instance count must be a positive safe integer");
}

export function radialTransforms({
  count,
  radius = 0,
  startAngle = 0,
  tilt = 0,
  z = 0,
}: RadialTransformOptions): readonly Matrix4[] {
  positiveCount(count);
  if (!Number.isFinite(radius) || radius < 0)
    throw new RangeError("radial radius must be finite and non-negative");
  finite(startAngle, "radial start angle");
  finite(tilt, "radial tilt");
  finite(z, "radial z");
  return Object.freeze(
    Array.from({ length: count }, (_, index) => {
      const angle = startAngle + (index * 2 * Math.PI) / count;
      return multiplyTransforms(
        translate(radius * Math.cos(angle), radius * Math.sin(angle), z),
        multiplyTransforms(rotateZ(angle - Math.PI / 2), rotateX(tilt))
      );
    })
  );
}

export type PhyllotaxisTransformOptions = Readonly<{
  count: number;
  radius: number;
  innerRadius?: number;
  startAngle?: number;
  divergence?: number;
  dome?: number;
}>;

export function phyllotaxisTransforms({
  count,
  radius,
  innerRadius = 0,
  startAngle = 0,
  divergence = (137.507764 * Math.PI) / 180,
  dome = 0,
}: PhyllotaxisTransformOptions): readonly Matrix4[] {
  positiveCount(count);
  if (!(radius >= 0) || !Number.isFinite(radius))
    throw new RangeError("phyllotaxis radius must be finite and non-negative");
  if (!Number.isFinite(innerRadius) || innerRadius < 0 || innerRadius > radius)
    throw new RangeError(
      "phyllotaxis inner radius must be between zero and radius"
    );
  finite(startAngle, "phyllotaxis start angle");
  finite(divergence, "phyllotaxis divergence");
  finite(dome, "phyllotaxis dome");
  return Object.freeze(
    Array.from({ length: count }, (_, index) => {
      const areaProgress = (index + 0.5) / count;
      const r = Math.sqrt(
        innerRadius * innerRadius +
          (radius * radius - innerRadius * innerRadius) * areaProgress
      );
      const progress = radius === 0 ? 0 : r / radius;
      const angle = startAngle + index * divergence;
      const z = dome * (1 - progress * progress);
      return multiplyTransforms(
        translate(r * Math.cos(angle), r * Math.sin(angle), z),
        rotateZ(angle)
      );
    })
  );
}
