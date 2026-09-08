import { OrthographicCamera, Scene, WebGLRenderer } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { daisy } from "@/src/catalog";
import { grow } from "@/src/core";
import {
  type FlowerRenderProgress,
  type RenderedFlower,
  renderFlower,
} from "@/src/gl/flower";
import { renderPlumeria } from "@/src/gl/plumeria";
import { renderScene } from "@/src/gl/rendering";
import { plumeriaVariants } from "@/src/plumeria/variants";

const gpu = vi.hoisted(() => ({
  compile: vi.fn<() => Promise<void>>(),
  dispose: vi.fn(),
  environmentDispose: vi.fn(),
  present: vi.fn(),
  presentationDispose: vi.fn(),
}));

vi.mock("three", async (importOriginal) => ({
  ...(await importOriginal<typeof import("three")>()),
  WebGLRenderer: vi.fn(function RendererMock() {
    return {
      compileAsync: gpu.compile,
      dispose: gpu.dispose,
      setClearColor() {},
      setPixelRatio() {},
      setSize() {},
      shadowMap: {},
    };
  }),
}));

vi.mock("@/src/gl/studio", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/gl/studio")>()),
  createBotanicalEnvironment: () => ({
    dispose: gpu.environmentDispose,
    texture: null,
  }),
  createBotanicalPresentation: () => ({
    dispose: gpu.presentationDispose,
    present: gpu.present,
  }),
}));

type Controls = {
  onProgress?: (progress: FlowerRenderProgress) => void;
  signal?: AbortSignal;
};
const canvas = {} as HTMLCanvasElement;
const specimen = grow(daisy, { seed: "lifecycle" });
const variant = plumeriaVariants.find(
  (entry) => entry.id === "@nbot/flowers:plumeria/celadine"
);
const renderers = [
  {
    name: "generic",
    start: (controls: Controls) =>
      renderFlower({ canvas, size: 64, specimen, ...controls }),
  },
  {
    name: "plumeria",
    start: (controls: Controls) =>
      renderPlumeria({
        canvas,
        seed: "reference",
        size: 64,
        variant,
        ...controls,
      }),
  },
];
let jobs: RenderedFlower[];

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  gpu.compile.mockReset().mockResolvedValue(undefined);
  gpu.present.mockReset();
  jobs = [];
});

