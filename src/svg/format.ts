function significantNumber(value: number, precision: number): string {
  const rounded = Number(value.toPrecision(precision));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

export const number = (value: number) => significantNumber(value, 3);
export const preciseNumber = (value: number) => significantNumber(value, 6);
export const instanceNumber = (value: number) => significantNumber(value, 4);

export function spatialNumber(value: number, span: number): string {
  const tolerance = Math.max(
    Math.abs(span) * 1e-6,
    Number.EPSILON * Math.max(1, Math.abs(value)) * 8
  );
  const decimalPlaces = Math.min(
    15,
    Math.max(0, Math.ceil(-Math.log10(tolerance)))
  );
  const rounded = Number(value.toFixed(decimalPlaces));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}
