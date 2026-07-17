import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  Group,
  InstancedMesh,
  Light,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NoToneMapping,
  OrthographicCamera,
  PCFShadowMap,
  RedFormat,
  RepeatWrapping,
  Scene,
  ShaderChunk,
  SphereGeometry,
  SRGBColorSpace,
  Matrix4 as ThreeMatrix4,
  Vector3,
  WebGLRenderer,
  type WebGLRenderTarget,
} from "three";
import { auditSpecimen } from "@/src/core/audit";
import { evaluatePigment, type FieldSample } from "@/src/core/evaluate";
import type {
  FlowerModel,
  IndexedMeshGeometry,
  LaminaGeometry,
  Matrix4,
  Organ,
  OrganAppearance,
  OrganGeometry,
  OrganNode,
  Point2,
  Point3,
  SweepGeometry,
} from "@/src/core/model";
import { pigmentUsesSpace } from "@/src/core/pigment";
import type { FlowerSpecimen } from "@/src/core/species";
import { sweepFrames, sweepRadius, sweepSurfacePoint } from "@/src/core/sweep";
import { IDENTITY_TRANSFORM, multiplyTransforms } from "@/src/core/transform";
import {
  BOTANICAL_STUDIO_SAMPLES,
  type BotanicalPresentation,
  type BotanicalStudio,
  createBotanicalEnvironment,
  createBotanicalPresentation,
  createBotanicalStudio,
} from "@/src/gl/studio";
import { oklch } from "@/src/shared/color";
import { supportsInstancedNormals } from "@/src/shared/instancing";
import { between, createRng } from "@/src/shared/prng";

const CROSS_SECTIONS = 32;

export type FlowerSceneOptions = Readonly<{
  debugView?: "clay" | "final";
  look?: "luminous" | "soft";
  padding?: number;
}>;

export type FlowerScene = Readonly<{
  camera: OrthographicCamera;
  dispose(): void;
  flower: Group;
  scene: Scene;
}>;

export type RenderFlowerOptions = FlowerSceneOptions &
  Readonly<{
    canvas: HTMLCanvasElement | OffscreenCanvas;
    onProgress?: (progress: FlowerRenderProgress) => void;
    preserveDrawingBuffer?: boolean;
    signal?: AbortSignal;
    size?: number;
    specimen: FlowerSpecimen;
  }>;

export type FlowerRenderPhase =
  | "queued"
  | "building"
  | "compiling"
  | "rendering"
  | "ready"
  | "disposed"
  | "failed";

export type FlowerRenderProgress = Readonly<{
  completed?: number;
  phase: FlowerRenderPhase;
  total?: number;
}>;

export type RenderedFlower = Readonly<{
  dispose(): void;
  readonly phase: FlowerRenderPhase;
  ready: Promise<void>;
}>;

type Resources = Readonly<{
  geometries: Set<BufferGeometry>;
  materials: Set<FlowerMaterial>;
  textures: Set<DataTexture>;
}>;

type FlowerMaterial = MeshPhysicalMaterial | MeshStandardMaterial;

function validateOptions(
  options: FlowerSceneOptions
): Required<FlowerSceneOptions> {
  const padding = options.padding ?? 0.08;
  if (!Number.isFinite(padding) || padding < 0 || padding >= 0.4)
    throw new RangeError("GL padding must be from 0 to 0.4");
  if (options.debugView && !["clay", "final"].includes(options.debugView))
    throw new TypeError("GL debugView must be clay or final");
  if (options.look && !["luminous", "soft"].includes(options.look))
    throw new TypeError("GL look must be luminous or soft");
  return {
    debugView: options.debugView ?? "final",
    look: options.look ?? "luminous",
    padding,
  };
}

function hash(value: string): number {
  let result = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16_777_619);
  }
  return result >>> 0;
}

function matrix(value: Matrix4): ThreeMatrix4 {
  return new ThreeMatrix4().fromArray([...value]);
}

function pointDistance(
  point: Point2,
  feature: readonly Point2[],
  closed = false
): number {
  let distance = Number.POSITIVE_INFINITY;
  const segments = closed ? feature.length : feature.length - 1;
  for (let index = 0; index < segments; index += 1) {
    const from = feature[index];
    const to = feature[(index + 1) % feature.length];
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const lengthSquared = dx * dx + dy * dy;
    const amount =
      lengthSquared === 0
        ? 0
        : Math.min(
            1,
            Math.max(
              0,
              ((point[0] - from[0]) * dx + (point[1] - from[1]) * dy) /
                lengthSquared
            )
          );
    distance = Math.min(
      distance,
      Math.hypot(
        point[0] - (from[0] + dx * amount),
        point[1] - (from[1] + dy * amount)
      )
    );
  }
  return distance;
}

function transformPoint(transform: Matrix4, point: Point3): Point3 {
  const [x, y, z] = point;
  return [
    transform[0] * x + transform[4] * y + transform[8] * z + transform[12],
    transform[1] * x + transform[5] * y + transform[9] * z + transform[13],
    transform[2] * x + transform[6] * y + transform[10] * z + transform[14],
  ];
}

