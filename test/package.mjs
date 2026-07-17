import { execFileSync } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(
  fileURLToPath(new URL("../package.json", import.meta.url))
);
const temporary = await mkdtemp(join(tmpdir(), "flowers-package-"));

function run(command, arguments_, cwd) {
  return execFileSync(command, arguments_, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function npm(arguments_, cwd) {
  return run(process.platform === "win32" ? "npm.cmd" : "npm", arguments_, cwd);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function createConsumer(path) {
  await mkdir(path, { recursive: true });
  await writeFile(
    join(path, "package.json"),
    `${JSON.stringify({ private: true, type: "module" }, null, 2)}\n`
  );
}

function typeCheck(path) {
  run(
    process.execPath,
    [
      join(root, "node_modules", "typescript", "bin", "tsc"),
      "-p",
      "tsconfig.json",
    ],
    path
  );
}

function tsconfig(emit) {
  return `${JSON.stringify(
    {
      compilerOptions: {
        module: "NodeNext",
        moduleResolution: "NodeNext",
        ...(emit ? { outDir: "build" } : { noEmit: true }),
        skipLibCheck: false,
        strict: true,
        target: "ES2022",
      },
      include: ["consumer.ts"],
    },
    null,
    2
  )}\n`;
}

try {
  const packDirectory = join(temporary, "pack");
  await mkdir(packDirectory);
  const [packed] = JSON.parse(
    npm(
      [
        "pack",
        "--json",
        "--ignore-scripts",
        "--pack-destination",
        packDirectory,
      ],
      root
    )
  );
  const manifest = JSON.parse(
    await readFile(join(root, "package.json"), "utf8")
  );
  if (packed.version !== manifest.version)
    throw new Error("packed version does not match package.json");
  const files = new Set(packed.files.map((file) => file.path));
  for (const file of [
    "README.md",
    "CHANGELOG.md",
    "dist/index.mjs",
    "dist/core/index.mjs",
    "dist/catalog/index.mjs",
    "dist/svg/index.mjs",
    "dist/gl/index.mjs",
    "dist/devkit/index.mjs",
    "dist/devkit/browser.mjs",
  ])
    if (!files.has(file)) throw new Error(`tarball is missing ${file}`);
  if (
    [...files].some(
      (file) => /^(scripts|test)\//.test(file) || file.endsWith(".html")
    )
  )
    throw new Error("tarball contains repository-only tools");

  const tarball = join(packDirectory, packed.filename);
  const bare = join(temporary, "bare");
  await createConsumer(bare);
  npm(["install", "--ignore-scripts", tarball], bare);
  if (await exists(join(bare, "node_modules", "three")))
    throw new Error("a root-only install included Three.js");

  await writeFile(
    join(bare, "consumer.ts"),
    `
      import {
        createFlowerCatalog,
        defineCultivar,
        defineFlowerPack,
        defineSpecies,
        grow,
        pigment,
        renderSvg,
      } from "@nbot/flowers";
      import { catalogStudies, daisy } from "@nbot/flowers/catalog";
      import { assertSpeciesContract, createSpeciesStudy } from "@nbot/flowers/devkit";

      type Value = Readonly<{ color: \`#\${string}\` }>;
      type Traits = Readonly<{ color: \`#\${string}\`; radius: number }>;

      const white = defineCultivar<Value>({
        id: "white",
        name: "White",
        value: { color: "#fffdf8" as const },
      });
      const poppy = defineSpecies<Traits, Value>({
        defaultCultivar: white,
        defaultEnvironment: {},
        develop({ anatomy, genome }) {
          const petal = anatomy.ellipsoid({ id: "petal", radii: [genome.traits.radius, 0.4, 0.08] });
          const part = anatomy.part({ geometry: petal, pigment: pigment.solid(genome.traits.color), tissue: anatomy.tissues.petal() });
          return anatomy.flower({ parts: [part], roots: [anatomy.organ({ id: "petal", part, semantic: "petal" })] });
        },
        id: "@garden/alpine:poppy",
        name: "Alpine poppy",
        sample({ cultivar, random }) {
          return { color: cultivar.value.color, radius: random.range("petal.radius", 0.7, 0.9) };
        },
      });
      const study = createSpeciesStudy(poppy, [
        { id: "reference", intent: "reference", seed: "reference" },
        { id: "compact", intent: "compact boundary", seed: "compact" },
        { id: "expanded", intent: "expanded boundary", seed: "expanded" },
      ]);
      const pack = defineFlowerPack({ id: "@garden/alpine", species: [poppy] });
      const catalog = createFlowerCatalog([pack]);
      const specimen = grow(poppy, { seed: "package" });
      const restored = catalog.develop(JSON.parse(JSON.stringify(specimen.genome)));
      assertSpeciesContract(poppy, { study });
      if (!renderSvg(restored).startsWith("<svg")) throw new Error("SVG render failed");
      if (!renderSvg(grow(daisy, { seed: "package" })).startsWith("<svg")) throw new Error("catalog render failed");
      if (catalogStudies.length !== 3) throw new Error("catalog studies are missing");
    `
  );
  await writeFile(join(bare, "tsconfig.json"), tsconfig(true));
  typeCheck(bare);
  run(process.execPath, [join(bare, "build", "consumer.js")], bare);

  const gl = join(temporary, "gl");
  await createConsumer(gl);
  npm(["install", "--ignore-scripts", tarball], gl);
  await symlink(
    join(root, "node_modules", "three"),
    join(gl, "node_modules", "three"),
    "junction"
  );
  await mkdir(join(gl, "node_modules", "@types"), { recursive: true });
  await symlink(
    join(root, "node_modules", "@types", "three"),
    join(gl, "node_modules", "@types", "three"),
    "junction"
  );
  await writeFile(
    join(gl, "consumer.ts"),
    `
      import type { Scene } from "three";
      import { flowerScene, renderFlower, renderPlumeria, type FlowerScene } from "@nbot/flowers/gl";
      import { assertSpeciesMedia, mountFlowerWorkbench } from "@nbot/flowers/devkit/browser";
      declare const flower: FlowerScene;
      const scene: Scene = flower.scene;
      void assertSpeciesMedia;
      void flowerScene;
      void mountFlowerWorkbench;
      void renderFlower;
      void renderPlumeria;
      void scene;
    `
  );
  await writeFile(join(gl, "tsconfig.json"), tsconfig(false));
  typeCheck(gl);

  console.log("package: bare and GL consumers passed");
} finally {
  await rm(temporary, { force: true, recursive: true });
}
