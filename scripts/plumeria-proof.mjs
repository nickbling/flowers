import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { gzipSync } from "node:zlib";
import { build } from "tsdown";
import { runChromePage } from "./chrome-page.mjs";

const { values } = parseArgs({
  options: {
    out: { type: "string" },
    seed: { type: "string", default: "reference" },
    date: { type: "string", default: "2026-08-15" },
    paired: { type: "boolean", default: false },
    albedo: { type: "boolean", default: false },
    normals: { type: "boolean", default: false },
    "no-shadows": { type: "boolean", default: false },
    benchmark: { type: "boolean", default: false },
    cultivar: { type: "string", default: "celadine" },
    views: { type: "string", default: "top,oblique,side,underside,detail" },
    size: { type: "string", default: "768" },
    samples: { type: "string", default: "1" },
    development: { type: "string", default: "1" },
    clay: { type: "boolean", default: false },
    flat: { type: "boolean", default: false },
    reverse: { type: "boolean", default: false },
    production: { type: "boolean", default: false },
  },
});
if (!values.out)
  throw new Error("--out must name an external evidence directory");
for (const [name, maximum] of [
  ["size", 2048],
  ["samples", 256],
]) {
  const number = Number(values[name]);
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum)
    throw new RangeError(`Invalid ${name}`);
}
if (Number(values.samples) > 1 && (!values.production || values.reverse))
  throw new Error(
    "Accumulation requires production lighting without --reverse"
  );
const root = process.cwd();
const out = resolve(values.out);
if (out.startsWith(`${root}${sep}`))
  throw new Error("Evidence must stay outside the repository");
await mkdir(out, { recursive: true });
await writeFile(
  resolve(out, "runner.mjs"),
  await readFile(import.meta.filename)
);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function hashes(directory) {
  const result = {};
  for (const entry of await readdir(directory, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile()) continue;
    const path = resolve(entry.parentPath, entry.name);
    result[
      path.startsWith(`${root}${sep}`) ? path.slice(root.length + 1) : path
    ] = hash(await readFile(path));
  }
  return result;
}
if (values.production)
  await build({
    config: false,
    entry: {
      scene: "src/gl/plumeria-scene.ts",
      studio: "src/gl/studio.ts",
      rendering: "src/gl/rendering.ts",
      random: "src/shared/prng.ts",
    },
    outDir: resolve(out, "runtime"),
    dts: false,
    clean: true,
  });
const manifest = {
  options: values,
  source: await hashes("src"),
  build: await hashes("dist"),
  proofRuntime: values.production ? await hashes(resolve(out, "runtime")) : {},
  runner: hash(await readFile(import.meta.filename)),
  staged: existsSync(resolve(root, ".git"))
    ? execFileSync("git", ["diff", "--cached", "--name-only"], {
        encoding: "utf8",
      })
    : null,
  captures: [],
};

