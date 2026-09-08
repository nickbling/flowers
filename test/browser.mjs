import { existsSync } from "node:fs";
import { copyFile, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { chromeExecutable, runChromePage } from "../scripts/chrome-page.mjs";

const root = process.cwd();
const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
]);

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(
      new URL(request.url ?? "/", "http://localhost").pathname
    );
    const file = resolve(
      root,
      `.${pathname === "/" ? "/workbench.html" : pathname}`
    );
    if (!file.startsWith(`${root}${sep}`)) throw new Error("outside workspace");
    response.setHeader(
      "content-type",
      contentTypes.get(extname(file)) ?? "application/octet-stream"
    );
    response.end(await readFile(file));
  } catch {
    response.statusCode = 404;
    response.end("not found");
  }
});

await new Promise((resolveListen, rejectListen) => {
  server.once("error", rejectListen);
  server.listen(0, "127.0.0.1", resolveListen);
});
const address = server.address();
if (!address || typeof address === "string")
  throw new Error("browser test server did not bind");

const directory = await mkdtemp(join(tmpdir(), "flowers-browser-"));
const screenshot = join(directory, "workbench.png");
let passed = false;

try {
  for (const species of ["daisy", "plumeria"]) {
    const { result, stderr } = await runChromePage({
      chrome: chromeExecutable("the browser test"),
      chromeArguments: [
        "--disable-gpu-sandbox",
        ...(process.platform === "darwin"
          ? ["--use-angle=metal"]
          : ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"]),
        "--hide-scrollbars",
      ],
      expression: `(async () => {
        const host = document.querySelector("div[data-specimens]");
        const gl = await import("/dist/gl/index.mjs");
        function watchCompilation(canvas, parallel = false) {
          const state = { compiling: false, complete: false, lost: 0, programs: new Set(), deleted: new Set() };
          const getContext = canvas.getContext.bind(canvas);
          let observed;
          canvas.getContext = (...args) => {
            const context = getContext(...args);
            if (context === observed) return context;
            observed = context;
            const getExtension = context.getExtension.bind(context);
            context.getExtension = name => {
              if (name === "KHR_parallel_shader_compile") return parallel ? { COMPLETION_STATUS_KHR: 0x91B1 } : null;
              const extension = getExtension(name);
              if (name === "WEBGL_lose_context" && extension) return {
                loseContext() { state.lost += 1; extension.loseContext(); },
                restoreContext() { extension.restoreContext(); },
              };
              return extension;
            };
            if (parallel) {
              const getProgramParameter = context.getProgramParameter.bind(context);
              context.getProgramParameter = (program, parameter) => parameter === 0x91B1
                ? context.isContextLost() ? null : state.complete
                : getProgramParameter(program, parameter);
            }
            const linkProgram = context.linkProgram.bind(context);
            context.linkProgram = program => { if (state.compiling) state.programs.add(program); return linkProgram(program); };
            const deleteProgram = context.deleteProgram.bind(context);
            context.deleteProgram = program => { state.deleted.add(program); return deleteProgram(program); };
            return context;
          };
          return state;
        }
        const programsReleased = state => state.programs.size > 0 && [...state.programs].every(program => state.deleted.has(program));
        const generic = ${JSON.stringify(species)} === "daisy";
        const render = generic ? gl.renderFlower : gl.renderPlumeria;
        const exportPng = generic ? gl.exportFlowerPng : gl.exportPlumeriaPng;
        const options = { seed: "browser-export" };
        if (generic) {
          const [{ grow }, { daisy }] = await Promise.all([
            import("/dist/core/index.mjs"),
            import("/dist/catalog/index.mjs"),
          ]);
          options.specimen = grow(daisy, { seed: options.seed });
        }
        const blob = await exportPng({ ...options, size: 256 });
        let progressFailure = "";
        try {
          await exportPng({
            ...options,
            onProgress(progress) {
              if (progress.phase === "ready") throw new Error("progress callback failed");
            },
            size: 64,
          });
        } catch (error) {
          progressFailure = error instanceof Error ? error.message : String(error);
        }
        const controller = new AbortController();
        const pending = exportPng({ ...options, signal: controller.signal, size: 64 });
        controller.abort(new Error("export aborted"));
        let abortRejected = false;
        try { await pending; }
        catch (error) { abortRejected = error === controller.signal.reason; }

        let modelReads = 0;
        if (generic) options.specimen = new Proxy(options.specimen, {
          get(target, key, receiver) {
            if (key === "model") modelReads += 1;
            return Reflect.get(target, key, receiver);
          },
        });
        let contextReads = 0;
        const canvas = document.createElement("canvas");
        canvas.getContext = () => { contextReads += 1; throw new Error("unexpected context"); };
        let lifecycle;
        lifecycle = render({
          ...options, canvas, size: 64,
          onProgress(progress) {
            if (progress.phase === "building") lifecycle.dispose();
          },
        });
        await lifecycle.ready;
        const disposedBeforeBuild = lifecycle.phase === "disposed" && modelReads === 0 && contextReads === 0;

        // Exercise Three's real delayed compilation poll without the optional extension.
        const compilationErrors = [];
        const onError = event => { compilationErrors.push(event.message); event.preventDefault(); };
        window.addEventListener("error", onError);
        const compileCanvas = document.createElement("canvas");
        const compiler = watchCompilation(compileCanvas);
        const compilingController = new AbortController();
        let cancelledDuringCompilation = false;
        const compilingRender = render({
          ...options, canvas: compileCanvas, signal: compilingController.signal, size: 64,
          onProgress(event) {
            compiler.compiling = event.phase === "compiling";
            if (compiler.compiling) setTimeout(() => {
              cancelledDuringCompilation = compilingRender.phase === "compiling";
              compilingController.abort();
            }, 0);
          },
        });
        await compilingRender.ready;
        // With no parallel-compile extension, Three checks readiness after 10 ms.
        await new Promise(resolve => setTimeout(resolve, 30));
        compilingRender.dispose();
        const compilationReleased = programsReleased(compiler);

        let workbenchCancellation = null;
        if (!generic) {
          const { createPlumeriaWorkbenchEntry, mountFlowerWorkbench } = await import("/dist/devkit/browser.mjs");
          const entry = createPlumeriaWorkbenchEntry({ seed: "browser-cancel", samples: 4 });
          const target = document.createElement("div");
          document.body.append(target);
          let watched;
          // Hold the supported-extension path pending until after workbench cancellation.
          const workbench = mountFlowerWorkbench(target, {
            entries: [{ ...entry, renderGl(options) {
              watched = watchCompilation(options.canvas, true);
              return entry.renderGl({ ...options, onProgress(event) {
                options.onProgress(event);
                watched.compiling = event.phase === "compiling";
                if (watched.compiling) setTimeout(() => workbench.dispose(), 0);
              } });
            } }],
            glViews: ["final"], svgGrounds: [], size: 128,
          });
          await workbench.ready;
          watched.complete = true;
          await new Promise(resolve => setTimeout(resolve, 30));
          workbenchCancellation = watched.lost === 0 && programsReleased(watched);
          target.remove();
        }
        window.removeEventListener("error", onError);
        const image = await createImageBitmap(blob);
        const probe = document.createElement("canvas");
        probe.width = image.width;
        probe.height = image.height;
        const context = probe.getContext("2d");
        context.drawImage(image, 0, 0);
        const cornerAlpha = context.getImageData(0, 0, 1, 1).data[3];
        image.close();
        const png = new Uint8Array(await blob.arrayBuffer());
        const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
        return {
          abortRejected,
          cancelledDuringCompilation,
          compilationErrors,
          compilationReleased,
          cornerAlpha,
          disposedBeforeBuild,
          duplicateSvgIds: Number(document.body.dataset.duplicateSvgIds),
          mediaIssues: Number(document.body.dataset.mediaIssues),
          mediaReports: Number(document.body.dataset.mediaReports),
          pngBytes: png.byteLength,
          pngHeight: view.getUint32(20),
          pngType: blob.type,
          pngWidth: view.getUint32(16),
          progressFailure,
          ready: host?.dataset.ready,
          specimens: Number(host?.dataset.specimens),
          workbenchCancellation,
        };
      })()`,
      screenshot,
      timeout: 120_000,
      url: `http://127.0.0.1:${address.port}/workbench.html?case=reference&eager-frames&mode=study&size=128&species=${species}`,
      viewport: { height: 900, width: 1440 },
    });

    if (
      /Shader Error|VALIDATE_STATUS false|WebGL: INVALID|Too many active WebGL contexts/i.test(
        stderr
      )
    )
      throw new Error(`${species} browser renderer failure\n${stderr}`);
    if (
      result.ready !== "true" ||
      result.specimens !== 1 ||
      result.mediaReports !== 1 ||
      result.mediaIssues !== 0 ||
      result.duplicateSvgIds !== 0 ||
      result.cornerAlpha !== 0 ||
      result.pngType !== "image/png" ||
      result.pngWidth !== 256 ||
      result.pngHeight !== 256 ||
      result.pngBytes < 5_000 ||
      result.progressFailure !== "progress callback failed" ||
      !result.disposedBeforeBuild ||
      !result.abortRejected ||
      !result.cancelledDuringCompilation ||
      result.compilationErrors.length !== 0 ||
      !result.compilationReleased ||
      (species === "plumeria" && !result.workbenchCancellation)
    )
      throw new Error(
        `${species} workbench contract failed: ${JSON.stringify(result)}`
      );

    if ((await stat(screenshot)).size < 10_000)
      throw new Error(`${species} browser screenshot is unexpectedly empty`);
  }

  passed = true;
  console.log(
    "browser: generic and plumeria renderers passed SVG, GL and media checks"
  );
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
  const artifact = join(root, "browser-failure.png");
  if (passed) await rm(artifact, { force: true });
  else if (existsSync(screenshot)) {
    await copyFile(screenshot, artifact);
    process.stderr.write(`Browser artifact: ${artifact}\n`);
  }
  await rm(directory, { force: true, recursive: true });
}
