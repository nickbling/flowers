import { measureFlowerBounds } from "@/src/core/bounds";
import { flowerGenomeIdentity } from "@/src/core/genome";
import { assertJsonValue, jsonFingerprint } from "@/src/core/json";
import type {
  FlowerModel,
  Matrix4,
  Organ,
  OrganGeometry,
  OrganNode,
  Point2,
  Point3,
} from "@/src/core/model";
import {
  type Pigment,
  pigmentFeatures,
  type ScalarField,
  type Tone,
} from "@/src/core/pigment";
import type { FlowerSpecimen } from "@/src/core/species";
import { findSweepCusp } from "@/src/core/sweep";

export type AuditIssue = Readonly<{
  code: string;
  message: string;
  path: string;
}>;

const cache = new WeakMap<object, readonly AuditIssue[]>();

function deeplyFrozen(value: unknown, seen = new WeakSet<object>()): boolean {
  if (!value || typeof value !== "object" || seen.has(value)) return true;
  seen.add(value);
  return (
    Object.isFrozen(value) &&
    Object.values(value).every((child) => deeplyFrozen(child, seen))
  );
}

function report(
  issues: AuditIssue[],
  code: string,
  path: string,
  message: string
): void {
  issues.push({ code, message, path });
}

function finite(
  value: unknown,
  path: string,
  issues: AuditIssue[],
  seen = new WeakSet<object>()
): void {
  if (typeof value === "number" && !Number.isFinite(value)) {
    report(issues, "non-finite", path, "value must be finite");
    return;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) return;
    seen.add(value);
    value.forEach((child, index) => {
      finite(child, `${path}[${index}]`, issues, seen);
    });
    return;
  }
  if (value && typeof value === "object") {
    if (seen.has(value)) return;
    seen.add(value);
    for (const [key, child] of Object.entries(value))
      finite(child, `${path}.${key}`, issues, seen);
  }
}

function vectorLength(point: Point3): number {
  return Math.hypot(...point);
}

function auditVector(
  value: readonly number[],
  dimensions: number,
  path: string,
  issues: AuditIssue[]
): void {
  if (value.length !== dimensions)
    report(
      issues,
      "vector-size",
      path,
      `vector must have ${dimensions} components`
    );
  value.forEach((component, index) => {
    if (typeof component !== "number" || !Number.isFinite(component))
      report(
        issues,
        "vector-component",
        `${path}[${index}]`,
        "vector components must be finite numbers"
      );
  });
}

function auditTransform(
  transform: Matrix4,
  path: string,
  issues: AuditIssue[]
): void {
  const values = transform as readonly number[];
  if (values.length !== 16) {
    report(issues, "transform-size", path, "transform must contain 16 values");
    return;
  }
  let invalid = false;
  values.forEach((value, index) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      invalid = true;
      report(
        issues,
        "transform-component",
        `${path}[${index}]`,
        "transform components must be finite numbers"
      );
    }
  });
  if (invalid) return;
  if (
    Math.abs(values[3]) > 1e-9 ||
    Math.abs(values[7]) > 1e-9 ||
    Math.abs(values[11]) > 1e-9 ||
    Math.abs(values[15] - 1) > 1e-9
  )
    report(
      issues,
      "transform-affine",
      path,
      "organ transforms must be affine matrices"
    );
  const scaleX = Math.hypot(values[0], values[1], values[2]);
  const scaleY = Math.hypot(values[4], values[5], values[6]);
  const scaleZ = Math.hypot(values[8], values[9], values[10]);
  const normalizedDeterminant =
    scaleX === 0 || scaleY === 0 || scaleZ === 0
      ? 0
      : (values[0] / scaleX) *
          ((values[5] / scaleY) * (values[10] / scaleZ) -
            (values[9] / scaleZ) * (values[6] / scaleY)) -
        (values[4] / scaleY) *
          ((values[1] / scaleX) * (values[10] / scaleZ) -
            (values[9] / scaleZ) * (values[2] / scaleX)) +
        (values[8] / scaleZ) *
          ((values[1] / scaleX) * (values[6] / scaleY) -
            (values[5] / scaleY) * (values[2] / scaleX));
  if (Math.abs(normalizedDeterminant) < 1e-10)
    report(
      issues,
      "transform-degenerate",
      path,
      "transform must preserve a non-zero volume"
    );
}

