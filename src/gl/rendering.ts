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

export function accumulate({
  camera,
  onFrame,
  random,
  samples,
  scene,
  studio,
  surface,
}: AccumulationOptions): Accumulation {
  let animationFrame = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
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
  const clearSchedule = () => {
    if (animationFrame && typeof cancelAnimationFrame === "function")
      cancelAnimationFrame(animationFrame);
    if (timer !== undefined) clearTimeout(timer);
    animationFrame = 0;
    timer = undefined;
  };
  const render = () => {
    clearSchedule();
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
      else if (
        typeof requestAnimationFrame === "function" &&
        (typeof document === "undefined" ||
          document.visibilityState !== "hidden")
      )
        animationFrame = requestAnimationFrame(render);
      else timer = setTimeout(render, 0);
    } catch (error) {
      camera.clearViewOffset();
      settled = true;
      rejectReady(error);
    }
  };
  queueMicrotask(render);
  return Object.freeze({
    cancel() {
      clearSchedule();
      finish();
    },
    ready,
  });
}
