import {
  type Camera,
  NoToneMapping,
  type OrthographicCamera,
  PCFShadowMap,
  type Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";
import {
  BOTANICAL_STUDIO,
  type BotanicalStudio,
  createBotanicalEnvironment,
  createBotanicalPresentation,
} from "@/src/gl/studio";
import type { Rng } from "@/src/shared/prng";

export const MAX_GL_PIXEL_SIZE = 2048;

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

export type RenderOptions = {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  onProgress?: (progress: FlowerRenderProgress) => void;
  /** Backing-buffer width and height. Defaults to the studio sampling scale. */
  pixelSize?: number;
  signal?: AbortSignal;
  /** Rendered square size in CSS pixels. */
  size?: number;
};

export type RenderedFlower = Readonly<{
  dispose(): void;
  readonly phase: FlowerRenderPhase;
  /** Resolves after accumulation, or early when disposal cancels it. */
  ready: Promise<void>;
}>;

export type RenderSurface = Readonly<{
  dispose(): void;
  pixelSize: number;
  present(scene: Scene, camera: Camera): void;
  renderer: WebGLRenderer;
}>;

type RenderSurfaceOptions = Readonly<{
  canvas: HTMLCanvasElement | OffscreenCanvas;
  look: "luminous" | "soft";
  pixelSize: number;
  preserveDrawingBuffer: boolean;
  scene: Scene;
  size: number;
}>;

export function resolveRenderPixelSize(
  size: number,
  requested?: number
): number {
  if (
    requested !== undefined &&
    (!Number.isSafeInteger(requested) ||
      requested < 1 ||
      requested > MAX_GL_PIXEL_SIZE)
  )
    throw new RangeError(
      `GL pixelSize must be an integer from 1 to ${MAX_GL_PIXEL_SIZE}`
    );
  return (
    requested ??
    Math.min(BOTANICAL_STUDIO.pixelScale * size, BOTANICAL_STUDIO.pixelCeiling)
  );
}

export function createRenderSurface({
  canvas,
  look,
  pixelSize,
  preserveDrawingBuffer,
  scene,
  size,
}: RenderSurfaceOptions): RenderSurface {
  const renderer = new WebGLRenderer({
    alpha: true,
    antialias: false,
    canvas,
    preserveDrawingBuffer,
  });
  renderer.setPixelRatio(pixelSize / size);
  const offscreen =
    typeof OffscreenCanvas !== "undefined" && canvas instanceof OffscreenCanvas;
  renderer.setSize(size, size, !offscreen);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.toneMapping = NoToneMapping;

  try {
    const environment = createBotanicalEnvironment(renderer);
    scene.environment = environment.texture;
    try {
      const presentation = createBotanicalPresentation(
        renderer,
        pixelSize,
        look
      );
      let disposed = false;
      return Object.freeze({
        dispose() {
          if (disposed) return;
          disposed = true;
          presentation.dispose();
          environment.dispose();
          renderer.dispose();
        },
        pixelSize,
        present(renderScene: Scene, camera: Camera) {
          presentation.present(renderScene, camera);
        },
        renderer,
      });
    } catch (error) {
      environment.dispose();
      throw error;
    }
  } catch (error) {
    renderer.dispose();
    throw error;
  }
}

export type Accumulation = Readonly<{
  cancel(): void;
  ready: Promise<void>;
}>;

type AccumulationOptions = Readonly<{
  camera: OrthographicCamera;
  onFrame?: (completed: number) => void;
  random: Rng;
  samples: number;
  scene: Scene;
  studio: BotanicalStudio;
  surface: RenderSurface;
}>;

function scheduleFrame(callback: () => void): () => void {
  if (
    typeof requestAnimationFrame === "function" &&
    (typeof document === "undefined" || document.visibilityState !== "hidden")
  ) {
    const frame = requestAnimationFrame(callback);
    return () => {
      if (typeof cancelAnimationFrame === "function")
        cancelAnimationFrame(frame);
    };
  }
  const timer = setTimeout(callback, 0);
  return () => clearTimeout(timer);
}

export function accumulate({
  camera,
  onFrame,
  random,
  samples,
  scene,
  studio,
  surface,
}: AccumulationOptions): Accumulation {
  let unschedule: (() => void) | undefined;
  let completed = 0;
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
  const render = () => {
    unschedule = undefined;
    if (settled) return;
    try {
      studio.sample(random);
      camera.setViewOffset(
        surface.pixelSize,
        surface.pixelSize,
        random() - 0.5,
        random() - 0.5,
        surface.pixelSize,
        surface.pixelSize
      );
      surface.present(scene, camera);
      camera.clearViewOffset();
      completed += 1;
      onFrame?.(completed);
      if (settled) return;
      if (completed === samples) finish();
      else unschedule = scheduleFrame(render);
    } catch (error) {
      camera.clearViewOffset();
      settled = true;
      rejectReady(error);
    }
  };
  queueMicrotask(render);
  return Object.freeze({
    cancel() {
      unschedule?.();
      unschedule = undefined;
      finish();
    },
    ready,
  });
}

type RenderSceneOptions = RenderOptions &
  Readonly<{
    build(): Omit<AccumulationOptions, "onFrame" | "samples" | "surface"> & {
      dispose(): void;
    };
    look?: RenderSurfaceOptions["look"];
    preserveDrawingBuffer?: boolean;
    samples?: number;
  }>;

export function renderScene({
  build,
  canvas,
  look = "luminous",
  onProgress,
  pixelSize,
  preserveDrawingBuffer = false,
  samples = BOTANICAL_STUDIO.samples,
  signal,
  size = 480,
}: RenderSceneOptions): RenderedFlower {
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_GL_PIXEL_SIZE)
    throw new RangeError(
      `GL size must be an integer from 1 to ${MAX_GL_PIXEL_SIZE}`
    );
  if (!Number.isInteger(samples) || samples < 1 || samples > 256)
    throw new RangeError("samples must be an integer from 1 to 256");
  if (typeof preserveDrawingBuffer !== "boolean")
    throw new TypeError("preserveDrawingBuffer must be a boolean");
  const renderPixelSize = resolveRenderPixelSize(size, pixelSize);

  let accumulation: Accumulation | undefined;
  let built: ReturnType<RenderSceneOptions["build"]> | undefined;
  let surface: RenderSurface | undefined;
  let unschedule: (() => void) | undefined;
  let compiling = false;
  let disposed = false;
  let settled = false;
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
    unschedule?.();
    unschedule = undefined;
    signal?.removeEventListener("abort", dispose);
    accumulation?.cancel();
    accumulation = undefined;
    // Three polls material/program state until compileAsync settles.
    if (compiling) return;
    built?.dispose();
    built = undefined;
    surface?.dispose();
    surface = undefined;
  };
  const fail = (error: unknown) => {
    if (disposed) return;
    cleanup();
    if (!settled) {
      settled = true;
      rejectReady(error);
    }
    report("failed", {}, false);
  };
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    report("disposed", {}, false);
    cleanup();
    finish();
  }
  const start = async () => {
    unschedule = undefined;
    if (disposed) return;
    try {
      report("building");
      if (disposed) return;
      built = build();
      if (disposed) {
        cleanup();
        return;
      }
      surface = createRenderSurface({
        canvas,
        look,
        pixelSize: renderPixelSize,
        preserveDrawingBuffer,
        scene: built.scene,
        size,
      });
      if (disposed) {
        cleanup();
        return;
      }
      report("compiling");
      if (disposed) return;
      compiling = true;
      try {
        await surface.renderer.compileAsync(built.scene, built.camera);
      } finally {
        compiling = false;
        if (disposed) cleanup();
      }
      if (disposed) return;
      report("rendering", { completed: 0, total: samples });
      if (disposed) return;
      accumulation = accumulate({
        ...built,
        onFrame: (completed) =>
          report("rendering", { completed, total: samples }),
        samples,
        surface,
      });
      void accumulation.ready.then(() => {
        if (disposed) return;
        try {
          report("ready", { completed: samples, total: samples });
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
    unschedule = scheduleFrame(() => void start());
  }
  return {
    dispose,
    get phase() {
      return phase;
    },
    ready,
  };
}
