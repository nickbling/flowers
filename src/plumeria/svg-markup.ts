const PAINT_PROPERTIES = [
  "clip-path",
  "fill",
  "fill-opacity",
  "filter",
  "mask",
  "opacity",
  "stop-color",
  "stop-opacity",
  "stroke",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-opacity",
  "stroke-width",
] as const;

const PAINTABLE_ELEMENTS = new Set([
  "circle",
  "ellipse",
  "line",
  "path",
  "polygon",
  "polyline",
  "rect",
  "use",
]);

export const escapeXml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "'": "&apos;",
        '"': "&quot;",
        "<": "&lt;",
        ">": "&gt;",
      })[character] ?? character
  );

export const fmt = (value: number): number => Math.round(value * 100) / 100;

export const stop = (offset: number, color: string, opacity?: number): string =>
  `<stop offset="${fmt(offset)}" stop-color="${color}"${opacity === undefined ? "" : ` stop-opacity="${fmt(opacity)}"`}/>`;

// Inline paint wins over ordinary host CSS when SVGs are embedded in a page.
export const protectPaint = (markup: string): string =>
  markup.replace(
    /<([a-zA-Z][\w:-]*)(\s[^<>]*?)?(\/?)>/g,
    (tag, rawName: string, rawAttributes = "", close: string) => {
      const name = rawName.toLowerCase();
      const styleMatch = rawAttributes.match(/\sstyle="([^"]*)"/);
      const current = styleMatch?.[1] ?? "";
      const declarations = current
        .split(";")
        .map((part: string) => part.trim())
        .filter(Boolean);
      const defined = new Set(
        declarations.map((part: string) => part.slice(0, part.indexOf(":")))
      );
      let attributesWithoutPaint = rawAttributes;

      for (const property of PAINT_PROPERTIES) {
        const pattern = new RegExp(`\\s${property}="([^"]*)"`);
        const match = attributesWithoutPaint.match(pattern);
        if (match && !defined.has(property)) {
          declarations.push(`${property}:${match[1]}`);
          defined.add(property);
        }
        if (match)
          attributesWithoutPaint = attributesWithoutPaint.replace(pattern, "");
      }

      if (PAINTABLE_ELEMENTS.has(name)) {
        for (const property of ["fill", "stroke"] as const) {
          if (!defined.has(property)) declarations.push(`${property}:inherit`);
        }
      }

      if (declarations.length === 0) return tag;
      const style = declarations.join(";");
      const attributes = styleMatch
        ? attributesWithoutPaint.replace(/\sstyle="[^"]*"/, ` style="${style}"`)
        : `${attributesWithoutPaint} style="${style}"`;
      return `<${rawName}${attributes}${close}>`;
    }
  );
