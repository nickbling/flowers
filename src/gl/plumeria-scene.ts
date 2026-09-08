import {
  Box3,
  Group,
  Light,
  Mesh,
  MeshPhysicalMaterial,
  OrthographicCamera,
  Scene,
} from "three";
import { tissues } from "@/src/core/anatomy";
import { petalGeometry } from "@/src/gl/loft";
import { createMaterial } from "@/src/gl/material";
import { createPlumeriaPigment } from "@/src/gl/plumeria-pigment";
import { createPlumeriaSkin } from "@/src/gl/plumeria-skin";
import { sampleRelief } from "@/src/gl/plumeria-surface";
import {
  type BotanicalStudio,
  type BotanicalStudioLight,
  createBotanicalStudio,
} from "@/src/gl/studio";
import { preparePigmentMarks } from "@/src/plumeria/markings";
import {
  growPlumeria,
  PLUMERIA_PETAL_COUNT,
  PLUMERIA_VIEWBOX,
} from "@/src/plumeria/specimen";
import type { PlumeriaSelection } from "@/src/plumeria/variants";
import { fullMoon } from "@/src/shared/moon";
import { createRng } from "@/src/shared/prng";

export type PlumeriaSceneOptions = Readonly<{
  seed: string;
  /** ISO day (YYYY-MM-DD); the full moon of that day pales the bloom. */
  date?: string;
  /** Renderer-owned studio profile; geometry, pigment and material stay fixed. */
  look?: "luminous" | "soft";
  /** Development view that isolates geometry and light from pigment and relief. */
  debugView?: "clay" | "final";
  /** Deterministic bud-to-bloom anatomy review, from 0 (closed) to 1 (open). */
  development?: number;
}> &
  PlumeriaSelection;

export type PlumeriaScene = {
  camera: OrthographicCamera;
  cultivar: string;
  /** Petal length, used as the scene's scale unit. */
  length: number;
  scene: Scene;
};

export type DisposablePlumeriaScene = PlumeriaScene &
  Readonly<{ dispose(): void }>;

const PLUMERIA_STUDIO_LIGHT: BotanicalStudioLight = Object.freeze({
  bounceIntensity: 0.2,
  faceFillIntensity: 0.12,
  hemisphereIntensity: 0.55,
  keyAperture: 0.9,
  keyIntensity: 1.35,
  keyShadowIntensity: 0.85,
  rimIntensity: 0.04,
  skyIntensity: 0.5,
  skyShadowIntensity: 0.7,
});

export type BuiltPlumeriaScene = Readonly<{
  portrait: DisposablePlumeriaScene;
  studio: BotanicalStudio;
}>;

export function buildPlumeriaScene({
  seed,
  date,
  cultivar,
  variant,
  look = "luminous",
  debugView = "final",
  development = 1,
}: PlumeriaSceneOptions): BuiltPlumeriaScene {
  if (look !== "luminous" && look !== "soft")
    throw new TypeError("look must be luminous or soft");
  if (debugView !== "clay" && debugView !== "final")
    throw new TypeError("debugView must be clay or final");
  if (!Number.isFinite(development) || development < 0 || development > 1)
    throw new RangeError("development must be between 0 and 1");
  const clay = debugView === "clay";
  const grown = growPlumeria(
    seed,
    date ? fullMoon(date) : 0,
    cultivar,
    variant
  );
  const genome = grown.genome;
  const form = grown.form;

  const relief = sampleRelief(
    createRng(`${seed}/relief`),
    genome.form.fullness
  );
  const L = form.length;

  const marks = preparePigmentMarks(seed, genome, grown.livery);
  const pigment = clay ? null : createPlumeriaPigment(grown, marks);
  const geometry = petalGeometry(form, relief, development);
  const fiberNormal = clay ? null : createPlumeriaSkin(`${seed}/fiber`);
  const petalTissue = tissues.petal({
    softness: 0.95,
    thickness: 0.2,
    translucency: 0,
  });
  const material = createMaterial({
    clay,
    surface: fiberNormal ? { normal: fiberNormal, normalScale: 1 } : {},
    tissue: petalTissue,
  });
  if (pigment) {
    material.map = pigment;
    material.vertexColors = false;
  }
  material.envMapIntensity = 0.45;
  material.roughness = 0.66;
  if (material instanceof MeshPhysicalMaterial) {
    material.sheen = 0;
    material.specularIntensity = 0.9;
    material.ior = 1.45;
  }

  const corolla = new Group();
  for (const i of Array(PLUMERIA_PETAL_COUNT).keys()) {
    const petal = new Mesh(geometry, material);
    // SVG screen rotation and Three +z rotation have opposite handedness.
    petal.rotation.z = (-i * 2 * Math.PI) / PLUMERIA_PETAL_COUNT;
    petal.castShadow = true;
    petal.receiveShadow = true;
    petal.userData.organ = "petal";
    corolla.add(petal);
  }

  const scene = new Scene();
  scene.add(corolla);
  corolla.updateMatrixWorld(true);
  const box = new Box3().setFromObject(corolla);
  const studio = createBotanicalStudio({
    bounds: {
      maximum: [box.max.x, box.max.y, box.max.z],
      minimum: [box.min.x, box.min.y, box.min.z],
    },
    keyLight: [-0.58, 0.72, 1],
    light: PLUMERIA_STUDIO_LIGHT,
    look,
    scene,
  });

  const halfView = PLUMERIA_VIEWBOX / (2 * grown.frame.scale);
  const camera = new OrthographicCamera(
    -halfView,
    halfView,
    halfView,
    -halfView,
    1,
    4000
  );
  const cameraX = grown.frame.centerX;
  const cameraY = -grown.frame.centerY;
  camera.position.set(cameraX, cameraY, 1000);
  camera.lookAt(cameraX, cameraY, 0);

  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    geometry.dispose();
    fiberNormal?.dispose();
    pigment?.dispose();
    material.dispose();
    scene.traverse((object) => {
      if (object instanceof Light) object.dispose();
    });
    scene.clear();
  };
  return {
    portrait: {
      camera,
      cultivar: genome.cultivar,
      dispose,
      length: L,
      scene,
    },
    studio,
  };
}

export function plumeriaScene(
  options: PlumeriaSceneOptions
): DisposablePlumeriaScene {
  return buildPlumeriaScene(options).portrait;
}
