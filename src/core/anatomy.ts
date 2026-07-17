import { measureFlowerBounds } from "@/src/core/bounds";
import { cloneJson, deepFreeze, type JsonValue } from "@/src/core/json";
import type {
  EllipsoidGeometry,
  FlowerBounds,
  FlowerModel,
  IndexedMeshGeometry,
  LaminaGeometry,
  LaminaSection,
  Matrix4,
  Organ,
  OrganAppearance,
  OrganGeometry,
  OrganGroup,
  OrganInstances,
  OrganNode,
  Point2,
  Point3,
  SweepGeometry,
  Tissue,
} from "@/src/core/model";
import type { Pigment } from "@/src/core/pigment";
import { findSweepCusp } from "@/src/core/sweep";
import {
  IDENTITY_TRANSFORM,
  type PhyllotaxisTransformOptions,
  phyllotaxisTransforms,
  type RadialTransformOptions,
  radialTransforms,
} from "@/src/core/transform";

export type TissueOptions = Readonly<{
  softness?: number;
  thickness?: number;
  translucency?: number;
}>;

function immutableCopy<T>(value: T): T {
  return deepFreeze(cloneJson(value as unknown as JsonValue)) as T;
}

function unit(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1)
    throw new RangeError(`${name} must be from 0 to 1`);
  return value;
}

function tissue(type: Tissue["type"], defaults: Required<TissueOptions>) {
  return (options: TissueOptions = {}): Tissue =>
    Object.freeze({
      softness: unit(options.softness ?? defaults.softness, "softness"),
      thickness: unit(options.thickness ?? defaults.thickness, "thickness"),
      translucency: unit(
        options.translucency ?? defaults.translucency,
        "translucency"
      ),
      type,
    });
}

export const tissues = Object.freeze({
  anther: tissue("anther", {
    softness: 0.35,
    thickness: 0.65,
    translucency: 0.05,
  }),
  filament: tissue("filament", {
    softness: 0.55,
    thickness: 0.2,
    translucency: 0.12,
  }),
  leaf: tissue("leaf", { softness: 0.45, thickness: 0.35, translucency: 0.08 }),
  petal: tissue("petal", {
    softness: 0.85,
    thickness: 0.18,
    translucency: 0.42,
  }),
  pollen: tissue("pollen", {
    softness: 0.25,
    thickness: 0.55,
    translucency: 0.02,
  }),
  sepal: tissue("sepal", { softness: 0.5, thickness: 0.38, translucency: 0.1 }),
  stigma: tissue("stigma", {
    softness: 0.45,
    thickness: 0.5,
    translucency: 0.08,
  }),
  custom(type: string, options: TissueOptions = {}): Tissue {
    if (!type.trim()) throw new TypeError("tissue type must not be empty");
    return tissue(type, {
      softness: 0.5,
      thickness: 0.5,
      translucency: 0.1,
    })(options);
  },
});

export type LaminaOptions = Readonly<{
  bend?: number;
  crown?: number;
  edgeCurl?: number;
  id: string;
  leftScale?: number;
  length: number;
  profile?: "elliptic" | "lanceolate" | "obovate" | "strap";
  rightScale?: number;
  ruffle?: Readonly<{
    amplitude: number;
    phase?: number;
    waves: number;
  }>;
  samples?: number;
  shoulder?: number;
  thickness?: number;
  tip?: "pointed" | "round" | "soft-point";
  twist?: number;
  /** Maximum full width, edge to edge. */
  width: number;
}>;

function positive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0)
    throw new RangeError(`${name} must be finite and positive`);
  return value;
}

function identifier(value: string, name: string): string {
  if (!value.trim()) throw new TypeError(`${name} must not be empty`);
  return value;
}

function oneOf<const Value extends string>(
  value: string,
  allowed: readonly Value[],
  name: string
): Value {
  if (!allowed.includes(value as Value))
    throw new TypeError(`${name} must be ${allowed.join(", ")}`);
  return value as Value;
}

function finitePoint(
  point: readonly number[],
  dimensions: number,
  name: string
): void {
  if (
    point.length !== dimensions ||
    point.some((value) => !Number.isFinite(value))
  )
    throw new TypeError(`${name} must contain ${dimensions} finite numbers`);
}