function outlineArea(points: readonly Point2[]): number {
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    twiceArea += current[0] * next[1] - next[0] * current[1];
  }
  return twiceArea / 2;
}

function auditGeometry(
  geometry: OrganGeometry,
  path: string,
  issues: AuditIssue[]
): void {
  if (!geometry.id.trim())
    report(issues, "empty-id", `${path}.id`, "geometry id must not be empty");
  if (geometry.kind === "lamina") {
    if (geometry.outline.length < 3)
      report(
        issues,
        "lamina-outline",
        `${path}.outline`,
        "lamina outline needs at least three points"
      );
    else if (Math.abs(outlineArea(geometry.outline)) < 1e-10)
      report(
        issues,
        "lamina-degenerate",
        `${path}.outline`,
        "lamina outline must enclose an area"
      );
    if (geometry.sections.length < 2)
      report(
        issues,
        "lamina-midrib",
        `${path}.sections`,
        "lamina needs at least two base-to-tip sections"
      );
    if (geometry.sections.some((section) => !(section.thickness > 0)))
      report(
        issues,
        "non-positive-thickness",
        `${path}.sections`,
        "lamina thickness must stay positive"
      );
    for (const [name, points] of Object.entries(geometry.features))
      if (!name.trim() || points.length < 2)
        report(
          issues,
          "lamina-feature",
          `${path}.features.${name}`,
          "lamina features need a name and at least two points"
        );
    return;
  }
  if (geometry.kind === "sweep") {
    if (geometry.path.length < 2)
      report(
        issues,
        "sweep-path",
        `${path}.path`,
        "sweep path needs at least two points"
      );
    if (geometry.radius.length !== geometry.path.length)
      report(
        issues,
        "sweep-radius",
        `${path}.radius`,
        "sweep radii must match the path samples"
      );
    if (geometry.radius.some((value) => !(value > 0)))
      report(
        issues,
        "non-positive-radius",
        `${path}.radius`,
        "sweep radii must stay positive"
      );
    geometry.path.slice(1).forEach((point, index) => {
      const previous = geometry.path[index];
      if (
        Math.hypot(
          point[0] - previous[0],
          point[1] - previous[1],
          point[2] - previous[2]
        ) < 1e-10
      )
        report(
          issues,
          "sweep-segment",
          `${path}.path[${index + 1}]`,
          "consecutive sweep path points must differ"
        );
    });
    const pathLength = geometry.path.slice(1).reduce((total, point, index) => {
      const previous = geometry.path[index];
      return (
        total +
        Math.hypot(
          point[0] - previous[0],
          point[1] - previous[1],
          point[2] - previous[2]
        )
      );
    }, 0);
    if (pathLength < 1e-10)
      report(
        issues,
        "sweep-degenerate",
        `${path}.path`,
        "sweep path must have a measurable length"
      );
    const validPath =
      geometry.path.length >= 2 &&
      geometry.path.every(
        (point) =>
          point.length === 3 && point.every((value) => Number.isFinite(value))
      ) &&
      geometry.path.slice(1).every((point, index) => {
        const previous = geometry.path[index];
        return (
          Math.hypot(
            point[0] - previous[0],
            point[1] - previous[1],
            point[2] - previous[2]
          ) >= 1e-10
        );
      });
    const cusp = validPath ? findSweepCusp(geometry.path) : null;
    if (cusp)
      report(
        issues,
        "sweep-cusp",
        `${path}.path`,
        `sweep centerline has an undefined tangent at progress ${cusp.progress}; round exact reversals with another control point`
      );
    return;
  }
  if (geometry.kind === "ellipsoid") {
    auditVector(geometry.radii, 3, `${path}.radii`, issues);
    if (geometry.radii.some((value) => !(value > 0)))
      report(
        issues,
        "non-positive-radius",
        `${path}.radii`,
        "ellipsoid radii must stay positive"
      );
    return;
  }
  if (geometry.positions.length < 3 || geometry.indices.length < 3)
    report(
      issues,
      "mesh-empty",
      path,
      "mesh needs positions and at least one triangle"
    );
  if (geometry.indices.length % 3 !== 0)
    report(
      issues,
      "mesh-triangles",
      `${path}.indices`,
      "mesh indices must form triangles"
    );
  const invalidIndex = geometry.indices.some(
    (index) =>
      !Number.isSafeInteger(index) ||
      index < 0 ||
      index >= geometry.positions.length
  );
  if (invalidIndex)
    report(
      issues,
      "mesh-index",
      `${path}.indices`,
      "mesh indices must reference existing positions"
    );
  if (!invalidIndex && geometry.indices.length % 3 === 0)
    for (let index = 0; index < geometry.indices.length; index += 3) {
      const a = geometry.positions[geometry.indices[index]];
      const b = geometry.positions[geometry.indices[index + 1]];
      const c = geometry.positions[geometry.indices[index + 2]];
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const cross = [
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
      ];
      const scale = Math.hypot(...ab) * Math.hypot(...ac);
      if (scale === 0 || Math.hypot(...cross) <= scale * 1e-12)
        report(
          issues,
          "mesh-degenerate",
          `${path}.indices[${index}]`,
          "mesh triangles must enclose an area"
        );
    }
  if (
    geometry.surfaceCoordinates &&
    geometry.surfaceCoordinates.length !== geometry.positions.length
  )
    report(
      issues,
      "mesh-surface-coordinates",
      `${path}.surfaceCoordinates`,
      "surface coordinates must match mesh positions"
    );
  if (
    geometry.surfaceCoordinates?.some((point) =>
      point.some((value) => value < 0 || value > 1)
    )
  )
    report(
      issues,
      "mesh-surface-coordinate-range",
      `${path}.surfaceCoordinates`,
      "surface coordinates must be from 0 to 1"
    );
}

