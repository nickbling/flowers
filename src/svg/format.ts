export function number(value: number): string {
  const rounded = Number(value.toPrecision(3));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

export function preciseNumber(value: number): string {
  const rounded = Number(value.toPrecision(6));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

export function instanceNumber(value: number): string {
  const rounded = Number(value.toPrecision(4));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

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