function grooveTexture(seed: string): DataTexture {
  const width = 192;
  const height = 192;
  const data = new Uint8Array(width * height);
  const rng = createRng(`${seed}/tissue`);
  const spacedOffsets = (count: number, minimum: number, maximum: number) => {
    const gaps = Array.from({ length: count }, () =>
      between(rng, minimum, maximum)
    );
    const total = gaps.reduce((sum, gap) => sum + gap, 0);
    let cursor = 0;
    return gaps.map((gap) => {
      cursor += gap / 2;
      const offset = cursor / total - 0.5;
      cursor += gap / 2;
      return offset;
    });
  };
  const fibers = [
    ...spacedOffsets(10, 0.5, 1.8).map((offset) => ({
      breathe: between(rng, 0.35, 0.9),
      breathePhase: between(rng, 0, 2 * Math.PI),
      depth: between(rng, 0.035, 0.075),
      end: between(rng, 0.8, 1),
      frequency: between(rng, 0.25, 0.8),
      meander: between(rng, 1.3, 4.2),
      offset,
      phase: between(rng, 0, 2 * Math.PI),
      start: between(rng, 0, 0.2),
      width: between(rng, 3, 6.5),
    })),
    ...spacedOffsets(52, 0.3, 1.9).map((offset) => ({
      breathe: between(rng, 0.5, 1.7),
      breathePhase: between(rng, 0, 2 * Math.PI),
      depth: between(rng, 0.055, 0.15),
      end: between(rng, 0.66, 1),
      frequency: between(rng, 0.45, 1.6),
      meander: between(rng, 0.45, 2.3),
      offset,
      phase: between(rng, 0, 2 * Math.PI),
      start: between(rng, 0, 0.3),
      width: between(rng, 0.55, 1.45),
    })),
  ];
  const row = new Float32Array(width);
  for (let y = 0; y < height; y += 1) {
    const v = y / (height - 1);
    const fade =
      Math.min(1, Math.max(0, (v - 0.035) / 0.13)) *
      Math.min(1, Math.max(0, (0.995 - v) / 0.065));
    const spread = 0.62 + 0.38 * v;
    row.fill(0);
    for (const fiber of fibers) {
      if (v < fiber.start || v > fiber.end) continue;
      const progress = (v - fiber.start) / (fiber.end - fiber.start);
      const ends = Math.min(1, 6 * progress * (1 - progress));
      const breath =
        0.78 +
        0.22 * Math.sin(2 * Math.PI * v * fiber.breathe + fiber.breathePhase);
      const depth = fiber.depth * ends * breath;
      const center =
        width * (0.5 + fiber.offset * spread) +
        fiber.meander *
          Math.sin(2 * Math.PI * v * fiber.frequency + fiber.phase);
      const from = Math.max(0, Math.floor(center - 3 * fiber.width));
      const to = Math.min(width - 1, Math.ceil(center + 3 * fiber.width));
      for (let x = from; x <= to; x += 1) {
        row[x] += depth * Math.exp(-(((x - center) / fiber.width) ** 2));
      }
    }
    for (let x = 0; x < width; x += 1) {
      const cavity = Math.min(0.52, row[x] * fade);
      data[y * width + x] = Math.round(255 * (1 - cavity));
    }
  }
  const texture = new DataTexture(data, width, height, RedFormat);
  texture.generateMipmaps = true;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function laminaGeometry(
  geometry: LaminaGeometry,
  seed: string
): BufferGeometry {
  const rows = geometry.sections.length;
  const columns = CROSS_SECTIONS + 1;
  const shellSize = rows * columns;
  const positions = new Float32Array(shellSize * 2 * 3);
  const uvs = new Float32Array(shellSize * 2 * 2);
  const phase = (hash(`${seed}/${geometry.id}`) / 0xffff_ffff) * Math.PI * 2;
  for (let row = 0; row < rows; row += 1) {
    const section = geometry.sections[row];
    const v = row / (rows - 1);
    for (let column = 0; column < columns; column += 1) {
      const u = (column / CROSS_SECTIONS) * 2 - 1;
      const edge = u < 0 ? section.left : section.right;
      const across = Math.abs(u);
      const local: Point3 = [
        section.center[0] + (edge[0] - section.center[0]) * across,
        section.center[1] + (edge[1] - section.center[1]) * across,
        section.center[2] + (edge[2] - section.center[2]) * across,
      ];
      const fiberCoordinate =
        (u + 1) * 8.5 +
        0.18 * Math.sin(v * Math.PI * 3 + phase) +
        0.07 * Math.sin(v * Math.PI * 11 + phase * 0.43);
      const fiberDistance = Math.abs(
        fiberCoordinate - Math.round(fiberCoordinate)
      );
      const cavity = Math.exp(-((fiberDistance / 0.16) ** 2));
      const envelope = Math.sin(Math.PI * v) ** 0.35;
      const collapsedPole = row === 0 || row === rows - 1;
      const roundedEdge = collapsedPole
        ? 1
        : 0.12 + 0.88 * Math.sqrt(Math.max(0, 1 - across * across));
      const top =
        local[2] +
        section.thickness * roundedEdge * (0.48 - 0.1 * cavity * envelope);
      const bottom = local[2] - section.thickness * roundedEdge * 0.72;
      const topIndex = row * columns + column;
      const bottomIndex = shellSize + topIndex;
      for (const [index, z] of [
        [topIndex, top],
        [bottomIndex, bottom],
      ] as const) {
        positions[index * 3] = local[0];
        positions[index * 3 + 1] = local[1];
        positions[index * 3 + 2] = z;
        uvs[index * 2] = (u + 1) / 2;
        uvs[index * 2 + 1] = v;
      }
    }
  }
  const indices: number[] = [];
  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const a = row * columns + column;
      const b = a + columns;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
      const bottomA = shellSize + a;
      const bottomB = shellSize + b;
      indices.push(
        bottomA,
        bottomB,
        bottomA + 1,
        bottomB,
        bottomB + 1,
        bottomA + 1
      );
    }
  }
  const close = (first: number, reverse = false) => {
    for (let step = 0; step < columns - 1; step += 1) {
      const topA = first + step;
      const topB = topA + 1;
      const bottomA = shellSize + topA;
      const bottomB = shellSize + topB;
      if (reverse) indices.push(topA, bottomB, bottomA, topA, topB, bottomB);
      else indices.push(topA, bottomA, bottomB, topA, bottomB, topB);
    }
  };
  for (const column of [0, columns - 1]) {
    for (let row = 0; row < rows - 1; row += 1) {
      const topA = row * columns + column;
      const topB = topA + columns;
      const bottomA = shellSize + topA;
      const bottomB = shellSize + topB;
      if (column === 0)
        indices.push(topA, bottomB, bottomA, topA, topB, bottomB);
      else indices.push(topA, bottomA, bottomB, topA, bottomB, topB);
    }
  }
  close(0, true);
  close((rows - 1) * columns);
  const validIndices: number[] = [];
  const point = (vertex: number): Point3 => [
    positions[vertex * 3],
    positions[vertex * 3 + 1],
    positions[vertex * 3 + 2],
  ];
  for (let index = 0; index < indices.length; index += 3) {
    const [a, b, c] = indices.slice(index, index + 3);
    const pa = point(a);
    const pb = point(b);
    const pc = point(c);
    const ab: Point3 = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
    const ac: Point3 = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
    const cross: Point3 = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    const scale = Math.hypot(...ab) * Math.hypot(...ac);
    if (scale > 0 && Math.hypot(...cross) > scale * 1e-12)
      validIndices.push(a, b, c);
  }
  const result = new BufferGeometry();
  result.setAttribute("position", new BufferAttribute(positions, 3));
  result.setAttribute("uv", new BufferAttribute(uvs, 2));
  result.setIndex(validIndices);
  result.computeVertexNormals();
  const normals = result.getAttribute("normal");
  const vertices = result.getAttribute("position");
  for (const surfaceOffset of [0, shellSize]) {
    for (const row of [0, rows - 1]) {
      const first = surfaceOffset + row * columns;
      const collapsed = Array.from(
        { length: columns - 1 },
        (_, column) => first + column + 1
      ).every(
        (vertex) =>
          Math.hypot(
            vertices.getX(vertex) - vertices.getX(first),
            vertices.getY(vertex) - vertices.getY(first),
            vertices.getZ(vertex) - vertices.getZ(first)
          ) < 1e-8
      );
      if (!collapsed) continue;
      const average = new Vector3();
      for (let column = 0; column < columns; column += 1) {
        const vertex = first + column;
        average.x += normals.getX(vertex);
        average.y += normals.getY(vertex);
        average.z += normals.getZ(vertex);
      }
      if (average.lengthSq() < 1e-16)
        average.set(0, 0, surfaceOffset === 0 ? 1 : -1);
      else average.normalize();
      for (let column = 0; column < columns; column += 1)
        normals.setXYZ(first + column, average.x, average.y, average.z);
    }
  }
  normals.needsUpdate = true;
  return result;
}