async function browser(options, view) {
  const T = await import("three");
  const { plumeriaScene, buildPlumeriaScene } = await import(
    options.production ? "/runtime/scene.mjs" : "/dist/gl/index.mjs"
  );
  const { plumeria, plumeriaVariants } = await import("/dist/index.mjs");
  const variant = plumeriaVariants.find(
    (entry) => entry.name === options.cultivar || entry.id === options.cultivar
  );
  if (!variant) throw new Error(`Unknown cultivar: ${options.cultivar}`);
  const optionsForScene = {
    seed: options.seed,
    variant,
    date: options.date,
    debugView: options.clay ? "clay" : "final",
    development: Number(options.development),
  };
  const timings = {};
  if (options.benchmark && options.svg) {
    for (const [name, make, count] of [
      [
        "svg",
        () => plumeria({ seed: options.seed, variant, date: options.date }),
        30,
      ],
      ["scene", () => plumeriaScene(optionsForScene), 10],
    ]) {
      const measured = [];
      for (let i = -5; i < count; i += 1) {
        const start = performance.now();
        const result = make();
        const elapsed = performance.now() - start;
        result.dispose?.();
        if (i >= 0) measured.push(elapsed);
      }
      timings[name] = measured;
    }
  }
  if (options.svg) {
    const svg = plumeria({
      seed: options.seed,
      variant,
      date: options.date,
      size: Number(options.size),
    });
    const image = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = Number(options.size);
    canvas.getContext("2d").drawImage(image, 0, 0);
    URL.revokeObjectURL(url);
    if (options.benchmark) {
      timings.svgRasterReadback = [];
      for (let i = -3; i < 10; i += 1) {
        const start = performance.now();
        const sample = new Image();
        const sampleUrl = URL.createObjectURL(
          new Blob([svg], { type: "image/svg+xml" })
        );
        sample.src = sampleUrl;
        await sample.decode();
        canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
        canvas.getContext("2d").drawImage(sample, 0, 0);
        canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(sampleUrl);
        if (i >= 0) timings.svgRasterReadback.push(performance.now() - start);
      }
    }
    return {
      image: canvas.toDataURL(),
      svg,
      elements: new DOMParser()
        .parseFromString(svg, "image/svg+xml")
        .querySelectorAll("*").length,
      timings,
    };
  }
  const built = options.production ? buildPlumeriaScene(optionsForScene) : null;
  const portrait = built ? built.portrait : plumeriaScene(optionsForScene);
  const { scene, camera, length: L } = portrait;
  let surface;
  if (options.production) {
    const { createRenderSurface } = await import("/runtime/rendering.mjs");
    surface = createRenderSurface({
      canvas: document.createElement("canvas"),
      look: "luminous",
      pixelSize: Number(options.size),
      preserveDrawingBuffer: true,
      scene,
      size: Number(options.size),
    });
  }
  const renderer =
    surface?.renderer ??
    new T.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
      alpha: true,
    });
  if (!surface) {
    renderer.setSize(Number(options.size), Number(options.size));
    renderer.setClearColor("#e9e5df", 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFShadowMap;
  }
  document.body.append(renderer.domElement);
  const meshes = [];
  const diagnosticMaterials = [];
  scene.traverse((object) => {
    if (object.isMesh) {
      meshes.push(object);
      if (options.albedo || options.normals) {
        const material = options.normals
          ? new T.MeshNormalMaterial({ side: object.material.side })
          : new T.MeshBasicMaterial({
              vertexColors: object.material.vertexColors,
              map: object.material.map,
              side: object.material.side,
            });
        diagnosticMaterials.push(material);
        object.material = material;
        object.castShadow = object.receiveShadow = false;
      }
      if (options["no-shadows"])
        object.castShadow = object.receiveShadow = false;
      if (options.flat) {
        object.material.normalMap = null;
        object.material.bumpMap = null;
        object.material.needsUpdate = true;
      }
    }
    if (options.reverse && object.isLight && object.target) {
      object.position.x = 2 * object.target.position.x - object.position.x;
      object.position.y = 2 * object.target.position.y - object.position.y;
    }
  });
  const geometry = meshes[0].geometry;
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  const halfCount = position.count / 2;
  let maximumDepth = 0;
  for (let at = 0; at < halfCount; at += 1)
    maximumDepth = Math.max(
      maximumDepth,
      Math.abs(position.getZ(at) - position.getZ(at + halfCount)) / L
    );
  const sections = [0.5, 0.65, 0.8].map((along) => {
    let nearest = 0;
    for (let at = 0; at < halfCount; at += 1)
      if (Math.abs(uv.getY(at) - along) < Math.abs(uv.getY(nearest) - along))
        nearest = at;
    const row = Array.from({ length: halfCount }, (_, at) => at).filter(
      (at) => uv.getY(at) === uv.getY(nearest)
    );
    const first = row[0],
      last = row.at(-1),
      center = row[Math.floor(row.length / 2)];
    const axis = new T.Vector2(
      position.getX(last) - position.getX(first),
      position.getY(last) - position.getY(first)
    ).normalize();
    const loop = [...row, ...row.toReversed().map((at) => at + halfCount)];
    let area = 0;
    const across = (at) =>
      axis.x * position.getX(at) + axis.y * position.getY(at);
    for (let i = 0; i < loop.length; i += 1) {
      const a = loop[i],
        b = loop[(i + 1) % loop.length];
      area += across(a) * position.getZ(b) - across(b) * position.getZ(a);
    }
    return {
      along: uv.getY(nearest),
      depth: (position.getZ(center) - position.getZ(center + halfCount)) / L,
      area: Math.abs(area) / (2 * L * L),
    };
  });
  let target = new T.Vector3(0, 0, 0);
  let half = view === "throat" ? 0.22 * L : 1.18 * L;
  if (view === "base") {
    target.set(0, 0, position.getZ(0) + 0.1 * L);
    half = 0.14 * L;
  }
  if (
    ["detail", "petal", "section", "petal-front", "petal-side"].includes(view)
  ) {
    for (const mesh of meshes.slice(1)) mesh.visible = false;
    const box = new T.Box3().setFromObject(meshes[0]);
    target = box.getCenter(new T.Vector3());
    half = view === "detail" ? 0.22 * L : 0.62 * L;
  }
  const direction = {
    top: [0, 0, 1],
    throat: [0, 0, 1],
    oblique: [0.8, -1, 1],
    side: [0, -1, 0],
    underside: [0.7, -0.8, -1],
    base: [0.8, -1, -0.5],
    detail: [0.3, -0.4, 1],
    petal: [0.8, -1, 0.6],
    "petal-front": [0, 0, 1],
    "petal-side": [1, 0, 0],
    section: [1, 0, 0],
  }[view];
  if (!direction) throw new Error(`Unknown view: ${view}`);
  camera.left = camera.bottom = -half;
  camera.right = camera.top = half;
  camera.position
    .copy(target)
    .add(new T.Vector3(...direction).normalize().multiplyScalar(5 * L));
  camera.up.set(0, 1, 0);
  if (["side", "section", "petal-side", "base"].includes(view))
    camera.up.set(0, 0, 1);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  const start = performance.now();
  if (surface && Number(options.samples) > 1) {
    const { accumulate } = await import("/runtime/rendering.mjs");
    const { createRng } = await import("/runtime/random.mjs");
    await accumulate({
      camera,
      scene,
      studio: built.studio,
      random: createRng(`${options.seed}|studio`),
      samples: Number(options.samples),
      surface,
    }).ready;
  } else if (surface) surface.present(scene, camera);
  else renderer.render(scene, camera);
  const result = {
    timings,
    diagnostic: options.normals
      ? "view-space geometric normals; no pigment or normal map"
      : options.albedo
        ? "unlit pigment albedo (production map/vertex color); no studio/tone mapping/normal map"
        : options.clay
          ? "clay"
          : null,
    vertices: position.count,
    petalTriangles: geometry.index.count / 3,
    sharedGeometry: meshes
      .slice(0, 5)
      .every((mesh) => mesh.geometry === geometry),
    textureBytes: meshes[0].material.normalMap?.image.data.byteLength ?? 0,
    pigmentBytes: meshes[0].material.map?.image.data.byteLength ?? 0,
    milliseconds: performance.now() - start,
    calls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    maximumDepth,
    sections,
    camera: camera.position.toArray(),
    target: target.toArray(),
    half,
  };
  const image = renderer.domElement.toDataURL("image/png");
  if (options.benchmark) {
    timings.glSingleFramePresentReadback = [];
    for (let i = -3; i < 10; i += 1) {
      const start = performance.now();
      if (surface) surface.present(scene, camera);
      else renderer.render(scene, camera);
      renderer.getContext().finish();
      if (i >= 0)
        timings.glSingleFramePresentReadback.push(performance.now() - start);
    }
  }
  for (const material of diagnosticMaterials) material.dispose();
  portrait.dispose();
  if (surface) surface.dispose();
  else renderer.dispose();
  return { ...result, image };
}
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname === "/proof") {
      response.setHeader("content-type", "text/html");
      response.end(
        `<style>body{margin:0}</style><script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js"}}</script><script>window.capture=${browser.toString()};document.title="ready";</script>`
      );
      return;
    }
    const base = url.pathname.startsWith("/runtime/") ? out : root;
    const path = resolve(base, `.${url.pathname}`);
    if (!path.startsWith(`${base}${sep}`)) throw new Error("outside workspace");
    response.setHeader(
      "content-type",
      [".js", ".mjs"].includes(extname(path))
        ? "text/javascript"
        : "application/octet-stream"
    );
    response.end(await readFile(path));
  } catch {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
try {
  const { result } = await runChromePage({
    url: `http://127.0.0.1:${server.address().port}/proof`,
    timeout: 60_000,
    chromeArguments: [
      "--disable-gpu-sandbox",
      ...(process.platform === "darwin"
        ? ["--use-angle=metal"]
        : ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"]),
    ],
    expression: `(async()=>{
      const results=[];
      const options=${JSON.stringify(values)};
      if (!options.paired) {
        for(const view of options.views.split(",")) results.push({view,...await capture(options,view)});
        return results;
      }
      for (const size of [240,768]) for (const mode of ["svg","albedo","production"]) {
        const captured=await capture({...options, size:String(size), svg:mode==="svg", albedo:mode==="albedo", production:mode==="production", benchmark:options.benchmark&&size===240&&mode!=="albedo"},"top");
        const img=new Image(); img.src=captured.image; await img.decode();
        for (const [background,color] of [["light","#f5f2ed"],["dark","#242329"]]) {
          const canvas=document.createElement("canvas"); canvas.width=canvas.height=size;
          const ctx=canvas.getContext("2d"); ctx.fillStyle=color; ctx.fillRect(0,0,size,size);ctx.drawImage(img,0,0);
          results.push({...captured,view:mode+"-"+size+"-"+background,image:canvas.toDataURL()});
        }
      }
      return results;
    })()`,
  });
  for (const { image, svg, ...capture } of result) {
    if (svg) {
      const svgFile = `${capture.view}.svg`;
      await writeFile(resolve(out, svgFile), svg);
      capture.svg = {
        file: svgFile,
        sha256: hash(svg),
        bytes: Buffer.byteLength(svg),
        gzip: gzipSync(svg).length,
      };
    }
    const bytes = Buffer.from(image.split(",")[1], "base64");
    const file = `${capture.view}.png`;
    await writeFile(resolve(out, file), bytes);
    manifest.captures.push({ ...capture, file, sha256: hash(bytes) });
  }
  await writeFile(
    resolve(out, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  console.log(`${out}: ${manifest.captures.length} captures`);
} finally {
  server.closeAllConnections();
  server.close();
}
