import {
  Box3,
  Color,
  type DataTexture as DataTextureType,
  Group,
  Light,
  Mesh,
  MeshPhysicalMaterial,
  OrthographicCamera,
  Scene,
  ShaderChunk,
} from "three";
import { createFiberTexture } from "@/src/gl/fiber";
import { petalGeometry, sampleRelief } from "@/src/gl/loft";
import { type BotanicalStudio, createBotanicalStudio } from "@/src/gl/studio";
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

// Wrapped diffuse transmission distinguishes soft tissue from opaque plastic.
// Smooth normals prevent the relief map from blotching that response.
function addTranslucency(material: MeshPhysicalMaterial): void {
  material.onBeforeCompile = (shader) => {
    const replaceRequired = (
      source: string,
      anchor: string,
      replacement: string,
      name: string
    ): string => {
      if (!source.includes(anchor))
        throw new Error(`Unsupported three shader: missing ${name}`);
      return source.replace(anchor, replacement);
    };
    shader.uniforms.sss = { value: 0.1 };
    shader.uniforms.cavityStrength = { value: 0.38 };
    const lit =
      "RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );";
    if (!ShaderChunk.lights_fragment_begin.includes(lit))
      throw new Error("Unsupported three shader: missing RE_Direct");
    const direct = replaceRequired(
      shader.fragmentShader,
      "#include <lights_fragment_begin>",
      ShaderChunk.lights_fragment_begin.replaceAll(
        lit,
        `${lit}
        {
          // Add wrap only past the Lambert terminator.
          vec3 sn = nonPerturbedNormal;
          float ndl = dot( sn, directLight.direction );
          float w = 0.3;
          float wrap = max( 0.0, ( ndl + w ) / ( 1.0 + w ) ) - max( 0.0, ndl );
          reflectedLight.directDiffuse += directLight.color * sss * diffuseColor.rgb * wrap;
        }`
      ),
      "lights_fragment_begin"
    );
    const cavity = replaceRequired(
      direct,
      "#include <opaque_fragment>",
      `#ifdef USE_BUMPMAP
        // Micro-cavities occlude direct light too. This preserves groove
        // readability when the broad key is frontal without tinting albedo.
        float cavityHeight = texture2D( bumpMap, vBumpMapUv ).r;
        float cavityOcclusion = pow( cavityHeight, 1.7 );
        outgoingLight *= mix( 1.0, cavityOcclusion, cavityStrength );
      #endif
      #include <opaque_fragment>`,
      "opaque_fragment"
    );
    shader.fragmentShader = `uniform float sss;\nuniform float cavityStrength;\n${cavity}`;
  };
}

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
}: PlumeriaSceneOptions): BuiltPlumeriaScene {
  if (look !== "luminous" && look !== "soft")
    throw new TypeError("look must be luminous or soft");
  if (debugView !== "clay" && debugView !== "final")
    throw new TypeError("debugView must be clay or final");
  const luminous = look === "luminous";
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

  const geometry = petalGeometry(form, relief, genome, grown.livery);
  const skin = (bumpMap: DataTextureType | null) => {
    const material = new MeshPhysicalMaterial({
      color: clay ? new Color("#d7c1ad") : new Color("#ffffff"),
      metalness: 0,
      roughness: 0.78,
      clearcoat: 0,
      clearcoatRoughness: 1,
      specularIntensity: 0.1,
      ior: 1.4,
      sheen: 0.06,
      sheenRoughness: 0.9,
      sheenColor: new Color("#ffffff"),
      // A strong environment reflection veils pigment on this rough surface.
      envMapIntensity: 0.1,
      vertexColors: !clay,
      // Relief-only folds stay visible under a frontal key without painted fibers.
      bumpMap,
      bumpScale: clay ? 0 : 1.3,
    });
    addTranslucency(material);
    return material;
  };
  const fiber = clay ? null : createFiberTexture(`${seed}/fiber`);
  const material = skin(fiber);

  const corolla = new Group();
  for (const i of Array(PLUMERIA_PETAL_COUNT).keys()) {
    const petal = new Mesh(geometry, material);
    // SVG screen rotation and Three +z rotation have opposite handedness.
    petal.rotation.z = (-i * 2 * Math.PI) / PLUMERIA_PETAL_COUNT;
    petal.castShadow = true;
    petal.receiveShadow = true;
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
    keyLight: [-0.65, 0.8, 1],
    look: luminous ? "luminous" : "soft",
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
    fiber?.dispose();
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