function sweepGeometry(geometry: SweepGeometry): BufferGeometry {
  const frames = sweepFrames(geometry.path);
  const radialSegments = 12;
  const ring = radialSegments + 1;
  const capSegments = 3;
  const capped = (
    frame: (typeof frames)[number],
    radius: number,
    angle: number,
    surfaceV: number
  ) => ({
    frame: {
      ...frame,
      center: [
        frame.center[0] + frame.tangent[0] * radius * Math.sin(angle),
        frame.center[1] + frame.tangent[1] * radius * Math.sin(angle),
        frame.center[2] + frame.tangent[2] * radius * Math.sin(angle),
      ] as Point3,
    },
    radius: radius * Math.cos(angle),
    surfaceV,
  });
  const startRadius = geometry.radius[0];
  const endRadius = geometry.radius.at(-1);
  if (endRadius === undefined) throw new Error("sweep needs an end radius");
  const rings = [
    ...Array.from({ length: capSegments }, (_, index) =>
      capped(
        frames[0],
        startRadius,
        -Math.PI / 2 + (index * Math.PI) / (2 * capSegments),
        0
      )
    ),
    ...frames.map((frame, index) => ({
      frame,
      radius: sweepRadius(geometry.radius, index / (frames.length - 1)),
      surfaceV: index / (frames.length - 1),
    })),
    ...Array.from({ length: capSegments }, (_, index) =>
      capped(
        frames.at(-1) as (typeof frames)[number],
        endRadius,
        ((index + 1) * Math.PI) / (2 * capSegments),
        1
      )
    ),
  ];
  const positions = new Float32Array(rings.length * ring * 3);
  const uvs = new Float32Array(rings.length * ring * 2);
  for (let segment = 0; segment < rings.length; segment += 1) {
    const current = rings[segment];
    for (let side = 0; side < ring; side += 1) {
      const index = segment * ring + side;
      const surfaceU = (side / radialSegments) * 2 - 1;
      const point = sweepSurfacePoint(current.frame, current.radius, surfaceU);
      positions[index * 3] = point[0];
      positions[index * 3 + 1] = point[1];
      positions[index * 3 + 2] = point[2];
      uvs[index * 2] = current.surfaceV;
      uvs[index * 2 + 1] = side / radialSegments;
    }
  }
  const indices: number[] = [];
  for (let segment = 1; segment < rings.length; segment += 1) {
    for (let side = 1; side <= radialSegments; side += 1) {
      const previous = ring * (segment - 1);
      const current = ring * segment;
      const a = previous + side - 1;
      const b = current + side - 1;
      const c = current + side;
      const d = previous + side;
      for (const triangle of [
        [a, b, d],
        [b, c, d],
      ] as const) {
        const points = triangle.map(
          (vertex) =>
            [
              positions[vertex * 3],
              positions[vertex * 3 + 1],
              positions[vertex * 3 + 2],
            ] as Point3
        );
        const ab: Point3 = [
          points[1][0] - points[0][0],
          points[1][1] - points[0][1],
          points[1][2] - points[0][2],
        ];
        const ac: Point3 = [
          points[2][0] - points[0][0],
          points[2][1] - points[0][1],
          points[2][2] - points[0][2],
        ];
        const cross: Point3 = [
          ab[1] * ac[2] - ab[2] * ac[1],
          ab[2] * ac[0] - ab[0] * ac[2],
          ab[0] * ac[1] - ab[1] * ac[0],
        ];
        const scale = Math.hypot(...ab) * Math.hypot(...ac);
        if (scale > 0 && Math.hypot(...cross) > scale * 1e-12)
          indices.push(...triangle);
      }
    }
  }
  const result = new BufferGeometry();
  result.setAttribute("position", new BufferAttribute(positions, 3));
  result.setAttribute("uv", new BufferAttribute(uvs, 2));
  result.setIndex(indices);
  result.computeVertexNormals();
  const normals = result.getAttribute("normal");
  const seam = new Vector3();
  for (let segment = 0; segment < rings.length; segment += 1) {
    const first = segment * ring;
    const last = first + radialSegments;
    seam
      .set(
        normals.getX(first) + normals.getX(last),
        normals.getY(first) + normals.getY(last),
        normals.getZ(first) + normals.getZ(last)
      )
      .normalize();
    normals.setXYZ(first, seam.x, seam.y, seam.z);
    normals.setXYZ(last, seam.x, seam.y, seam.z);
  }
  for (const segment of [0, rings.length - 1]) {
    const first = segment * ring;
    const average = new Vector3();
    for (let side = 0; side < ring; side += 1) {
      average.x += normals.getX(first + side);
      average.y += normals.getY(first + side);
      average.z += normals.getZ(first + side);
    }
    average.normalize();
    for (let side = 0; side < ring; side += 1)
      normals.setXYZ(first + side, average.x, average.y, average.z);
  }
  normals.needsUpdate = true;
  return result;
}

