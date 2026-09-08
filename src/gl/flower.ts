import {
  type Group,
  InstancedMesh,
  Light,
  OrthographicCamera,
  Scene,
} from "three";
import { auditSpecimen } from "@/src/core/audit";
import type { FlowerModel } from "@/src/core/model";
import type { FlowerSpecimen } from "@/src/core/species";
import { buildFlower, type FlowerResources } from "@/src/gl/model";
import {
  type RenderedFlower,
  type RenderOptions,
  renderScene,
} from "@/src/gl/rendering";
import { type BotanicalStudio, createBotanicalStudio } from "@/src/gl/studio";
import { createRng } from "@/src/shared/prng";

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
  Readonly<RenderOptions> &
  Readonly<{
    preserveDrawingBuffer?: boolean;
    specimen: FlowerSpecimen;
  }>;

export type {
  FlowerRenderPhase,
  FlowerRenderProgress,
  RenderedFlower,
} from "@/src/gl/rendering";

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
  const resources: FlowerResources = {
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
    const flower = buildFlower(
      specimen,
      options.debugView === "clay",
      resources
    );
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
  specimen,
  ...options
}: RenderFlowerOptions): RenderedFlower {
  return Object.freeze(
    renderScene({
      ...options,
      build() {
        const { scene, studio } = buildFlowerScene(specimen, options);
        return {
          ...scene,
          studio,
          random: createRng(
            `${specimen.model.genomeId}/${specimen.genome.seed}/botanical-studio`
          ),
        };
      },
    })
  );
}