function auditField(
  field: ScalarField,
  path: string,
  issues: AuditIssue[]
): void {
  if (field.kind === "constant" || field.kind === "coordinate") return;
  if (field.kind === "radial-distance") return;
  if (field.kind === "feature-distance") {
    if (!field.feature.trim())
      report(
        issues,
        "empty-feature",
        `${path}.feature`,
        "feature name must not be empty"
      );
    return;
  }
  if (field.kind === "smoothstep") {
    auditField(field.edge0, `${path}.edge0`, issues);
    auditField(field.edge1, `${path}.edge1`, issues);
    auditField(field.input, `${path}.input`, issues);
    return;
  }
  if (field.kind === "curve") {
    auditField(field.input, `${path}.input`, issues);
    if (field.points.length < 2)
      report(
        issues,
        "curve-points",
        `${path}.points`,
        "curve needs at least two points"
      );
    for (let index = 1; index < field.points.length; index += 1)
      if (field.points[index][0] <= field.points[index - 1][0])
        report(
          issues,
          "curve-order",
          `${path}.points[${index}]`,
          "curve inputs must be strictly increasing"
        );
    return;
  }
  if (field.kind === "noise") {
    if (!(field.frequency > 0))
      report(
        issues,
        "noise-frequency",
        `${path}.frequency`,
        "noise frequency must be positive"
      );
    if (
      !Number.isSafeInteger(field.octaves) ||
      field.octaves < 1 ||
      field.octaves > 8
    )
      report(
        issues,
        "noise-octaves",
        `${path}.octaves`,
        "noise octaves must be an integer from 1 to 8"
      );
    if (!field.seedPath.trim())
      report(
        issues,
        "noise-path",
        `${path}.seedPath`,
        "noise seed path must not be empty"
      );
    return;
  }
  if (field.kind === "mix") {
    auditField(field.from, `${path}.from`, issues);
    auditField(field.to, `${path}.to`, issues);
    auditField(field.amount, `${path}.amount`, issues);
    return;
  }
  if (field.inputs.length === 0)
    report(
      issues,
      "field-inputs",
      `${path}.inputs`,
      `${field.kind} needs at least one input`
    );
  field.inputs.forEach((input, index) => {
    auditField(input, `${path}.inputs[${index}]`, issues);
  });
}

function auditTone(tone: Tone, path: string, issues: AuditIssue[]): void {
  auditField(tone.lightness, `${path}.lightness`, issues);
  auditField(tone.chroma, `${path}.chroma`, issues);
  auditField(tone.hue, `${path}.hue`, issues);
}

