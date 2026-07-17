export function catmullRomControls(
  p0: number,
  p1: number,
  p2: number,
  p3: number
): readonly [first: number, second: number] {
  return [p1 + (p2 - p0) / 6, p2 - (p3 - p1) / 6];
}

export function cubicBezierValue(
  from: number,
  first: number,
  second: number,
  to: number,
  progress: number
): number {
  const remaining = 1 - progress;
  return (
    remaining ** 3 * from +
    3 * remaining ** 2 * progress * first +
    3 * remaining * progress ** 2 * second +
    progress ** 3 * to
  );
}

export function cubicBezierExtrema(
  from: number,
  first: number,
  second: number,
  to: number
): readonly number[] {
  // B'(t) / 3 = a·t² + b·t + c.
  const a = -from + 3 * first - 3 * second + to;
  const b = 2 * (from - 2 * first + second);
  const c = first - from;
  const scale = Math.max(1, Math.abs(a), Math.abs(b), Math.abs(c));
  const epsilon = Number.EPSILON * scale * 16;
  const roots: number[] = [];
  const include = (value: number) => {
    if (value > 0 && value < 1 && Number.isFinite(value)) roots.push(value);
  };

  if (Math.abs(a) <= epsilon) {
    if (Math.abs(b) > epsilon) include(-c / b);
    return roots;
  }
  const discriminant = b * b - 4 * a * c;
  if (discriminant < -epsilon) return roots;
  const root = Math.sqrt(Math.max(0, discriminant));
  include((-b - root) / (2 * a));
  include((-b + root) / (2 * a));
  return roots;
}