function meshGeometry(geometry: IndexedMeshGeometry): BufferGeometry {
  const result = new BufferGeometry();
  result.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(geometry.positions.flat()), 3)
  );
  if (geometry.surfaceCoordinates)
    result.setAttribute(
      "uv",
      new BufferAttribute(
        new Float32Array(geometry.surfaceCoordinates.flat()),
        2
      )
    );
  result.setIndex([...geometry.indices]);
  result.computeVertexNormals();
  return result;
}

function createGeometry(geometry: OrganGeometry, seed: string): BufferGeometry {
  if (geometry.kind === "lamina") return laminaGeometry(geometry, seed);
  if (geometry.kind === "sweep") return sweepGeometry(geometry);
  if (geometry.kind === "ellipsoid") {
    const result = new SphereGeometry(1, 20, 14);
    result.scale(...geometry.radii);
    return result;
  }
  return meshGeometry(geometry);
}

function sampleFeatures(
  geometry: OrganGeometry,
  point: Point3
): Readonly<Record<string, number>> | undefined {
  if (geometry.kind !== "lamina") return undefined;
  return {
    outline: pointDistance([point[0], point[1]], geometry.outline, true),
    ...Object.fromEntries(
      Object.entries(geometry.features).map(([name, feature]) => [
        name,
        pointDistance([point[0], point[1]], feature),
      ])
    ),
  };
}