function auditPigment(
  pigment: Pigment,
  path: string,
  issues: AuditIssue[]
): void {
  auditTone(pigment.base, `${path}.base`, issues);
  const ids = new Set<string>();
  pigment.layers.forEach((layer, index) => {
    const layerPath = `${path}.layers[${index}]`;
    if (!layer.id.trim())
      report(
        issues,
        "empty-id",
        `${layerPath}.id`,
        "pigment layer id must not be empty"
      );
    if (ids.has(layer.id))
      report(
        issues,
        "duplicate-id",
        `${layerPath}.id`,
        `duplicate pigment layer id ${layer.id}`
      );
    ids.add(layer.id);
    auditField(layer.amount, `${layerPath}.amount`, issues);
    auditTone(layer.tone, `${layerPath}.tone`, issues);
  });
}

function auditOrgan(
  organ: Organ,
  model: FlowerModel,
  path: string,
  issues: AuditIssue[]
): void {
  if (!organ.id.trim())
    report(issues, "empty-id", `${path}.id`, "organ id must not be empty");
  if (!organ.semantic.trim())
    report(
      issues,
      "empty-semantic",
      `${path}.semantic`,
      "organ semantic must not be empty"
    );
  const hasGeometry = Object.hasOwn(model.geometries, organ.geometry);
  const hasAppearance = Object.hasOwn(model.appearances, organ.appearance);
  if (!hasGeometry)
    report(
      issues,
      "missing-geometry",
      `${path}.geometry`,
      `unknown geometry ${organ.geometry}`
    );
  if (!hasAppearance)
    report(
      issues,
      "missing-appearance",
      `${path}.appearance`,
      `unknown appearance ${organ.appearance}`
    );
  const geometry = hasGeometry ? model.geometries[organ.geometry] : undefined;
  const appearance = hasAppearance
    ? model.appearances[organ.appearance]
    : undefined;
  if (geometry && appearance)
    for (const feature of pigmentFeatures(appearance.pigment))
      if (
        geometry.kind !== "lamina" ||
        (feature !== "outline" && !Object.hasOwn(geometry.features, feature))
      )
        report(
          issues,
          "missing-feature",
          `${path}.appearance`,
          `pigment needs surface feature ${feature} on geometry ${geometry.id}`
        );
  auditTransform(organ.transform, `${path}.transform`, issues);
}

function auditNodes(
  nodes: readonly OrganNode[],
  model: FlowerModel,
  ids: Set<string>,
  issues: AuditIssue[],
  path: string
): void {
  nodes.forEach((node, index) => {
    const nodePath = `${path}[${index}]`;
    if (!node.id.trim())
      report(
        issues,
        "empty-id",
        `${nodePath}.id`,
        "organ id must not be empty"
      );
    if (ids.has(node.id))
      report(
        issues,
        "duplicate-id",
        `${nodePath}.id`,
        `duplicate organ id ${node.id}`
      );
    ids.add(node.id);
    if (node.kind === "group") {
      auditTransform(node.transform, `${nodePath}.transform`, issues);
      auditNodes(node.children, model, ids, issues, `${nodePath}.children`);
      return;
    }
    if (node.kind === "instances") {
      if (ids.has(node.template.id))
        report(
          issues,
          "duplicate-id",
          `${nodePath}.template.id`,
          `duplicate organ id ${node.template.id}`
        );
      ids.add(node.template.id);
      auditOrgan(node.template, model, `${nodePath}.template`, issues);
      if (node.transforms.length === 0)
        report(
          issues,
          "empty-instances",
          `${nodePath}.transforms`,
          "instance set must contain at least one transform"
        );
      node.transforms.forEach((transform, transformIndex) => {
        auditTransform(
          transform,
          `${nodePath}.transforms[${transformIndex}]`,
          issues
        );
      });
      return;
    }
    auditOrgan(node, model, nodePath, issues);
  });
}

function auditBounds(model: FlowerModel, issues: AuditIssue[]): void {
  const actual = measureFlowerBounds(model.geometries, model.roots);
  if (!actual) return;
  const declared = model.portrait.bounds;
  for (let axis = 0; axis < 3; axis += 1) {
    if (!Number.isFinite(actual.minimum[axis])) continue;
    const tolerance = Math.max(
      1e-8,
      (declared.maximum[axis] - declared.minimum[axis]) * 1e-6
    );
    if (
      actual.minimum[axis] < declared.minimum[axis] - tolerance ||
      actual.maximum[axis] > declared.maximum[axis] + tolerance
    )
      report(
        issues,
        "bounds-containment",
        `$.model.portrait.bounds[${axis}]`,
        `declared bounds ${declared.minimum[axis]}…${declared.maximum[axis]} do not contain geometry ${actual.minimum[axis]}…${actual.maximum[axis]}`
      );
  }
}

