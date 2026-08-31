import {
  type BufferGeometry,
  type DataTexture,
  Group,
  InstancedMesh,
  Mesh,
  Matrix4 as ThreeMatrix4,
} from "three";
import type {
  Matrix4,
  Organ,
  OrganGeometry,
  OrganNode,
} from "@/src/core/model";
import { pigmentUsesSpace } from "@/src/core/pigment";
import type { FlowerSpecimen } from "@/src/core/species";
import { IDENTITY_TRANSFORM, multiplyTransforms } from "@/src/core/transform";
import { createFiberTexture } from "@/src/gl/fiber";
import { createGeometry } from "@/src/gl/geometry";
import {
  createMaterial,
  type FlowerMaterial,
  paintGeometry,
} from "@/src/gl/material";
import { supportsInstancedNormals } from "@/src/shared/instancing";

export type FlowerResources = Readonly<{
  geometries: Set<BufferGeometry>;
  materials: Set<FlowerMaterial>;
  textures: Set<DataTexture>;
}>;

function matrix(value: Matrix4): ThreeMatrix4 {
  return new ThreeMatrix4().fromArray([...value]);
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

export function buildFlower(
  specimen: FlowerSpecimen,
  clay: boolean,
  resources: FlowerResources
): Group {
  const flower = new Group();
  flower.name = `flower:${specimen.model.genomeId}`;
  const textures = new Map<string, DataTexture>();
  const textureFor = (definition: OrganGeometry): DataTexture | undefined => {
    if (definition.kind !== "lamina") return undefined;
    let texture = textures.get(definition.id);
    if (!texture) {
      texture = createFiberTexture(
        `${specimen.model.genomeId}/${definition.id}`
      );
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
        clay,
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