function lamina({
  bend = 0,
  crown = 0.06,
  edgeCurl = 0,
  id,
  leftScale = 1,
  length,
  profile = "elliptic",
  rightScale = 1,
  ruffle,
  samples = 24,
  shoulder,
  thickness = 0.025,
  tip = "round",
  twist = 0,
  width,
}: LaminaOptions): LaminaGeometry {
  identifier(id, "lamina id");
  positive(length, "lamina length");
  positive(width, "lamina width");
  positive(thickness, "lamina thickness");
  positive(leftScale, "lamina left scale");
  positive(rightScale, "lamina right scale");
  oneOf(
    profile,
    ["elliptic", "lanceolate", "obovate", "strap"],
    "lamina profile"
  );
  oneOf(tip, ["pointed", "round", "soft-point"], "lamina tip");
  for (const [name, value] of Object.entries({
    bend,
    crown,
    edgeCurl,
    twist,
  }))
    if (!Number.isFinite(value))
      throw new TypeError(`lamina ${name} must be finite`);
  if (!Number.isSafeInteger(samples) || samples < 8 || samples > 256)
    throw new RangeError("lamina samples must be an integer from 8 to 256");
  const profileShoulder =
    shoulder ??
    ({ elliptic: 0.5, lanceolate: 0.42, obovate: 0.68, strap: 0.55 } as const)[
      profile
    ];
  if (!(profileShoulder > 0 && profileShoulder < 1))
    throw new RangeError("lamina shoulder must be between 0 and 1");
  if (ruffle) {
    if (
      !Number.isFinite(ruffle.amplitude) ||
      ruffle.amplitude < 0 ||
      ruffle.amplitude > 0.3
    )
      throw new RangeError("lamina ruffle amplitude must be from 0 to 0.3");
    if (
      !Number.isFinite(ruffle.waves) ||
      ruffle.waves <= 0 ||
      ruffle.waves > 20
    )
      throw new RangeError("lamina ruffle waves must be from 0 to 20");
    if (ruffle.phase !== undefined && !Number.isFinite(ruffle.phase))
      throw new TypeError("lamina ruffle phase must be finite");
  }

  const widthAt = (t: number) => {
    const rising = Math.min(1, t / profileShoulder);
    const falling = Math.min(1, (1 - t) / (1 - profileShoulder));
    const risePower =
      profile === "strap" ? 0.35 : profile === "lanceolate" ? 0.8 : 0.58;
    const fallPower =
      tip === "pointed"
        ? 1.15
        : tip === "soft-point"
          ? 0.78
          : profile === "strap"
            ? 0.38
            : 0.5;
    const body = Math.max(
      0,
      Math.min(rising ** risePower, falling ** fallPower)
    );
    const ripple = ruffle
      ? 1 +
        ruffle.amplitude *
          Math.sin(2 * Math.PI * ruffle.waves * t + (ruffle.phase ?? 0)) *
          Math.sin(Math.PI * t)
      : 1;
    return body * ripple;
  };
  const point = (t: number, side: 1 | -1): Point2 => [
    bend * length * t * t +
      side * (width / 2) * widthAt(t) * (side === -1 ? leftScale : rightScale),
    length * t,
  ];
  const progression = Array.from(
    { length: samples + 1 },
    (_, index) => (1 - Math.cos((Math.PI * index) / samples)) / 2
  );
  const outline = [
    ...progression.map((t) => point(t, 1)),
    ...progression
      .slice(1, -1)
      .reverse()
      .map((t) => point(t, -1)),
  ];
  const sections = progression.map((t): LaminaSection => {
    const center: Point3 = [
      bend * length * t * t,
      length * t,
      crown * length * Math.sin(Math.PI * t),
    ];
    const [rightX, rightY] = point(t, 1);
    const [leftX, leftY] = point(t, -1);
    const edgeEnvelope = Math.sin(Math.PI * t);
    return {
      center,
      left: [
        leftX,
        leftY,
        edgeCurl * length * edgeEnvelope ** 2 - twist * length * edgeEnvelope,
      ],
      right: [
        rightX,
        rightY,
        edgeCurl * length * edgeEnvelope ** 2 + twist * length * edgeEnvelope,
      ],
      thickness: thickness * Math.max(0.08, Math.sin(Math.PI * t) ** 0.45),
    };
  });
  const midrib2 = progression.map(
    (t): Point2 => [bend * length * t * t, length * t]
  );
  return immutableCopy({
    features: { midrib: midrib2 },
    id,
    kind: "lamina",
    outline,
    sections,
  });
}

export type SweepOptions = Readonly<{
  id: string;
  path: readonly Point3[];
  radius: number | readonly number[];
}>;

