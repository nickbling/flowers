import type { RenderedFlower, RenderFlowerOptions } from "@/src/gl/flower";
import { renderFlower } from "@/src/gl/flower";
import type {
  PlumeriaSceneOptions,
  RenderedPlumeria,
  RenderPlumeriaOptions,
} from "@/src/gl/plumeria";
import { renderPlumeria } from "@/src/gl/plumeria";
import { MAX_GL_PIXEL_SIZE, resolveRenderPixelSize } from "@/src/gl/rendering";

type ExportCanvas = HTMLCanvasElement | OffscreenCanvas;
type DisposableRender = Pick<
  RenderedFlower | RenderedPlumeria,
  "dispose" | "ready"
>;

export type ExportFlowerPngOptions = Omit<
  RenderFlowerOptions,
  "canvas" | "pixelSize" | "preserveDrawingBuffer"
>;

export type ExportPlumeriaPngOptions = PlumeriaSceneOptions &
  Readonly<{
    samples?: number;
    signal?: AbortSignal;
    size?: number;
  }>;

function exportCanvas(size: number): ExportCanvas {
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    return canvas;
  }
  if (typeof OffscreenCanvas !== "undefined")
    return new OffscreenCanvas(size, size);
  throw new Error("GL PNG export requires a browser canvas");
}

function releaseCanvas(canvas: ExportCanvas): void {
  canvas.width = 0;
  canvas.height = 0;
}

function png(canvas: ExportCanvas): Promise<Blob> {
  if ("convertToBlob" in canvas)
    return canvas.convertToBlob({ type: "image/png" });
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else
        reject(new Error("the browser could not encode the GL canvas as PNG"));
    }, "image/png");
  });
}

function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      }
    );
  });
}

async function renderPng(
  canvas: ExportCanvas,
  rendered: DisposableRender,
  signal?: AbortSignal
): Promise<Blob> {
  try {
    await abortable(rendered.ready, signal);
    signal?.throwIfAborted();
    return await abortable(png(canvas), signal);
  } finally {
    rendered.dispose();
    releaseCanvas(canvas);
  }
}

/** Renders a generic specimen to a transparent high-resolution PNG. */
export function exportFlowerPng({
  size = MAX_GL_PIXEL_SIZE,
  ...options
}: ExportFlowerPngOptions): Promise<Blob> {
  options.signal?.throwIfAborted();
  resolveRenderPixelSize(size, size);
  const canvas = exportCanvas(size);
  try {
    const rendered = renderFlower({
      ...options,
      canvas,
      pixelSize: size,
      preserveDrawingBuffer: true,
      size,
    });
    return renderPng(canvas, rendered, options.signal);
  } catch (error) {
    releaseCanvas(canvas);
    throw error;
  }
}

/** Renders a Plumeria to a transparent high-resolution PNG. */
export function exportPlumeriaPng({
  signal,
  size = MAX_GL_PIXEL_SIZE,
  ...options
}: ExportPlumeriaPngOptions): Promise<Blob> {
  signal?.throwIfAborted();
  resolveRenderPixelSize(size, size);
  const canvas = exportCanvas(size);
  try {
    const rendered = renderPlumeria({
      ...options,
      canvas,
      pixelSize: size,
      size,
    } as RenderPlumeriaOptions);
    return renderPng(canvas, rendered, signal);
  } catch (error) {
    releaseCanvas(canvas);
    throw error;
  }
}