function auditModel(model: FlowerModel, issues: AuditIssue[]): void {
  if (Object.keys(model.geometries).length === 0)
    report(
      issues,
      "empty-model",
      "$.model.geometries",
      "flower model needs at least one geometry"
    );
  if (Object.keys(model.appearances).length === 0)
    report(
      issues,
      "empty-model",
      "$.model.appearances",
      "flower model needs at least one appearance"
    );
  if (model.roots.length === 0)
    report(
      issues,
      "empty-model",
      "$.model.roots",
      "flower model needs at least one root organ"
    );
  for (const [id, geometry] of Object.entries(model.geometries)) {
    const path = `$.model.geometries.${id}`;
    if (geometry.id !== id)
      report(
        issues,
        "record-id",
        `${path}.id`,
        "geometry id must match its record key"
      );
    auditGeometry(geometry, path, issues);
  }
  for (const [id, appearance] of Object.entries(model.appearances)) {
    const path = `$.model.appearances.${id}`;
    if (appearance.id !== id)
      report(
        issues,
        "record-id",
        `${path}.id`,
        "appearance id must match its record key"
      );
    if (
      typeof appearance.tissue.type !== "string" ||
      !appearance.tissue.type.trim()
    )
      report(
        issues,
        "tissue-type",
        `${path}.tissue.type`,
        "tissue type must not be empty"
      );
    for (const property of ["softness", "thickness", "translucency"] as const)
      if (appearance.tissue[property] < 0 || appearance.tissue[property] > 1)
        report(
          issues,
          "tissue-range",
          `${path}.tissue.${property}`,
          "tissue values must be from 0 to 1"
        );
    auditPigment(appearance.pigment, `${path}.pigment`, issues);
  }
  const { bounds, keyLight } = model.portrait;
  auditVector(keyLight, 3, "$.model.portrait.keyLight", issues);
  if (vectorLength(keyLight) < 1e-10)
    report(
      issues,
      "portrait-light",
      "$.model.portrait.keyLight",
      "key light must have a direction"
    );
  for (let axisIndex = 0; axisIndex < 3; axisIndex += 1)
    if (!(bounds.minimum[axisIndex] < bounds.maximum[axisIndex]))
      report(
        issues,
        "portrait-bounds",
        `$.model.portrait.bounds[${axisIndex}]`,
        "minimum bound must be below maximum bound"
      );
  auditNodes(model.roots, model, new Set(), issues, "$.model.roots");
  auditBounds(model, issues);
}

export function auditSpecimen<Traits>(
  specimen: FlowerSpecimen<Traits>
): readonly AuditIssue[] {
  const cached = cache.get(specimen);
  if (cached) return cached;
  const issues: AuditIssue[] = [];
  finite(specimen, "$", issues);
  if (
    specimen.genome.format !== "@nbot/flower-genome" ||
    specimen.genome.formatVersion !== 1 ||
    specimen.genome.engineVersion !== 1
  )
    report(
      issues,
      "genome-format",
      "$.genome",
      "unsupported genome format or engine version"
    );
  if (
    specimen.model.format !== "@nbot/flower-model" ||
    specimen.model.formatVersion !== 1
  )
    report(
      issues,
      "model-format",
      "$.model",
      "unsupported flower model format"
    );
  try {
    assertJsonValue(specimen.genome, "$.genome");
    const expectedGenomeId = `flower/1/${specimen.genome.species.id}/${jsonFingerprint(
      flowerGenomeIdentity(specimen.genome)
    )}`;
    if (specimen.model.genomeId !== expectedGenomeId)
      report(
        issues,
        "genome-id",
        "$.model.genomeId",
        "model must identify the genome it was developed from"
      );
  } catch (error) {
    report(
      issues,
      "genome-json",
      "$.genome",
      error instanceof Error ? error.message : "genome must be JSON-safe"
    );
  }
  auditModel(specimen.model, issues);
  const result = Object.freeze(issues);
  if (deeplyFrozen(specimen)) cache.set(specimen, result);
  return result;
}