function paintGeometry(
  target: BufferGeometry,
  geometry: OrganGeometry,
  appearance: OrganAppearance,
  transform: Matrix4,
  seed: string
): void {
  const positions = target.getAttribute("position");
  const uv = target.getAttribute("uv");
  const colors = new Float32Array(positions.count * 3);
  if (!target.boundingBox) target.computeBoundingBox();
  const bounds = target.boundingBox;
  for (let index = 0; index < positions.count; index += 1) {
    let organ: Point3 = [
      positions.getX(index),
      positions.getY(index),
      positions.getZ(index),
    ];
    if (geometry.kind === "lamina" && uv) {
      const surfaceU = uv.getX(index) * 2 - 1;
      const section =
        geometry.sections[
          Math.round(uv.getY(index) * (geometry.sections.length - 1))
        ];
      const edge = surfaceU < 0 ? section.left : section.right;
      const across = Math.abs(surfaceU);
      organ = [
        section.center[0] + (edge[0] - section.center[0]) * across,
        section.center[1] + (edge[1] - section.center[1]) * across,
        section.center[2] + (edge[2] - section.center[2]) * across,
      ];
    }
    const flower = transformPoint(transform, organ);
    const surfaceU = uv
      ? (geometry.kind === "sweep" ? uv.getY(index) : uv.getX(index)) * 2 - 1
      : ((organ[0] - (bounds?.min.x ?? 0)) /
          Math.max(1e-9, (bounds?.max.x ?? 1) - (bounds?.min.x ?? 0))) *
          2 -
        1;
    const surfaceV = uv
      ? geometry.kind === "sweep"
        ? uv.getX(index)
        : geometry.kind === "ellipsoid"
          ? 1 - uv.getY(index)
          : uv.getY(index)
      : (organ[1] - (bounds?.min.y ?? 0)) /
        Math.max(1e-9, (bounds?.max.y ?? 1) - (bounds?.min.y ?? 0));
    const sample: FieldSample = {
      features: sampleFeatures(geometry, organ),
      flower: { x: flower[0], y: flower[1], z: flower[2] },
      organ: { x: organ[0], y: organ[1], z: organ[2] },
      seed,
      surface: { u: surfaceU, v: surfaceV },
    };
    const tone = evaluatePigment(appearance.pigment, sample);
    const painted = new Color(oklch(tone.l, tone.c, tone.h));
    colors[index * 3] = painted.r;
    colors[index * 3 + 1] = painted.g;
    colors[index * 3 + 2] = painted.b;
  }
  target.setAttribute("color", new BufferAttribute(colors, 3));
}

function addTissueTranslucency(
  material: MeshPhysicalMaterial,
  strength: number,
  cavity: number
): void {
  material.onBeforeCompile = (shader) => {
    const anchor =
      "RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );";
    if (!ShaderChunk.lights_fragment_begin.includes(anchor))
      throw new Error("Unsupported three shader: missing RE_Direct");
    shader.uniforms.flowerTransmission = { value: 0.22 * strength };
    shader.uniforms.flowerCavity = { value: cavity };
    const lighting = ShaderChunk.lights_fragment_begin.replaceAll(
      anchor,
      `${anchor}
      {
        float flowerNdl = dot( nonPerturbedNormal, directLight.direction );
        float flowerWrap = max( 0.0, ( flowerNdl + 0.28 ) / 1.28 ) - max( 0.0, flowerNdl );
        reflectedLight.directDiffuse += directLight.color * flowerTransmission * diffuseColor.rgb * flowerWrap;
      }`
    );
    const lit = shader.fragmentShader
      .replace("#include <lights_fragment_begin>", lighting)
      .replace(
        "void main() {",
        "uniform float flowerTransmission;\nuniform float flowerCavity;\nvoid main() {"
      );
    if (!lit.includes("#include <opaque_fragment>"))
      throw new Error("Unsupported three shader: missing opaque_fragment");
    shader.fragmentShader = lit.replace(
      "#include <opaque_fragment>",
      `#ifdef USE_BUMPMAP
        float flowerCavityHeight = texture2D( bumpMap, vBumpMapUv ).r;
        outgoingLight *= mix( 1.0, pow( flowerCavityHeight, 1.6 ), flowerCavity );
      #endif
      #include <opaque_fragment>`
    );
  };
  material.customProgramCacheKey = () => `flower-tissue-${strength}-${cavity}`;
}

