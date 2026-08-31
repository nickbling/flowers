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
  type Accumulation,
  accumulate,
  createRenderSurface,
  type RenderSurface,
  resolveRenderPixelSize,
} from "@/src/gl/rendering";
import {
  BOTANICAL_STUDIO,
  type BotanicalStudio,
  createBotanicalStudio,
} from "@/src/gl/studio";
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
  Readonly<{
    canvas: HTMLCanvasElement | OffscreenCanvas;
    onProgress?: (progress: FlowerRenderProgress) => void;
    /** Backing-buffer width and height. Defaults to the studio sampling scale. */
    pixelSize?: number;
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
  canvas,
  onProgress,
  pixelSize,
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
  const renderPixelSize = resolveRenderPixelSize(size, pixelSize);

  let accumulation: Accumulation | undefined;
  let built: BuiltFlowerScene | undefined;
  let surface: RenderSurface | undefined;
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
    accumulation?.cancel();
    accumulation = undefined;
    surface?.dispose();
    surface = undefined;
    built?.scene.dispose();
    built = undefined;
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
      if (disposed) return;
      built = buildFlowerScene(specimen, options);
      if (disposed) return;
      surface = createRenderSurface({
        canvas,
        look: options.look ?? "luminous",
        pixelSize: renderPixelSize,
        preserveDrawingBuffer,
        scene: built.scene.scene,
        size,
      });
      report("compiling");
      if (disposed) return;
      await surface.renderer.compileAsync(
        built.scene.scene,
        built.scene.camera
      );
      if (disposed) return;
      report("rendering", { completed: 0, total: BOTANICAL_STUDIO.samples });
      if (disposed) return;
      accumulation = accumulate({
        camera: built.scene.camera,
        onFrame: (completed) =>
          report("rendering", { completed, total: BOTANICAL_STUDIO.samples }),
        random: createRng(
          `${specimen.model.genomeId}/${specimen.genome.seed}/botanical-studio`
        ),
        samples: BOTANICAL_STUDIO.samples,
        scene: built.scene.scene,
        studio: built.studio,
        surface,
      });
      void accumulation.ready.then(() => {
        if (disposed) return;
        try {
          report("ready", {
            completed: BOTANICAL_STUDIO.samples,
            total: BOTANICAL_STUDIO.samples,
          });
          finish();
        } catch (error) {
          fail(error);
        }
      }, fail);
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