function sweep(definition: SweepOptions): SweepGeometry {
  identifier(definition.id, "sweep id");
  if (definition.path.length < 2)
    throw new RangeError("sweep path needs at least two points");
  definition.path.forEach((point, index) => {
    finitePoint(point, 3, `sweep path ${index}`);
    if (index > 0) {
      const previous = definition.path[index - 1];
      if (
        Math.hypot(
          point[0] - previous[0],
          point[1] - previous[1],
          point[2] - previous[2]
        ) < 1e-10
      )
        throw new RangeError(
          `sweep path ${index} must differ from the preceding point`
        );
    }
  });
  const cusp = findSweepCusp(definition.path);
  if (cusp)
    throw new RangeError(
      `sweep path has an undefined tangent at progress ${cusp.progress}; round exact reversals with another control point`
    );
  const radius =
    typeof definition.radius === "number"
      ? definition.path.map(() =>
          positive(definition.radius as number, "sweep radius")
        )
      : [...definition.radius];
  if (radius.length !== definition.path.length)
    throw new RangeError("sweep radius must match path length");
  radius.forEach((value) => {
    positive(value, "sweep radius");
  });
  return immutableCopy({
    id: definition.id,
    kind: "sweep",
    path: [...definition.path],
    radius,
  });
}

export type EllipsoidOptions = Readonly<{
  id: string;
  radii: Point3;
}>;

function ellipsoid(definition: EllipsoidOptions): EllipsoidGeometry {
  identifier(definition.id, "ellipsoid id");
  finitePoint(definition.radii, 3, "ellipsoid radii");
  definition.radii.forEach((value) => {
    positive(value, "ellipsoid radius");
  });
  return immutableCopy({
    id: definition.id,
    kind: "ellipsoid",
    radii: definition.radii,
  });
}

export type MeshOptions = Omit<IndexedMeshGeometry, "kind">;

function mesh(definition: MeshOptions): IndexedMeshGeometry {
  identifier(definition.id, "mesh id");
  if (definition.positions.length < 3 || definition.indices.length < 3)
    throw new RangeError("mesh needs positions and at least one triangle");
  if (definition.indices.length % 3 !== 0)
    throw new RangeError("mesh indices must form triangles");
  definition.positions.forEach((point, index) => {
    finitePoint(point, 3, `mesh position ${index}`);
  });
  if (
    definition.indices.some(
      (index) =>
        !Number.isSafeInteger(index) ||
        index < 0 ||
        index >= definition.positions.length
    )
  )
    throw new RangeError("mesh indices must reference existing positions");
  for (let index = 0; index < definition.indices.length; index += 3) {
    const a = definition.positions[definition.indices[index]];
    const b = definition.positions[definition.indices[index + 1]];
    const c = definition.positions[definition.indices[index + 2]];
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    const scale = Math.hypot(...ab) * Math.hypot(...ac);
    if (scale === 0 || Math.hypot(...cross) <= scale * 1e-12)
      throw new RangeError(`mesh triangle ${index / 3} must not be degenerate`);
  }
  if (
    definition.surfaceCoordinates &&
    definition.surfaceCoordinates.length !== definition.positions.length
  )
    throw new RangeError("mesh surface coordinates must match positions");
  definition.surfaceCoordinates?.forEach((point, index) => {
    finitePoint(point, 2, `mesh surface coordinate ${index}`);
    if (point.some((value) => value < 0 || value > 1))
      throw new RangeError(
        `mesh surface coordinate ${index} must be from 0 to 1`
      );
  });
  const { surfaceCoordinates, ...required } = definition;
  return immutableCopy({
    ...required,
    ...(surfaceCoordinates === undefined ? {} : { surfaceCoordinates }),
    kind: "mesh",
  });
}

export type AppearanceOptions = Readonly<{
  id: string;
  pigment: Pigment;
  tissue: Tissue;
}>;

export type AppearanceReference = string | OrganAppearance;
export type GeometryReference = string | OrganGeometry;

function appearance(definition: AppearanceOptions): OrganAppearance {
  identifier(definition.id, "appearance id");
  return immutableCopy(definition);
}

/** One reusable organ form with renderer-neutral geometry and appearance. */
export type FlowerPart = Readonly<{
  appearance: OrganAppearance;
  geometry: OrganGeometry;
  id: string;
}>;

type PaintedPartOptions = Readonly<{
  appearance?: never;
  geometry: OrganGeometry;
  id?: string;
  pigment: Pigment;
  tissue: Tissue;
}>;

