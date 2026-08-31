import {
  buildPlumeriaScene,
  type PlumeriaSceneOptions,
} from "@/src/gl/plumeria-scene";
import {
  type Accumulation,
  accumulate,
  createRenderSurface,
  MAX_GL_PIXEL_SIZE,
  type RenderSurface,
  resolveRenderPixelSize,
} from "@/src/gl/rendering";
import { BOTANICAL_STUDIO } from "@/src/gl/studio";
import { createRng } from "@/src/shared/prng";

export {
  type DisposablePlumeriaScene,
  type PlumeriaScene,
  type PlumeriaSceneOptions,
  plumeriaScene,
} from "@/src/gl/plumeria-scene";

export type RenderPlumeriaOptions = PlumeriaSceneOptions & {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  /** Backing-buffer width and height. Defaults to the studio sampling scale. */
  pixelSize?: number;
  /** Rendered square size in CSS pixels. */
  size?: number;
  /** Number of accumulation frames. Defaults to the four-frame studio contract. */
  samples?: number;
};

export type RenderedPlumeria = {
  cultivar: string;
  /** Resolves after accumulation, or early when disposal cancels it. */
  ready: Promise<void>;
  dispose: () => void;
};

export function renderPlumeria({
  canvas,
  pixelSize,
  size = 480,
  samples = BOTANICAL_STUDIO.samples,
  ...options
}: RenderPlumeriaOptions): RenderedPlumeria {
  if (!Number.isInteger(size) || size < 1 || size > MAX_GL_PIXEL_SIZE)
    throw new RangeError(
      `size must be an integer from 1 to ${MAX_GL_PIXEL_SIZE}`
    );
  if (!Number.isInteger(samples) || samples < 1 || samples > 256)
    throw new RangeError("samples must be an integer from 1 to 256");

  const renderPixelSize = resolveRenderPixelSize(size, pixelSize);
  const built = buildPlumeriaScene(options);
  const { camera, cultivar, scene } = built.portrait;
  let accumulation: Accumulation | undefined;
  let surface: RenderSurface | undefined;
  let cleaned = false;
  let disposed = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    accumulation?.cancel();
    accumulation = undefined;
    surface?.dispose();
    surface = undefined;
    built.portrait.dispose();
  };

  try {
    surface = createRenderSurface({
      canvas,
      look: options.look ?? "luminous",
      pixelSize: renderPixelSize,
      preserveDrawingBuffer: true,
      scene,
      size,
    });
    accumulation = accumulate({
      camera,
      random: createRng(`${options.seed}|${BOTANICAL_STUDIO.jitterNamespace}`),
      samples,
      scene,
      studio: built.studio,
      surface,
    });
    const ready = accumulation.ready.catch((error: unknown) => {
      cleanup();
      throw error;
    });
    return Object.freeze({
      cultivar,
      dispose() {
        if (disposed) return;
        disposed = true;
        cleanup();
      },
      ready,
    });
  } catch (error) {
    cleanup();
    throw error;
  }
}
