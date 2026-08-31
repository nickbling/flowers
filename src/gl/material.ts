import {
  BufferAttribute,
  type BufferGeometry,
  Color,
  type DataTexture,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  ShaderChunk,
} from "three";
import { polylineDistance } from "@/src/core/curve";
import { evaluatePigment, type FieldSample } from "@/src/core/evaluate";
import type {
  Matrix4,
  OrganAppearance,
  OrganGeometry,
  Point3,
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

export function createMaterial(
  appearance: OrganAppearance,
  geometry: OrganGeometry,
  clay: boolean,
  texture?: DataTexture
): FlowerMaterial {
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
