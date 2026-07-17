import {
  Box3,
  Color,
  type DataTexture as DataTextureType,
  Group,
  Light,
  Mesh,
  MeshPhysicalMaterial,
  NoToneMapping,
  OrthographicCamera,
  PCFShadowMap,
  Scene,
  ShaderChunk,
  WebGLRenderer,
} from "three";
import { fiberTexture, petalGeometry, sampleRelief } from "@/src/gl/loft";
import {
  type BotanicalStudio,
  createBotanicalEnvironment,
  createBotanicalPresentation,
  createBotanicalStudio,
  PLUMERIA_GL_RENDER_CONTRACT,
} from "@/src/gl/studio";
import { growPlumeria } from "@/src/plumeria/specimen";
import type { PlumeriaSelection } from "@/src/plumeria/variants";
import { fullMoon } from "@/src/shared/moon";
import { createRng } from "@/src/shared/prng";

export {
  type FlowerRenderPhase,
  type FlowerRenderProgress,
  type FlowerScene,
  type FlowerSceneOptions,
  flowerScene,
  type RenderedFlower,
  type RenderFlowerOptions,
  renderFlower,
} from "@/src/gl/flower";
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

const PETALS = 5;
const FRAME = 480;

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

type BuiltPlumeriaScene = Readonly<{
  portrait: PlumeriaScene;
  studio: BotanicalStudio;
}>;

function buildPlumeriaScene({
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
  // Both specialized adapters consume this shared specimen.
  const grown = growPlumeria(
    seed,
    date ? fullMoon(date) : 0,
    cultivar,
    variant
  );
  const genome = grown.genome;
  const form = grown.form;

  // Namespace renderer-local relief without perturbing specimen identity.
  const loftRng = createRng(`${seed}|gl`);
  const relief = sampleRelief(loftRng, genome.form.fullness);
  const livery = {
    blush2At: 0,
    blush2Mix: null,
    blush2Opacity: 0,
    blush2Width: 0,
    halo: 0,
    stripeSide: 0,
    stripy: false,
  };
  const L = form.length;

  const geometry = petalGeometry(form, relief, genome, livery);
  // Matte tissue; curvature, rather than clearcoat, carries the highlight.
  const skin = (bumpMap: DataTextureType) => {
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
      bumpMap: clay ? null : bumpMap,
      bumpScale: clay ? 0 : 1.3,
    });
    addTranslucency(material);
    return material;
  };
  const material = skin(fiberTexture(loftRng));

  // One geometry and exact rotations preserve radial identity across media.
  // The loft carries imbrication; per-petal z offsets create visible steps.
  const corolla = new Group();
  for (const i of Array(PETALS).keys()) {
    const petal = new Mesh(geometry, material);
    // SVG screen rotation and Three +z rotation have opposite handedness.
    petal.rotation.z = (-i * 2 * Math.PI) / 5;
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

  const halfView = FRAME / (2 * grown.frame.scale);
  const camera = new OrthographicCamera(
    -halfView,
    halfView,
    halfView,
    -halfView,
    1,
    4000
  );
  // A zenith view preserves exact 72° radial identity across renderers.
  const cameraX = grown.frame.centerX;
  const cameraY = -grown.frame.centerY;
  camera.position.set(cameraX, cameraY, 1000);
  camera.lookAt(cameraX, cameraY, 0);

  return {
    portrait: { camera, cultivar: genome.cultivar, length: L, scene },
    studio,
  };
}

export function plumeriaScene(options: PlumeriaSceneOptions): PlumeriaScene {
  return buildPlumeriaScene(options).portrait;
}

export type RenderPlumeriaOptions = PlumeriaSceneOptions & {
  canvas: HTMLCanvasElement;
  /** Rendered square size in CSS pixels. */
  size?: number;
  /** Number of accumulation frames; 64 converges. */
  samples?: number;
};

export type RenderedPlumeria = {
  cultivar: string;
  /** Resolves after accumulation, or early when disposal cancels it. */
  ready: Promise<void>;
  dispose: () => void;
};

function disposeSceneResources(scene: Scene): void {
  const resources = new Set<{ dispose(): void }>();
  scene.traverse((child) => {
    if (child instanceof Light) resources.add(child);
    if (!(child instanceof Mesh)) return;
    resources.add(child.geometry);
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    for (const material of materials) {
      resources.add(material);
      if (!(material instanceof MeshPhysicalMaterial)) continue;
      if (material.map) resources.add(material.map);
      if (material.bumpMap) resources.add(material.bumpMap);
    }
  });
  for (const resource of resources) resource.dispose();
  scene.clear();
}

export function renderPlumeria({
  canvas,
  size = 480,
  samples = 64,
  ...options
}: RenderPlumeriaOptions): RenderedPlumeria {
  if (!Number.isInteger(size) || size < 1 || size > 1024)
    throw new RangeError("size must be an integer from 1 to 1024");
  if (!Number.isInteger(samples) || samples < 1 || samples > 256)
    throw new RangeError("samples must be an integer from 1 to 256");

  const built = buildPlumeriaScene(options);
  const { camera, cultivar, scene } = built.portrait;
  const luminous = options.look !== "soft";
  const transient = new Set<{ dispose(): void }>();
  let renderer: WebGLRenderer | undefined;
  let raf = 0;
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (raf && typeof cancelAnimationFrame === "function")
      cancelAnimationFrame(raf);
    for (const resource of transient) resource.dispose();
    disposeSceneResources(scene);
    renderer?.dispose();
  };

  try {
    const activeRenderer = new WebGLRenderer({
      alpha: true,
      antialias: false,
      canvas,
      preserveDrawingBuffer: true,
    });
    renderer = activeRenderer;
    const px = Math.min(
      PLUMERIA_GL_RENDER_CONTRACT.pixelScale * size,
      PLUMERIA_GL_RENDER_CONTRACT.pixelCeiling
    );
    activeRenderer.setPixelRatio(px / size);
    activeRenderer.setSize(size, size);
    activeRenderer.setClearColor(0x000000, 0);
    activeRenderer.shadowMap.enabled = true;
    activeRenderer.shadowMap.type = PCFShadowMap;
    activeRenderer.toneMapping = NoToneMapping;

    const environment = createBotanicalEnvironment(activeRenderer);
    transient.add(environment);
    scene.environment = environment.texture;

    const presentation = createBotanicalPresentation(
      activeRenderer,
      px,
      luminous ? "luminous" : "soft"
    );
    transient.add(presentation);

    const jitter = createRng(
      `${options.seed}|${PLUMERIA_GL_RENDER_CONTRACT.jitterNamespace}`
    );
    let frame = 0;
    let disposed = false;
    let settled = false;
    let resolveReady!: () => void;
    let rejectReady!: (reason: unknown) => void;
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    const finish = () => {
      if (settled) return;
      settled = true;
      resolveReady();
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      disposed = true;
      cleanup();
      rejectReady(error);
    };
    let renderFrame!: () => void;
    const scheduledFrame = () => {
      try {
        renderFrame();
      } catch (error) {
        fail(error);
      }
    };
    renderFrame = () => {
      built.studio.sample(jitter);
      camera.setViewOffset(px, px, jitter() - 0.5, jitter() - 0.5, px, px);

      presentation.present(scene, camera);
      frame += 1;
      if (frame < samples) raf = requestAnimationFrame(scheduledFrame);
      else finish();
    };
    renderFrame();

    return Object.freeze({
      cultivar,
      dispose() {
        if (disposed) return;
        disposed = true;
        cleanup();
        finish();
      },
      ready,
    });
  } catch (error) {
    cleanup();
    throw error;
  }
}