function createMaterial(
  appearance: OrganAppearance,
  geometry: OrganGeometry,
  options: Required<FlowerSceneOptions>,
  texture?: DataTexture
): FlowerMaterial {
  const clay = options.debugView === "clay";
  const tissue = appearance.tissue;
  if (tissue.type === "anther" || tissue.type === "pollen")
    return new MeshStandardMaterial({
      color: clay ? new Color("#d8c7b6") : new Color("#ffffff"),
      envMapIntensity: 0.06,
      metalness: 0,
      roughness: tissue.type === "pollen" ? 0.9 : 0.78,
      vertexColors: !clay,
    });
  const relief = 1.05 - 0.3 * tissue.thickness;
  const material = new MeshPhysicalMaterial({
    bumpMap: clay || geometry.kind !== "lamina" ? null : (texture ?? null),
    bumpScale: clay ? 0 : 1.15 * relief,
    clearcoat: 0,
    clearcoatRoughness: 1,
    color: clay ? new Color("#d8c7b6") : new Color("#ffffff"),
    envMapIntensity: 0.1,
    ior: 1.38,
    metalness: 0,
    roughness: 0.7 + 0.14 * tissue.softness,
    sheen: clay ? 0 : 0.04 + 0.04 * tissue.softness,
    sheenColor: new Color("#fffdf8"),
    sheenRoughness: 0.9,
    specularIntensity: 0.08 + 0.06 * (1 - tissue.softness),
    vertexColors: !clay,
  });
  if (!clay)
    addTissueTranslucency(
      material,
      Math.min(
        1,
        1.35 * tissue.translucency * (1.15 - 0.75 * tissue.thickness)
      ),
      geometry.kind === "lamina" ? 0.34 + 0.1 * tissue.softness : 0
    );
  return material;
}

function addMesh(
  flower: Group,
  geometry: BufferGeometry,
  material: FlowerMaterial,
  organ: Organ,
  transform: Matrix4
): void {
  const mesh = new Mesh(geometry, material);
  mesh.matrixAutoUpdate = false;
  mesh.matrix.copy(matrix(transform));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.organ = organ.semantic;
  flower.add(mesh);
}

function addInstances(
  flower: Group,
  geometry: BufferGeometry,
  material: FlowerMaterial,
  organ: Organ,
  transforms: readonly Matrix4[]
): void {
  if (transforms.length === 0) return;
  const instances = new InstancedMesh(geometry, material, transforms.length);
  transforms.forEach((transform, index) => {
    instances.setMatrixAt(index, matrix(transform));
  });
  instances.instanceMatrix.needsUpdate = true;
  instances.castShadow = true;
  instances.receiveShadow = true;
  instances.computeBoundingSphere();
  instances.userData.organ = organ.semantic;
  flower.add(instances);
}

function buildFlower(
  specimen: FlowerSpecimen,
  options: Required<FlowerSceneOptions>,
  resources: Resources
): Group {
  const flower = new Group();
  flower.name = `flower:${specimen.model.genomeId}`;
  const textures = new Map<string, DataTexture>();
  const textureFor = (definition: OrganGeometry): DataTexture | undefined => {
    if (definition.kind !== "lamina") return undefined;
    let texture = textures.get(definition.id);
    if (!texture) {
      texture = grooveTexture(`${specimen.model.genomeId}/${definition.id}`);
      textures.set(definition.id, texture);
      resources.textures.add(texture);
    }
    return texture;
  };
  const geometries = new Map<string, BufferGeometry>();
  const materials = new Map<string, FlowerMaterial>();
  const compile = (organ: Organ, transform: Matrix4) => {
    const definition = specimen.model.geometries[organ.geometry];
    const appearance = specimen.model.appearances[organ.appearance];
    const flowerSpace = pigmentUsesSpace(appearance.pigment, "flower");
    const geometryKey = JSON.stringify([
      organ.geometry,
      organ.appearance,
      flowerSpace ? transform : null,
    ]);
    let geometry = geometries.get(geometryKey);
    if (!geometry) {
      geometry = createGeometry(definition, specimen.model.genomeId);
      resources.geometries.add(geometry);
      paintGeometry(
        geometry,
        definition,
        appearance,
        flowerSpace ? transform : IDENTITY_TRANSFORM,
        specimen.model.genomeId
      );
      geometries.set(geometryKey, geometry);
    }
    const materialKey = JSON.stringify([
      organ.appearance,
      definition.kind,
      definition.kind === "lamina" ? definition.id : null,
    ]);
    let material = materials.get(materialKey);
    if (!material) {
      material = createMaterial(
        appearance,
        definition,
        options,
        textureFor(definition)
      );
      resources.materials.add(material);
      materials.set(materialKey, material);
    }
    return { appearance, definition, flowerSpace, geometry, material };
  };
  const visit = (nodes: readonly OrganNode[], parent: Matrix4): void => {
    for (const node of nodes) {
      if (node.kind === "group") {
        visit(node.children, multiplyTransforms(parent, node.transform));
        continue;
      }
      if (node.kind === "instances") {
        const transforms = node.transforms.map((transform) =>
          multiplyTransforms(
            parent,
            multiplyTransforms(transform, node.template.transform)
          )
        );
        const compiled = compile(node.template, transforms[0]);
        if (compiled.flowerSpace) {
          for (const transform of transforms) {
            const individual = compile(node.template, transform);
            addMesh(
              flower,
              individual.geometry,
              individual.material,
              node.template,
              transform
            );
          }
        } else {
          const regular: Matrix4[] = [];
          const individual: Matrix4[] = [];
          for (const transform of transforms) {
            if (supportsInstancedNormals(transform)) regular.push(transform);
            else individual.push(transform);
          }
          addInstances(
            flower,
            compiled.geometry,
            compiled.material,
            node.template,
            regular
          );
          for (const transform of individual)
            addMesh(
              flower,
              compiled.geometry,
              compiled.material,
              node.template,
              transform
            );
        }
        continue;
      }
      const transform = multiplyTransforms(parent, node.transform);
      const compiled = compile(node, transform);
      addMesh(flower, compiled.geometry, compiled.material, node, transform);
    }
  };
  visit(specimen.model.roots, IDENTITY_TRANSFORM);
  return flower;
}

