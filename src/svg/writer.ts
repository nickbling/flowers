export type SvgAttribute = boolean | number | string | undefined;

export type SvgNode = Readonly<{
  attributes?: Readonly<Record<string, SvgAttribute>>;
  children?: readonly (string | SvgNode)[];
  name: string;
}>;

function compareNames(
  [left]: readonly [string, unknown],
  [right]: readonly [string, unknown]
) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function svgNode(
  name: string,
  attributes?: Readonly<Record<string, SvgAttribute>>,
  children?: readonly (string | SvgNode)[]
): SvgNode {
  if (!/^[a-z][a-zA-Z0-9:-]*$/.test(name))
    throw new TypeError("invalid SVG element name");
  return Object.freeze({ attributes, children, name });
}

export function svgStyle(
  declarations: Readonly<Record<string, number | string | undefined>>
): string {
  return Object.entries(declarations)
    .filter(
      (entry): entry is [string, number | string] => entry[1] !== undefined
    )
    .sort(compareNames)
    .map(([property, value]) => `${property}:${value}`)
    .join(";");
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;")
    .replaceAll(">", "&gt;");
}

export function serializeSvg(node: SvgNode): string {
  const attributes = Object.entries(node.attributes ?? {})
    .filter(
      (entry): entry is [string, boolean | number | string] =>
        entry[1] !== undefined && entry[1] !== false
    )
    .sort(compareNames)
    .map(([name, value]) =>
      value === true ? name : `${name}="${escapeXml(String(value))}"`
    )
    .join(" ");
  const open = attributes ? `<${node.name} ${attributes}` : `<${node.name}`;
  if (!node.children?.length) return `${open}/>`;
  const children = node.children
    .map((child) =>
      typeof child === "string" ? escapeXml(child) : serializeSvg(child)
    )
    .join("");
  return `${open}>${children}</${node.name}>`;
}
