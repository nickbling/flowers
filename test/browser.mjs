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
        let blob;
        let progressFailure = "";
        let abortRejected = false;
        let disposedBeforeBuild = false;
        if (${JSON.stringify(species)} === "daisy") {
          const [{ grow }, { daisy }] = await Promise.all([
            import("/dist/core/index.mjs"),
            import("/dist/catalog/index.mjs"),
          ]);
          const specimen = grow(daisy, { seed: "browser-export" });
          blob = await gl.exportFlowerPng({ size: 256, specimen });
          try {
            await gl.exportFlowerPng({
              onProgress(progress) {
                if (progress.phase === "ready")
                  throw new Error("progress callback failed");
              },
              size: 64,
              specimen,
            });
          } catch (error) {
            progressFailure = error instanceof Error ? error.message : String(error);
          }
          let modelReads = 0;
          const observed = new Proxy(specimen, {
            get(target, key, receiver) {
              if (key === "model") modelReads += 1;
              return Reflect.get(target, key, receiver);
            },
          });
          let lifecycle;
          lifecycle = gl.renderFlower({
            canvas: document.createElement("canvas"),
            onProgress(progress) {
              if (progress.phase === "building") lifecycle.dispose();
            },
            size: 64,
            specimen: observed,
          });
          await lifecycle.ready;
          disposedBeforeBuild = lifecycle.phase === "disposed" && modelReads === 0;
        } else {
          blob = await gl.exportPlumeriaPng({
            seed: "browser-export",
            size: 256,
          });
          const controller = new AbortController();
          const pending = gl.exportPlumeriaPng({
            seed: "browser-export",
            signal: controller.signal,
            size: 64,
          });
          controller.abort(new Error("export aborted"));
          try {
            await pending;
          } catch (error) {
            abortRejected = error === controller.signal.reason;
          }
        }
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
      (species === "daisy" &&
        (result.progressFailure !== "progress callback failed" ||
          !result.disposedBeforeBuild)) ||
      (species === "plumeria" && !result.abortRejected)
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