afterEach(() => {
  for (const job of jobs) job.dispose();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

for (const renderer of renderers) {
  describe(`${renderer.name} render lifecycle`, () => {
    const start = (controls: Controls = {}) => {
      const job = renderer.start(controls);
      jobs.push(job);
      // Intermediate-state assertions run before individual tests await ready.
      void job.ready.catch(() => {});
      return job;
    };

    it("returns a queued handle before allocating GL, then reports the four actual frames", async () => {
      const events: FlowerRenderProgress[] = [];
      const job = start({ onProgress: (event) => events.push(event) });
      expect(Object.isFrozen(job)).toBe(true);
      expect(job.phase).toBe("queued");
      expect(WebGLRenderer).not.toHaveBeenCalled();
      expect(events).toEqual([{ phase: "queued" }]);
      await vi.runAllTimersAsync();
      await job.ready;
      expect(job.phase).toBe("ready");
      expect(gpu.compile).toHaveBeenCalledOnce();
      expect(gpu.present).toHaveBeenCalledTimes(4);
      expect(events).toEqual([
        { phase: "queued" },
        { phase: "building" },
        { phase: "compiling" },
        ...[0, 1, 2, 3, 4].map((completed) => ({
          completed,
          phase: "rendering",
          total: 4,
        })),
        { completed: 4, phase: "ready", total: 4 },
      ]);
      expect(events.every(Object.isFrozen)).toBe(true);
      expect(gpu.dispose).not.toHaveBeenCalled();
      job.dispose();
      job.dispose();
      expect(job.phase).toBe("disposed");
      expect(gpu.dispose).toHaveBeenCalledOnce();
      expect(gpu.environmentDispose).toHaveBeenCalledOnce();
      expect(gpu.presentationDispose).toHaveBeenCalledOnce();
    });

    it.each([
      "before",
      "queued",
    ])("can abort %s startup without allocating GL", async (when) => {
      const controller = new AbortController();
      if (when === "before") controller.abort();
      const job = start({ signal: controller.signal });
      if (when === "queued") controller.abort();
      await job.ready;
      await vi.runAllTimersAsync();
      expect(job.phase).toBe("disposed");
      expect(WebGLRenderer).not.toHaveBeenCalled();
      expect(gpu.present).not.toHaveBeenCalled();
    });

    it("can dispose reentrantly before building", async () => {
      const job = start({
        onProgress(event) {
          if (event.phase === "building") job.dispose();
        },
      });
      await vi.runAllTimersAsync();
      await job.ready;
      expect(job.phase).toBe("disposed");
      expect(WebGLRenderer).not.toHaveBeenCalled();
    });

    it("waits for shader compilation before presenting", async () => {
      let finish!: () => void;
      gpu.compile.mockReturnValueOnce(
        new Promise<void>((resolve) => {
          finish = resolve;
        })
      );
      const job = start();
      await vi.runAllTimersAsync();
      expect(job.phase).toBe("compiling");
      expect(gpu.present).not.toHaveBeenCalled();
      finish();
      await vi.runAllTimersAsync();
      await job.ready;
      expect(job.phase).toBe("ready");
      expect(gpu.present).toHaveBeenCalledTimes(4);
    });

    it("cancels immediately but keeps compilation resources alive until the compiler settles", async () => {
      let finish!: () => void;
      gpu.compile.mockReturnValueOnce(
        new Promise<void>((resolve) => {
          finish = resolve;
        })
      );
      const clear = vi.spyOn(Scene.prototype, "clear");
      const controller = new AbortController();
      const job = start({ signal: controller.signal });
      await vi.runAllTimersAsync();
      expect(job.phase).toBe("compiling");
      controller.abort();
      await job.ready;
      expect(job.phase).toBe("disposed");
      expect(gpu.dispose).not.toHaveBeenCalled();
      expect(clear).not.toHaveBeenCalled();
      finish();
      await vi.runAllTimersAsync();
      expect(gpu.present).not.toHaveBeenCalled();
      expect(gpu.dispose).toHaveBeenCalledOnce();
      expect(gpu.environmentDispose).toHaveBeenCalledOnce();
      expect(gpu.presentationDispose).toHaveBeenCalledOnce();
      expect(clear).toHaveBeenCalledOnce();
    });

    it("can cancel from the first real frame without scheduling more", async () => {
      const job = start({
        onProgress(event) {
          if (event.phase === "rendering" && event.completed === 1)
            job.dispose();
        },
      });
      await vi.runAllTimersAsync();
      await job.ready;
      expect(job.phase).toBe("disposed");
      expect(gpu.present).toHaveBeenCalledOnce();
      expect(gpu.dispose).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    });

    it.each([
      "compilation",
      "presentation",
    ])("rejects %s failures and releases resources", async (stage) => {
      const error = new Error(stage);
      if (stage === "compilation") gpu.compile.mockRejectedValueOnce(error);
      else
        gpu.present.mockImplementationOnce(() => {
          throw error;
        });
      const clear = vi.spyOn(Scene.prototype, "clear");
      const job = start();
      const rejected = job.ready.catch((reason) => reason);
      await vi.runAllTimersAsync();
      expect(await rejected).toBe(error);
      expect(job.phase).toBe("failed");
      expect(gpu.dispose).toHaveBeenCalledOnce();
      expect(gpu.environmentDispose).toHaveBeenCalledOnce();
      expect(gpu.presentationDispose).toHaveBeenCalledOnce();
      expect(clear).toHaveBeenCalledOnce();
      job.dispose();
      expect(gpu.dispose).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    });

    it.each([
      "building",
      "compiling",
      "rendering",
      "ready",
    ] as const)("rejects an observer exception during %s instead of leaving ready pending", async (phase) => {
      const error = new Error("observer failed");
      const job = start({
        onProgress(event) {
          if (event.phase === phase) throw error;
        },
      });
      const rejected = job.ready.catch((reason) => reason);
      await vi.runAllTimersAsync();
      expect(await rejected).toBe(error);
      expect(job.phase).toBe("failed");
      expect(gpu.dispose).toHaveBeenCalledTimes(phase === "building" ? 0 : 1);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("preserves the failure even if its observer disposes the handle", async () => {
      const error = new Error("compilation failed");
      gpu.compile.mockRejectedValueOnce(error);
      const job = start({
        onProgress(event) {
          if (event.phase === "failed") job.dispose();
        },
      });
      const rejected = job.ready.catch((reason) => reason);
      await vi.runAllTimersAsync();
      expect(await rejected).toBe(error);
      expect(job.phase).toBe("disposed");
      expect(gpu.dispose).toHaveBeenCalledOnce();
    });

    it.each([
      "visible",
      "hidden",
    ])("uses the matching scheduler in a %s document", async (visibilityState) => {
      const frame = vi.fn((callback: FrameRequestCallback) =>
        setTimeout(() => callback(0), 16)
      );
      vi.stubGlobal("document", { visibilityState });
      vi.stubGlobal("requestAnimationFrame", frame);
      vi.stubGlobal("cancelAnimationFrame", clearTimeout);
      const job = start();
      await vi.runAllTimersAsync();
      await job.ready;
      expect(job.phase).toBe("ready");
      expect(frame).toHaveBeenCalledTimes(
        visibilityState === "visible" ? 4 : 0
      );
      expect(gpu.present).toHaveBeenCalledTimes(4);
    });
  });
}

it("releases a scene returned by a build that was cancelled reentrantly", async () => {
  const controller = new AbortController();
  const dispose = vi.fn();
  const job = renderScene({
    canvas,
    signal: controller.signal,
    build() {
      controller.abort();
      return {
        camera: new OrthographicCamera(),
        scene: new Scene(),
        studio: { sample() {} },
        random: () => 0.5,
        dispose,
      };
    },
  });
  jobs.push(job);
  await vi.runAllTimersAsync();
  await job.ready;
  expect(job.phase).toBe("disposed");
  expect(dispose).toHaveBeenCalledOnce();
  expect(WebGLRenderer).not.toHaveBeenCalled();
});

it("keeps the plumeria sample override and reports its actual total", async () => {
  const events: FlowerRenderProgress[] = [];
  const job = renderPlumeria({
    canvas,
    seed: "reference",
    samples: 2,
    onProgress: (event) => events.push(event),
  });
  jobs.push(job);
  await vi.runAllTimersAsync();
  await job.ready;
  expect(gpu.present).toHaveBeenCalledTimes(2);
  expect(events.at(-1)).toEqual({ phase: "ready", completed: 2, total: 2 });
});

it("reports deferred plumeria construction errors through ready", async () => {
  const job = renderPlumeria({ canvas, seed: "reference", development: 2 });
  jobs.push(job);
  const rejected = job.ready.catch((reason) => reason);
  await vi.runAllTimersAsync();
  expect(await rejected).toBeInstanceOf(RangeError);
  expect(job.phase).toBe("failed");
  expect(WebGLRenderer).not.toHaveBeenCalled();
});

it("keeps the plumeria cultivar available immediately", async () => {
  const job = renderPlumeria({ canvas, seed: "reference", variant });
  jobs.push(job);
  expect(job.cultivar).toBe("celadine");
  job.dispose();
  await job.ready;
  expect(WebGLRenderer).not.toHaveBeenCalled();
});
