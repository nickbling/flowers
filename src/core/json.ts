export type JsonPrimitive = boolean | number | string | null;

export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | Readonly<{ [key: string]: JsonValue }>;

export type DeepReadonly<T> = T extends JsonPrimitive
  ? T
  : T extends readonly unknown[]
    ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

export function assertJsonValue(
  value: unknown,
  path = "$",
  seen = new Set()
): asserts value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return;
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new TypeError(`${path} must contain only finite numbers`);
    return;
  }
  if (!value || typeof value !== "object")
    throw new TypeError(`${path} must be JSON-safe`);
  if (seen.has(value)) throw new TypeError(`${path} must not contain cycles`);
  seen.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index))
        throw new TypeError(
          `${path}[${index}] must not be a sparse array hole`
        );
      const child = value[index];
      assertJsonValue(child, `${path}[${index}]`, seen);
    }
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null)
      throw new TypeError(`${path} must contain only plain objects`);
    for (const [key, child] of Object.entries(value))
      assertJsonValue(child, `${path}.${key}`, seen);
  }
  seen.delete(value);
}

/** Stable JSON for fingerprints and persisted authoring fixtures. */
export function canonicalJson(value: unknown): string {
  assertJsonValue(value);
  const encode = (child: JsonValue): string => {
    if (child === null || typeof child !== "object")
      return JSON.stringify(child);
    if (Array.isArray(child)) return `[${child.map(encode).join(",")}]`;
    const record = child as Readonly<Record<string, JsonValue>>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${encode(record[key])}`)
      .join(",")}}`;
  };
  return encode(value);
}

/** Copies JSON data so public APIs never freeze an object owned by a caller. */
export function cloneJson<T extends JsonValue>(value: T): T {
  assertJsonValue(value);
  const clone = (child: JsonValue): JsonValue => {
    if (child === null || typeof child !== "object")
      return typeof child === "number" && Object.is(child, -0) ? 0 : child;
    if (Array.isArray(child)) return child.map(clone);
    return Object.fromEntries(
      Object.entries(child).map(([key, nested]) => [key, clone(nested)])
    );
  };
  return clone(value) as T;
}

/** Stable compact label for JSON identity; not a cryptographic checksum. */
export function jsonFingerprint(value: unknown): string {
  const source = canonicalJson(value);
  let hash = 14_695_981_039_346_656_037n;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= BigInt(source.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 1_099_511_628_211n);
  }
  return hash.toString(36);
}

export function deepFreeze<T>(value: T): T {
  const seen = new WeakSet<object>();
  const freeze = (child: unknown): void => {
    if (!child || typeof child !== "object" || seen.has(child)) return;
    seen.add(child);
    for (const nested of Object.values(child)) freeze(nested);
    if (!Object.isFrozen(child)) Object.freeze(child);
  };
  freeze(value);
  return value;
}