type SharedAppearancePartOptions = Readonly<{
  appearance: OrganAppearance;
  geometry: OrganGeometry;
  id?: string;
  pigment?: never;
  tissue?: never;
}>;

/** Paint a geometry directly or reuse an existing appearance across forms. */
export type PartOptions = PaintedPartOptions | SharedAppearancePartOptions;

function part(definition: PartOptions): FlowerPart {
  const id = identifier(definition.id ?? definition.geometry.id, "part id");
  return Object.freeze({
    appearance:
      definition.appearance ??
      appearance({
        id,
        pigment: definition.pigment,
        tissue: definition.tissue,
      }),
    geometry: definition.geometry,
    id,
  });
}

type PartPlacement = Readonly<{
  appearance?: never;
  geometry?: never;
  part: FlowerPart;
}>;

type ResourcePlacement = Readonly<{
  appearance: AppearanceReference;
  geometry: GeometryReference;
  part?: never;
}>;

export type OrganOptions = Readonly<{
  id: string;
  semantic: string;
  transform?: Matrix4;
}> &
  (PartPlacement | ResourcePlacement);

function reference(
  value: AppearanceReference | GeometryReference,
  name: string
): string {
  return identifier(typeof value === "string" ? value : value.id, name);
}

function organ(definition: OrganOptions): Organ {
  identifier(definition.id, "organ id");
  identifier(definition.semantic, "organ semantic");
  const resources =
    definition.part === undefined
      ? {
          appearance: reference(definition.appearance, "organ appearance"),
          geometry: reference(definition.geometry, "organ geometry"),
        }
      : {
          appearance: definition.part.appearance.id,
          geometry: definition.part.geometry.id,
        };
  return immutableCopy({
    ...resources,
    id: definition.id,
    kind: "organ",
    semantic: definition.semantic,
    transform: definition.transform ?? IDENTITY_TRANSFORM,
  });
}

export type InstanceOptions = Readonly<{
  id: string;
  semantic: string;
}> &
  (PartPlacement | ResourcePlacement);

function instances(
  definition: InstanceOptions,
  transforms: readonly Matrix4[]
): OrganInstances {
  if (transforms.length === 0)
    throw new RangeError("instances need at least one transform");
  return immutableCopy({
    id: definition.id,
    kind: "instances",
    template: organ({ ...definition, id: `${definition.id}.template` }),
    transforms: [...transforms],
  });
}

function radial(
  definition: InstanceOptions & RadialTransformOptions
): OrganInstances {
  const { count, radius, startAngle, tilt, z, ...organDefinition } = definition;
  return instances(
    organDefinition,
    radialTransforms({ count, radius, startAngle, tilt, z })
  );
}

function phyllotaxis(
  definition: InstanceOptions & PhyllotaxisTransformOptions
): OrganInstances {
  const {
    count,
    radius,
    innerRadius,
    startAngle,
    divergence,
    dome,
    ...organDefinition
  } = definition;
  return instances(
    organDefinition,
    phyllotaxisTransforms({
      count,
      radius,
      innerRadius,
      startAngle,
      divergence,
      dome,
    })
  );
}

export type GroupOptions = Readonly<{
  children: readonly OrganNode[];
  id: string;
  transform?: Matrix4;
}>;

function group(definition: GroupOptions): OrganGroup {
  identifier(definition.id, "group id");
  if (definition.children.length === 0)
    throw new RangeError("group needs at least one child");
  return immutableCopy({
    children: [...definition.children],
    id: definition.id,
    kind: "group",
    transform: definition.transform ?? IDENTITY_TRANSFORM,
  });
}

function recordById<T extends { readonly id: string }>(
  values: readonly T[],
  name: string
): Readonly<Record<string, T>> {
  const entries = new Map<string, T>();
  for (const value of values) {
    if (!value.id.trim()) throw new TypeError(`${name} id must not be empty`);
    if (entries.has(value.id))
      throw new Error(`duplicate ${name} id ${value.id}`);
    entries.set(value.id, value);
  }
  return Object.freeze(Object.fromEntries(entries));
}

