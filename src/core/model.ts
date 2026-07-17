import type { Pigment } from "@/src/core/pigment";

export type Point2 = readonly [x: number, y: number];
export type Point3 = readonly [x: number, y: number, z: number];
export type Matrix4 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export type FlowerBounds = Readonly<{
  maximum: Point3;
  minimum: Point3;
}>;

export type LaminaSection = Readonly<{
  center: Point3;
  left: Point3;
  right: Point3;
  thickness: number;
}>;

export type LaminaGeometry = Readonly<{
  features: Readonly<Record<string, readonly Point2[]>>;
  id: string;
  kind: "lamina";
  outline: readonly Point2[];
  /** Ordered base-to-tip sections shared by the vector and volume adapters. */
  sections: readonly LaminaSection[];
}>;

export type SweepGeometry = Readonly<{
  id: string;
  kind: "sweep";
  path: readonly Point3[];
  radius: readonly number[];
}>;

export type EllipsoidGeometry = Readonly<{
  id: string;
  kind: "ellipsoid";
  radii: Point3;
}>;

export type IndexedMeshGeometry = Readonly<{
  id: string;
  indices: readonly number[];
  kind: "mesh";
  positions: readonly Point3[];
  surfaceCoordinates?: readonly Point2[];
}>;

export type OrganGeometry =
  | LaminaGeometry
  | SweepGeometry
  | EllipsoidGeometry
  | IndexedMeshGeometry;

export type Tissue = Readonly<{
  softness: number;
  thickness: number;
  translucency: number;
  type: string;
}>;

export type OrganAppearance = Readonly<{
  id: string;
  pigment: Pigment;
  tissue: Tissue;
}>;

export type Organ = Readonly<{
  appearance: string;
  geometry: string;
  id: string;
  kind: "organ";
  /** Botanical role, such as petal, ray-floret, corona or bract. */
  semantic: string;
  transform: Matrix4;
}>;

export type OrganGroup = Readonly<{
  children: readonly OrganNode[];
  id: string;
  kind: "group";
  transform: Matrix4;
}>;

export type OrganInstances = Readonly<{
  id: string;
  kind: "instances";
  template: Organ;
  transforms: readonly Matrix4[];
}>;

export type OrganNode = Organ | OrganGroup | OrganInstances;

export type FlowerModel = Readonly<{
  appearances: Readonly<Record<string, OrganAppearance>>;
  format: "@nbot/flower-model";
  formatVersion: 1;
  genomeId: string;
  geometries: Readonly<Record<string, OrganGeometry>>;
  portrait: Readonly<{
    bounds: FlowerBounds;
    keyLight: Point3;
  }>;
  roots: readonly OrganNode[];
}>;