function cameraFor(model: FlowerModel, padding: number): OrthographicCamera {
  const { maximum, minimum } = model.portrait.bounds;
  const centerX = (minimum[0] + maximum[0]) / 2;
  const centerY = (minimum[1] + maximum[1]) / 2;
  const centerZ = (minimum[2] + maximum[2]) / 2;
  const half =
    Math.max(maximum[0] - minimum[0], maximum[1] - minimum[1]) /
    (2 * (1 - padding * 2));
  const depth = maximum[2] - minimum[2];
  const clearance = Math.max(half * 4, depth * 0.1, 1e-3);
  const cameraZ = maximum[2] + clearance;
  const near = Math.max(clearance * 0.001, 1e-6);
  const far = cameraZ - minimum[2] + clearance;
  const camera = new OrthographicCamera(-half, half, half, -half, near, far);
  camera.position.set(centerX, centerY, cameraZ);
  camera.lookAt(centerX, centerY, centerZ);
  camera.updateProjectionMatrix();
  return camera;
}

type BuiltFlowerScene = Readonly<{
  scene: FlowerScene;
  studio: BotanicalStudio;
}>;

function buildFlowerScene(
  specimen: FlowerSpecimen,
  rawOptions: FlowerSceneOptions = {}
): BuiltFlowerScene {
  const issues = auditSpecimen(specimen);
  if (issues.length)
    throw new Error(
      `cannot render an invalid flower specimen:\n${issues
        .map((issue) => `${issue.path} [${issue.code}] ${issue.message}`)
        .join("\n")}`
    );
  const options = validateOptions(rawOptions);
  const resources: Resources = {
    geometries: new Set(),
    materials: new Set(),
    textures: new Set(),
  };
  const scene = new Scene();
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const geometry of resources.geometries) geometry.dispose();
    for (const material of resources.materials) material.dispose();
    for (const texture of resources.textures) texture.dispose();
    scene.traverse((object) => {
      if (object instanceof InstancedMesh) object.dispose();
      if (object instanceof Light) object.dispose();
    });
    scene.clear();
  };
  try {
    const flower = buildFlower(specimen, options, resources);
    scene.add(flower);
    const studio = createBotanicalStudio({
      bounds: specimen.model.portrait.bounds,
      keyLight: specimen.model.portrait.keyLight,
      look: options.look,
      scene,
    });
    const camera = cameraFor(specimen.model, options.padding);
    return Object.freeze({
      scene: Object.freeze({ camera, dispose, flower, scene }),
      studio,
    });
  } catch (error) {
    dispose();
    throw error;
  }
}

export function flowerScene(
  specimen: FlowerSpecimen,
  options: FlowerSceneOptions = {}
): FlowerScene {
  return buildFlowerScene(specimen, options).scene;
}