function resourcesFromParts(parts: readonly FlowerPart[]): Readonly<{
  appearances: Readonly<Record<string, OrganAppearance>>;
  geometries: Readonly<Record<string, OrganGeometry>>;
}> {
  const ids = new Set<string>();
  const appearances = new Map<string, OrganAppearance>();
  const geometries = new Map<string, OrganGeometry>();
  for (const value of parts) {
    if (ids.has(value.id)) throw new Error(`duplicate part id ${value.id}`);
    ids.add(value.id);
    const currentAppearance = appearances.get(value.appearance.id);
    if (currentAppearance && currentAppearance !== value.appearance)
      throw new Error(`conflicting appearance id ${value.appearance.id}`);
    appearances.set(value.appearance.id, value.appearance);
    const current = geometries.get(value.geometry.id);
    if (current && current !== value.geometry)
      throw new Error(`conflicting geometry id ${value.geometry.id}`);
    geometries.set(value.geometry.id, value.geometry);
  }
  return Object.freeze({
    appearances: Object.freeze(Object.fromEntries(appearances)),
    geometries: Object.freeze(Object.fromEntries(geometries)),
  });
}

export type AnatomyKit = ReturnType<typeof createAnatomyKit>;

type FlowerFrameOptions = Readonly<{
  bounds?: FlowerBounds;
  keyLight?: Point3;
  roots: readonly OrganNode[];
}>;

type PartFlowerOptions = Readonly<{
  appearances?: never;
  geometries?: never;
  parts: readonly FlowerPart[];
}>;

type ResourceFlowerOptions = Readonly<{
  appearances: readonly OrganAppearance[];
  geometries: readonly OrganGeometry[];
  parts?: never;
}>;

/** Resources and root organs compiled into one renderer-neutral model. */
export type FlowerOptions = FlowerFrameOptions &
  (PartFlowerOptions | ResourceFlowerOptions);

function expandDegenerateBounds(bounds: FlowerBounds): FlowerBounds {
  const minimum = [...bounds.minimum] as [number, number, number];
  const maximum = [...bounds.maximum] as [number, number, number];
  const scale = Math.max(
    ...maximum.map((value, axis) => value - minimum[axis])
  );
  for (let axis = 0; axis < 3; axis += 1) {
    if (minimum[axis] !== maximum[axis]) continue;
    const value = minimum[axis];
    const padding = Math.max(
      scale * 1e-6,
      Math.abs(value) * Number.EPSILON * 8,
      Number.MIN_VALUE
    );
    const lower = value - padding;
    const upper = value + padding;
    if (Number.isFinite(lower) && lower < value) minimum[axis] = lower;
    if (Number.isFinite(upper) && upper > value) maximum[axis] = upper;
  }
  return { maximum, minimum };
}

export function createAnatomyKit(genomeId: string) {
  identifier(genomeId, "genome id");
  return Object.freeze({
    appearance,
    ellipsoid,
    flower(definition: FlowerOptions): FlowerModel {
      const resources =
        definition.parts === undefined
          ? {
              appearances: recordById(definition.appearances, "appearance"),
              geometries: recordById(definition.geometries, "geometry"),
            }
          : resourcesFromParts(definition.parts);
      if (
        Object.keys(resources.appearances).length === 0 ||
        Object.keys(resources.geometries).length === 0 ||
        definition.roots.length === 0
      )
        throw new RangeError(
          "flower needs appearances, geometries and root organs"
        );
      const { appearances, geometries } = resources;
      let bounds = definition.bounds;
      if (!bounds) {
        const measured = measureFlowerBounds(geometries, definition.roots);
        if (!measured)
          throw new Error(
            "flower bounds cannot be measured from its root organs"
          );
        bounds = expandDegenerateBounds(measured);
      }
      finitePoint(bounds.minimum, 3, "flower minimum bound");
      finitePoint(bounds.maximum, 3, "flower maximum bound");
      for (let axis = 0; axis < 3; axis += 1)
        if (!(bounds.minimum[axis] < bounds.maximum[axis]))
          throw new RangeError(
            "flower minimum bounds must be below maximum bounds"
          );
      const keyLight = definition.keyLight ?? [-1, 1, 1];
      finitePoint(keyLight, 3, "key light");
      if (Math.hypot(...keyLight) === 0)
        throw new RangeError("key light must have a direction");
      return immutableCopy({
        appearances,
        format: "@nbot/flower-model" as const,
        formatVersion: 1 as const,
        genomeId,
        geometries,
        portrait: {
          bounds,
          keyLight,
        },
        roots: [...definition.roots],
      });
    },
    group,
    instances,
    lamina,
    mesh,
    organ,
    part,
    phyllotaxis,
    radial,
    sweep,
    tissues,
  });
}
