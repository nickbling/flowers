import type { PlumeriaCultivar } from "@/src/plumeria/cultivar";

export const plumeriaCultivarNames = [
  "celadine",
  "gold",
  "sunset",
  "rainbow",
  "pink pearl",
  "candy stripe",
  "fuchsia",
  "carmine",
] as const;

export type PlumeriaCultivarName = (typeof plumeriaCultivarNames)[number];
export type PlumeriaVariantId = `@nbot/flowers:plumeria/${string}`;

export type PlumeriaCultivarVariant = Readonly<{
  id: PlumeriaVariantId;
  kind: "cultivar";
  name: PlumeriaCultivarName;
  parents: readonly [PlumeriaCultivarName];
}>;

export type PlumeriaHybridVariant = Readonly<{
  id: PlumeriaVariantId;
  kind: "hybrid";
  name: string;
  parents: readonly [PlumeriaCultivarName, PlumeriaCultivarName];
}>;

export type PlumeriaVariant = PlumeriaCultivarVariant | PlumeriaHybridVariant;

export type PlumeriaSelection =
  | Readonly<{ cultivar?: PlumeriaCultivar; variant?: never }>
  | Readonly<{ cultivar?: never; variant?: PlumeriaVariant }>;

function idPart(value: string): string {
  return value.replaceAll(" ", "-");
}

function defineCultivarVariant(
  name: PlumeriaCultivarName
): PlumeriaCultivarVariant {
  return Object.freeze({
    id: `@nbot/flowers:plumeria/${idPart(name)}`,
    kind: "cultivar",
    name,
    parents: Object.freeze([name] as const),
  });
}

function defineHybridVariant(
  dominant: PlumeriaCultivarName,
  secondary: PlumeriaCultivarName
): PlumeriaHybridVariant {
  return Object.freeze({
    id: `@nbot/flowers:plumeria/${idPart(dominant)}-x-${idPart(secondary)}`,
    kind: "hybrid",
    name: `${dominant} × ${secondary}`,
    parents: Object.freeze([dominant, secondary] as const),
  });
}

export const plumeriaVariants: readonly PlumeriaVariant[] = Object.freeze([
  ...plumeriaCultivarNames.map(defineCultivarVariant),
  ...plumeriaCultivarNames.flatMap((dominant) =>
    plumeriaCultivarNames
      .filter((secondary) => secondary !== dominant)
      .map((secondary) => defineHybridVariant(dominant, secondary))
  ),
]);

const VARIANTS_BY_ID = new Map(
  plumeriaVariants.map((variant) => [variant.id, variant])
);

export function getPlumeriaVariant(id: string): PlumeriaVariant {
  const variant = VARIANTS_BY_ID.get(id as PlumeriaVariantId);
  if (!variant) throw new TypeError(`unsupported plumeria variant ${id}`);
  return variant;
}

export function resolvePlumeriaVariant(
  variant: PlumeriaVariant
): PlumeriaVariant {
  return getPlumeriaVariant(variant.id);
}