export function renderFlower({
  canvas,
  onProgress,
  preserveDrawingBuffer = false,
  signal,
  size = 480,
  specimen,
  ...options
}: RenderFlowerOptions): RenderedFlower {
  if (!Number.isSafeInteger(size) || size < 1 || size > 2048)
    throw new RangeError("GL size must be an integer from 1 to 2048");
  if (typeof preserveDrawingBuffer !== "boolean")
    throw new TypeError("preserveDrawingBuffer must be a boolean");

  let built: BuiltFlowerScene | undefined;
  let environment: WebGLRenderTarget | undefined;
  let presentation: BotanicalPresentation | undefined;
  let renderer: WebGLRenderer | undefined;
  let disposed = false;
  let settled = false;
  let scheduledFrame = 0;
  let scheduledTimer: ReturnType<typeof setTimeout> | undefined;
  let phase: FlowerRenderPhase = "queued";
  let resolveReady!: () => void;
  let rejectReady!: (reason: unknown) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const report = (
    next: FlowerRenderPhase,
    progress: Readonly<{ completed?: number; total?: number }> = {},
    propagate = true
  ) => {
    phase = next;
    if (!onProgress) return;
    const event = Object.freeze({ phase: next, ...progress });
    if (propagate) onProgress(event);
    else {
      try {
        onProgress(event);
      } catch {}
    }
  };
  const finish = () => {
    if (settled) return;
    settled = true;
    resolveReady();
  };
  const cleanup = () => {
    if (scheduledFrame && typeof cancelAnimationFrame === "function")
      cancelAnimationFrame(scheduledFrame);
    if (scheduledTimer !== undefined) clearTimeout(scheduledTimer);
    scheduledFrame = 0;
    scheduledTimer = undefined;
    signal?.removeEventListener("abort", dispose);
    presentation?.dispose();
    presentation = undefined;
    built?.scene.dispose();
    built = undefined;
    environment?.dispose();
    environment = undefined;
    renderer?.dispose();
    renderer = undefined;
  };
  const fail = (error: unknown) => {
    if (disposed) {
      finish();
      return;
    }
    report("failed", {}, false);
    cleanup();
    if (settled) return;
    settled = true;
    rejectReady(error);
  };
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    report("disposed", {}, false);
    cleanup();
    finish();
  }
  const start = async () => {
    scheduledFrame = 0;
    scheduledTimer = undefined;
    if (disposed) return;
    try {
      report("building");
      built = buildFlowerScene(specimen, options);
      if (disposed) return;
      const instance = new WebGLRenderer({
        alpha: true,
        antialias: false,
        canvas,
        preserveDrawingBuffer,
      });
      renderer = instance;
      const pixelSize = Math.min(2 * size, 1536);
      instance.setPixelRatio(pixelSize / size);
      const offscreen =
        typeof OffscreenCanvas !== "undefined" &&
        canvas instanceof OffscreenCanvas;
      instance.setSize(size, size, !offscreen);
      instance.setClearColor(0x000000, 0);
      instance.outputColorSpace = SRGBColorSpace;
      instance.shadowMap.enabled = true;
      instance.shadowMap.type = PCFShadowMap;
      instance.toneMapping = NoToneMapping;
      environment = createBotanicalEnvironment(instance);
      built.scene.scene.environment = environment.texture;
      report("compiling");
      await instance.compileAsync(built.scene.scene, built.scene.camera);
      if (disposed) return;
      presentation = createBotanicalPresentation(
        instance,
        pixelSize,
        options.look ?? "luminous"
      );
      const random = createRng(
        `${specimen.model.genomeId}/${specimen.genome.seed}/botanical-studio`
      );
      let completed = 0;
      const renderSample = () => {
        scheduledFrame = 0;
        scheduledTimer = undefined;
        if (disposed || !built || !presentation) return;
        try {
          built.studio.sample(random);
          built.scene.camera.setViewOffset(
            pixelSize,
            pixelSize,
            random() - 0.5,
            random() - 0.5,
            pixelSize,
            pixelSize
          );
          presentation.present(built.scene.scene, built.scene.camera);
          built.scene.camera.clearViewOffset();
          completed += 1;
          report("rendering", {
            completed,
            total: BOTANICAL_STUDIO_SAMPLES,
          });
          if (completed === BOTANICAL_STUDIO_SAMPLES) {
            report("ready", {
              completed,
              total: BOTANICAL_STUDIO_SAMPLES,
            });
            finish();
          } else if (
            typeof requestAnimationFrame === "function" &&
            (typeof document === "undefined" ||
              document.visibilityState !== "hidden")
          ) {
            scheduledFrame = requestAnimationFrame(renderSample);
          } else {
            scheduledTimer = setTimeout(renderSample, 0);
          }
        } catch (error) {
          built?.scene.camera.clearViewOffset();
          fail(error);
        }
      };
      report("rendering", { completed: 0, total: BOTANICAL_STUDIO_SAMPLES });
      renderSample();
    } catch (error) {
      fail(error);
    }
  };

  report("queued");
  if (signal?.aborted) dispose();
  else {
    signal?.addEventListener("abort", dispose, { once: true });
    if (
      typeof requestAnimationFrame === "function" &&
      (typeof document === "undefined" || document.visibilityState !== "hidden")
    )
      scheduledFrame = requestAnimationFrame(() => void start());
    else scheduledTimer = setTimeout(() => void start(), 0);
  }

  return Object.freeze({
    dispose,
    get phase() {
      return phase;
    },
    ready,
  });
}
