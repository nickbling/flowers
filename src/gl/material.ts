import {
  BufferAttribute,
  type BufferGeometry,
  Color,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  ShaderChunk,
  type Texture,
  Vector2,
} from "three";
import { polylineDistance } from "@/src/core/curve";
import { evaluatePigment, type FieldSample } from "@/src/core/evaluate";
import type {
  Matrix4,
  OrganAppearance,
  OrganGeometry,
  Point3,
  Tissue,
} from "@/src/core/model";
import { pigmentFeatures } from "@/src/core/pigment";
import { transformPoint } from "@/src/core/transform";
import { oklch } from "@/src/shared/color";

export type FlowerMaterial = MeshPhysicalMaterial | MeshStandardMaterial;

function sampleFeatures(
  geometry: OrganGeometry,
  point: Point3,
  requested: ReadonlySet<string>
): Readonly<Record<string, number>> | undefined {
  if (geometry.kind !== "lamina" || requested.size === 0) return undefined;
  return Object.fromEntries(
    [...requested].map((name) => {
      const feature =
        name === "outline" ? geometry.outline : geometry.features[name];
      return [
        name,
        polylineDistance([point[0], point[1]], feature, name === "outline"),
      ];
    })
  );
}

export function paintGeometry(
  target: BufferGeometry,
  geometry: OrganGeometry,
  appearance: OrganAppearance,
  transform: Matrix4,
  seed: string
): void {
  const positions = target.getAttribute("position");
  const uv = target.getAttribute("uv");
  const colors = new Float32Array(positions.count * 3);
  const requestedFeatures = pigmentFeatures(appearance.pigment);
  if (!target.boundingBox) target.computeBoundingBox();
  const bounds = target.boundingBox;
  for (const index of Array(positions.count).keys()) {
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
      features: sampleFeatures(geometry, organ, requestedFeatures),
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

function replaceRequired(
  source: string,
  anchor: string,
  replacement: string,
  name: string
): string {
  if (!source.includes(anchor))
    throw new Error(`Unsupported three shader: missing ${name}`);
  return source.replace(anchor, replacement);
}

function addTissueTranslucency(
  material: MeshPhysicalMaterial,
  strength: number,
  cavity: number,
  usesThinness: boolean
): void {
  material.onBeforeCompile = (shader) => {
    const usesCavityMap = cavity > 0 && material.bumpMap !== null;
    if (usesThinness || usesCavityMap) {
      const prefix = `${usesThinness ? "attribute float thinness;\nvarying float vFlowerThinness;\n" : ""}${usesCavityMap ? "varying vec2 vFlowerUv;\n" : ""}`;
      const assignments = `${usesThinness ? "\nvFlowerThinness = thinness;" : ""}${usesCavityMap ? "\nvFlowerUv = uv;" : ""}`;
      shader.vertexShader = `${prefix}${replaceRequired(
        shader.vertexShader,
        "#include <begin_vertex>",
        `#include <begin_vertex>${assignments}`,
        "begin_vertex"
      )}`;
    }

    const anchor =
      "RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );";
    if (!ShaderChunk.lights_fragment_begin.includes(anchor))
      throw new Error("Unsupported three shader: missing RE_Direct");
    shader.uniforms.flowerTransmission = { value: 0.03 * strength };
    shader.uniforms.flowerCavity = { value: cavity };
    if (usesCavityMap)
      shader.uniforms.flowerHeightMap = { value: material.bumpMap };
    const thinScatter = usesThinness
      ? "mix( 0.90, 1.05, clamp( vFlowerThinness / 0.55, 0.0, 1.0 ) )"
      : "1.0";
    const lighting = ShaderChunk.lights_fragment_begin.replaceAll(
      anchor,
      `${anchor}
      {
        float flowerNdl = dot( nonPerturbedNormal, directLight.direction );
        float flowerWrap = max( 0.0, ( flowerNdl + 0.16 ) / 1.16 ) - max( 0.0, flowerNdl );
        float flowerThinScatter = ${thinScatter};
        reflectedLight.directDiffuse += directLight.color * flowerTransmission * flowerThinScatter * diffuseColor.rgb * flowerWrap;
      }`
    );
    const declarations = `${usesThinness ? "varying float vFlowerThinness;\n" : ""}${usesCavityMap ? "varying vec2 vFlowerUv;\nuniform sampler2D flowerHeightMap;\n" : ""}uniform float flowerTransmission;\nuniform float flowerCavity;\nvoid main() {`;
    const lit = replaceRequired(
      replaceRequired(
        shader.fragmentShader,
        "#include <lights_fragment_begin>",
        lighting,
        "lights_fragment_begin"
      ),
      "void main() {",
      declarations,
      "main"
    );
    shader.fragmentShader = replaceRequired(
      lit,
      "#include <opaque_fragment>",
      `${
        usesCavityMap
          ? `float flowerCavityHeight = texture2D( flowerHeightMap, vFlowerUv ).r;
        outgoingLight *= mix( 1.0, pow( flowerCavityHeight, 2.2 ), flowerCavity );`
          : ""
      }
      #include <opaque_fragment>`,
      "opaque_fragment"
    );
  };
  material.customProgramCacheKey = () =>
    `flower-tissue-${strength}-${cavity}-${usesThinness}`;
}

type FlowerSurfaceMaps = Readonly<{
  cavity?: number;
  displacementScale?: number;
  height?: Texture;
  normal?: Texture;
  normalScale?: number;
  usesThinness?: boolean;
}>;

type FlowerMaterialOptions = Readonly<{
  clay: boolean;
  surface?: FlowerSurfaceMaps;
  tissue: Tissue;
}>;

export function createMaterial({
  clay,
  surface = {},
  tissue,
}: FlowerMaterialOptions): FlowerMaterial {
  if (tissue.type === "anther" || tissue.type === "pollen")
    return new MeshStandardMaterial({
      color: clay ? new Color("#d8c7b6") : new Color("#ffffff"),
      envMapIntensity: 0.06,
      metalness: 0,
      roughness: tissue.type === "pollen" ? 0.9 : 0.78,
      vertexColors: !clay,
    });

  const relief = 1.05 - 0.3 * tissue.thickness;
  const displacementScale = clay ? 0 : (surface.displacementScale ?? 0);
  const height = clay ? null : (surface.height ?? null);
  const normal = clay ? null : (surface.normal ?? null);
  const material = new MeshPhysicalMaterial({
    bumpMap: height,
    bumpScale: clay ? 0 : 0.3 * relief,
    clearcoat: 0,
    clearcoatRoughness: 1,
    color: clay ? new Color("#d8c7b6") : new Color("#ffffff"),
    displacementBias: -0.975 * displacementScale,
    displacementMap: displacementScale ? height : null,
    displacementScale,
    envMapIntensity: 0.18 + 0.04 * tissue.softness,
    ior: 1.38,
    metalness: 0,
    normalMap: normal,
    normalScale: new Vector2(
      surface.normalScale ?? 0.5 * relief,
      surface.normalScale ?? 0.5 * relief
    ),
    roughness: 0.72 + 0.04 * (1 - tissue.softness),
    sheen: clay ? 0 : 0.03,
    sheenColor: new Color("#fffaf4"),
    sheenRoughness: 1,
    specularIntensity: 0.31 + 0.03 * tissue.softness,
    vertexColors: !clay,
  });
  if (!clay)
    addTissueTranslucency(
      material,
      Math.min(
        1,
        1.35 * tissue.translucency * (1.15 - 0.75 * tissue.thickness)
      ),
      surface.cavity ?? 0,
      surface.usesThinness ?? false
    );
  return material;
}
