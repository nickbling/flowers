import type { FlowerSpecimen } from "@/src/core";
import { inspectSpecimen } from "@/src/devkit/contract";
import {
  compareRenderedFlowerMediaFrames,
  type FlowerMediaIdentity,
  type FlowerMediaReport,
} from "@/src/devkit/media";
import { renderPlumeria } from "@/src/gl";
import { type FlowerRenderProgress, renderFlower } from "@/src/gl/flower";
import { type PlumeriaOptions, plumeria } from "@/src/plumeria";
import { growPlumeria } from "@/src/plumeria/specimen";
import type { PlumeriaSelection } from "@/src/plumeria/variants";
import { fullMoon } from "@/src/shared/moon";
import { renderSvg } from "@/src/svg";

export {
  assertFlowerMedia,
  assertSpeciesMedia,
  type FlowerMediaColor,
  type FlowerMediaFrame,
  type FlowerMediaIssue,
  type FlowerMediaReport,
  type InspectFlowerMediaOptions,
  inspectFlowerMedia,
} from "@/src/devkit/media";

export type FlowerWorkbenchSpecimen = Readonly<{
  label?: string;
  specimen: FlowerSpecimen;
}>;

export type FlowerWorkbenchNote = Readonly<{
  code: string;
  message: string;
  path?: string;
}>;

export type FlowerWorkbenchRenderOptions = Readonly<{
  canvas: HTMLCanvasElement;
  debugView: FlowerWorkbenchGlView;
  onProgress: (progress: FlowerRenderProgress) => void;
  size: number;
}>;

export type FlowerWorkbenchRender = Readonly<{
  dispose(): void;
  ready: Promise<void>;
}>;

export type FlowerWorkbenchEntry = Readonly<{
  details?: readonly string[];
  identity: FlowerMediaIdentity;
  label: string;
  notes?: readonly FlowerWorkbenchNote[];
  renderGl(options: FlowerWorkbenchRenderOptions): FlowerWorkbenchRender;
  renderSvg(options: Readonly<{ idPrefix: string; size: number }>): string;
}>;

export type PlumeriaWorkbenchOptions = PlumeriaSelection &
  Readonly<{
    date?: PlumeriaOptions["date"];
    label?: string;
    samples?: number;
    seed: string;
  }>;

export type FlowerWorkbenchOptions = Readonly<{
  /** Renderer adapters for specialized or external flowers. */
  entries?: readonly FlowerWorkbenchEntry[];
  /** Grounds behind each GL snapshot. Defaults to gray. */
  glGrounds?: readonly FlowerWorkbenchGround[];
  /** GL columns to render. Defaults to final and clay. */
  glViews?: readonly FlowerWorkbenchGlView[];
  specimens?: readonly FlowerWorkbenchSpecimen[];
  size?: number;
  /** SVG ground columns to render. Defaults to all five review grounds. */
  svgGrounds?: readonly FlowerWorkbenchGround[];
  title?: string;
}>;

export type MountedFlowerWorkbench = Readonly<{
  dispose(): void;
  element: HTMLElement;
  /** Cross-media reports measured from the final SVG and GL frames. */
  media: Promise<readonly FlowerMediaReport[]>;
  ready: Promise<void>;
}>;

export type FlowerWorkbenchGround =
  | "paper"
  | "gray"
  | "black"
  | "color"
  | "checker";
export type FlowerWorkbenchGlView = "final" | "clay";

const GROUNDS: readonly FlowerWorkbenchGround[] = [
  "paper",
  "gray",
  "black",
  "color",
  "checker",
];
const GL_VIEWS: readonly FlowerWorkbenchGlView[] = ["final", "clay"];
let workbenchSequence = 0;

const STYLE = `
  :host { color-scheme: dark; }
  * { box-sizing: border-box; }
  .board {
    min-height: 100%;
    background: #100f0d;
    color: #e9e5dc;
    font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  header {
    position: sticky;
    z-index: 2;
    top: 0;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding: 11px 16px;
    border-bottom: 1px solid #ffffff14;
    background: #100f0def;
    backdrop-filter: blur(12px);
  }
  header strong { font: 600 14px/1.2 ui-sans-serif, system-ui; }
  main { display: grid; gap: 1px; background: #ffffff12; }
  section {
    display: grid;
    grid-template-columns: 240px repeat(var(--flower-views), minmax(160px, 1fr));
    min-height: 250px;
    background: #100f0d;
  }
  aside {
    min-width: 0;
    padding: 18px 14px;
    border-right: 1px solid #ffffff12;
    overflow-wrap: anywhere;
  }
  aside h2 {
    margin: 0 0 8px;
    font: 650 20px/1.1 ui-sans-serif, system-ui;
    letter-spacing: -0.03em;
    white-space: pre-line;
  }
  aside p { margin: 0; color: #aaa399; }
  aside details { margin-top: 12px; color: #d9a86c; }
  aside summary { cursor: pointer; }
  aside ul { margin: 7px 0 0; padding-left: 16px; }
  aside li + li { margin-top: 6px; }
  figure {
    position: relative;
    min-width: 0;
    margin: 0;
    aspect-ratio: 1;
    overflow: hidden;
  }
  figure > svg,
  figure > canvas { display: block; width: 100%; height: 100%; }
  .render-state {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: #77716b;
    color: #f7f4ed;
  }
  figure[data-has-frame="true"] .render-state {
    inset: auto 8px 8px auto;
    display: flex;
    gap: 7px;
    align-items: center;
    padding: 5px 8px;
    border-radius: 5px;
    background: #0c0b09c9;
  }
  .render-state::before {
    width: 34px;
    height: 34px;
    border: 2px solid #ffffff42;
    border-top-color: #fffaf0;
    border-radius: 50%;
    content: "";
    animation: flower-rendering 900ms linear infinite;
  }
  figure[data-has-frame="true"] .render-state::before {
    width: 12px;
    height: 12px;
  }
  @keyframes flower-rendering { to { transform: rotate(1turn); } }
  figure svg path,
  figure svg ellipse,
  figure svg use { fill: none; stroke: currentColor; }
  figcaption {
    position: absolute;
    right: 7px;
    bottom: 6px;
    left: 7px;
    width: fit-content;
    max-width: calc(100% - 14px);
    overflow: hidden;
    padding: 3px 6px;
    border-radius: 4px;
    background: #0c0b09c9;
    color: #f7f4ed;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .paper { background: #fffdf8; }
  .gray { background: #77716b; }
  .black { background: #0c0b0a; }
  .color { background: #284c7a; }
  .checker {
    background-color: #dedbd5;
    background-image:
      linear-gradient(45deg, #a7a39d 25%, transparent 25%),
      linear-gradient(-45deg, #a7a39d 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #a7a39d 75%),
      linear-gradient(-45deg, transparent 75%, #a7a39d 75%);
    background-position: 0 0, 0 10px, 10px -10px, -10px 0;
    background-size: 20px 20px;
  }
  @media (max-width: 1100px) {
    section { grid-template-columns: repeat(3, 1fr); }
    aside { grid-column: 1 / -1; min-height: 110px; }
  }
`;

function caption(text: string): HTMLElement {
  const element = document.createElement("figcaption");
  element.textContent = text;
  return element;
}

function specimenEntry(entry: FlowerWorkbenchSpecimen): FlowerWorkbenchEntry {
  const { specimen } = entry;
  const inspection = inspectSpecimen(specimen);
  return Object.freeze({
    details: Object.freeze([
      `${specimen.genome.species.id} · revision ${specimen.genome.species.revision}`,
      `seed ${specimen.genome.seed}`,
      `cultivar ${specimen.genome.cultivar.id} · revision ${specimen.genome.cultivar.revision}`,
      `${inspection.instances} instances`,
      `${inspection.geometries} geometries`,
      `${inspection.appearances} appearances`,
      ...(inspection.unbatchedGlInstances
        ? [`${inspection.unbatchedGlInstances} unbatched GL instances`]
        : []),
    ]),
    identity: Object.freeze({
      genomeId: specimen.model.genomeId,
      species: specimen.genome.species.id,
    }),
    label: entry.label?.trim() || specimen.genome.species.name,
    renderGl({ canvas, debugView, onProgress, size }) {
      return renderFlower({
        canvas,
        debugView,
        onProgress,
        preserveDrawingBuffer: true,
        size,
        specimen,
      });
    },
    renderSvg: ({ idPrefix, size }) => renderSvg(specimen, { idPrefix, size }),
  });
}

function assertEntry(entry: FlowerWorkbenchEntry, index: number): void {
  if (!entry || typeof entry !== "object")
    throw new TypeError(`flower workbench entry ${index} must be an object`);
  if (typeof entry.label !== "string" || !entry.label.trim())
    throw new TypeError(`flower workbench entry ${index} needs a label`);
  if (
    !entry.identity ||
    typeof entry.identity !== "object" ||
    typeof entry.identity.genomeId !== "string" ||
    !entry.identity.genomeId ||
    typeof entry.identity.species !== "string" ||
    !entry.identity.species
  )
    throw new TypeError(`flower workbench entry ${index} needs an identity`);
  if (
    typeof entry.renderSvg !== "function" ||
    typeof entry.renderGl !== "function"
  )
    throw new TypeError(`flower workbench entry ${index} needs both renderers`);
  if (
    entry.details !== undefined &&
    (!Array.isArray(entry.details) ||
      entry.details.some(
        (detail) => typeof detail !== "string" || !detail.trim()
      ))
  )
    throw new TypeError(`flower workbench entry ${index} has an empty detail`);
  if (
    entry.notes !== undefined &&
    (!Array.isArray(entry.notes) ||
      entry.notes.some(
        (note) =>
          !note ||
          typeof note !== "object" ||
          typeof note.code !== "string" ||
          !note.code ||
          typeof note.message !== "string" ||
          !note.message ||
          (note.path !== undefined && typeof note.path !== "string")
      ))
  )
    throw new TypeError(`flower workbench entry ${index} has an invalid note`);
}

/** Adapts the maintained plumeria portrait to the shared visual workbench. */
export function createPlumeriaWorkbenchEntry(
  options: PlumeriaWorkbenchOptions
): FlowerWorkbenchEntry {
  const samples = options.samples ?? 64;
  if (!Number.isSafeInteger(samples) || samples < 1 || samples > 256)
    throw new RangeError(
      "plumeria workbench samples must be an integer from 1 to 256"
    );
  const specimen = growPlumeria(
    options.seed,
    options.date ? fullMoon(options.date) : 0,
    options.cultivar,
    options.variant
  );
  const selection: PlumeriaSelection = options.cultivar
    ? { cultivar: options.cultivar }
    : options.variant
      ? { variant: options.variant }
      : {};
  return Object.freeze({
    details: Object.freeze([
      "@nbot/flowers:plumeria",
      `seed ${options.seed}`,
      `cultivar ${specimen.genome.cultivar}`,
      ...(options.variant ? [`variant ${options.variant.id}`] : []),
      "5 instances · 1 petal form",
    ]),
    identity: Object.freeze({
      genomeId: `@nbot/flowers:plumeria/${specimen.uid}`,
      species: "@nbot/flowers:plumeria",
    }),
    label: options.label?.trim() || "Plumeria",
    renderGl({ canvas, debugView, onProgress, size }) {
      onProgress({ phase: "building" });
      const rendered = renderPlumeria({
        canvas,
        date: options.date,
        debugView,
        samples,
        seed: options.seed,
        size,
        ...selection,
      });
      onProgress({ completed: 1, phase: "rendering", total: samples });
      return Object.freeze({
        dispose: rendered.dispose,
        ready: rendered.ready.then(() => {
          onProgress({ completed: samples, phase: "ready", total: samples });
        }),
      });
    },
    renderSvg: ({ idPrefix, size }) =>
      plumeria({
        date: options.date,
        idPrefix,
        seed: options.seed,
        size,
        ...selection,
      }),
  });
}

export function mountFlowerWorkbench(
  target: HTMLElement,
  options: FlowerWorkbenchOptions
): MountedFlowerWorkbench {
  const entries = [
    ...(options.specimens ?? []).map(specimenEntry),
    ...(options.entries ?? []),
  ];
  if (entries.length === 0)
    throw new RangeError("flower workbench needs at least one specimen");
  entries.forEach(assertEntry);
  const size = options.size ?? 360;
  if (!Number.isSafeInteger(size) || size < 128 || size > 1024)
    throw new RangeError(
      "flower workbench size must be an integer from 128 to 1024"
    );
  const grounds = options.svgGrounds ?? GROUNDS;
  const glViews = options.glViews ?? GL_VIEWS;
  const glGrounds = options.glGrounds ?? (["gray"] as const);
  if (grounds.some((ground) => !GROUNDS.includes(ground)))
    throw new TypeError("flower workbench SVG ground is invalid");
  if (glViews.some((view) => !GL_VIEWS.includes(view)))
    throw new TypeError("flower workbench GL view is invalid");
  if (glGrounds.some((ground) => !GROUNDS.includes(ground)))
    throw new TypeError("flower workbench GL ground is invalid");
  if (grounds.length + glViews.length * glGrounds.length === 0)
    throw new RangeError("flower workbench needs at least one render view");
  if (new Set(grounds).size !== grounds.length)
    throw new Error("flower workbench SVG grounds must be unique");
  if (new Set(glViews).size !== glViews.length)
    throw new Error("flower workbench GL views must be unique");
  if (glViews.length && glGrounds.length === 0)
    throw new RangeError("flower workbench GL grounds must not be empty");
  if (new Set(glGrounds).size !== glGrounds.length)
    throw new Error("flower workbench GL grounds must be unique");

  const host = document.createElement("div");
  workbenchSequence += 1;
  const workbenchId = workbenchSequence;
  host.dataset.specimens = String(entries.length);
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = STYLE;
  const board = document.createElement("div");
  board.className = "board";
  const header = document.createElement("header");
  const heading = document.createElement("strong");
  heading.textContent = options.title ?? "Flowers · authoring workbench";
  const count = document.createElement("span");
  count.textContent = `${entries.length} specimen${entries.length === 1 ? "" : "s"}`;
  header.append(heading, count);
  const main = document.createElement("main");
  board.append(header, main);
  root.append(style, board);
  target.append(host);

  let disposed = false;
  const renderers = new Set<FlowerWorkbenchRender>();
  const renderJobs: (() => Promise<void>)[] = [];
  const mediaReports: FlowerMediaReport[] = [];
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const renderer of renderers) renderer.dispose();
    renderers.clear();
    host.remove();
  };
  try {
    for (const [specimenIndex, entry] of entries.entries()) {
      const styleIssues = entry.notes ?? [];
      const section = document.createElement("section");
      section.style.setProperty(
        "--flower-views",
        String(grounds.length + glViews.length * glGrounds.length)
      );
      const details = document.createElement("aside");
      const name = document.createElement("h2");
      name.textContent = entry.label;
      const metrics = document.createElement("p");
      metrics.textContent = (entry.details ?? []).join("\n");
      metrics.style.whiteSpace = "pre-line";
      details.append(name, metrics);
      if (styleIssues.length) {
        const review = document.createElement("details");
        const summary = document.createElement("summary");
        summary.textContent = `${styleIssues.length} style note${styleIssues.length === 1 ? "" : "s"}`;
        const list = document.createElement("ul");
        for (const issue of styleIssues) {
          const item = document.createElement("li");
          item.textContent = `${issue.code}: ${issue.message}`;
          if (issue.path) item.title = issue.path;
          list.append(item);
        }
        review.append(summary, list);
        details.append(review);
      }
      section.append(details);

      const svg = entry.renderSvg({
        idPrefix: `workbench-${workbenchId}-${specimenIndex}-media`,
        size,
      });
      const mediaStatus = glViews.includes("final")
        ? document.createElement("p")
        : undefined;
      if (mediaStatus) {
        mediaStatus.dataset.mediaStatus = "pending";
        mediaStatus.textContent = "SVG/GL parity pending";
        details.append(mediaStatus);
      }
      for (const [groundIndex, ground] of grounds.entries()) {
        const figure = document.createElement("figure");
        figure.className = ground;
        figure.insertAdjacentHTML(
          "afterbegin",
          entry.renderSvg({
            idPrefix: `workbench-${workbenchId}-${specimenIndex}-${groundIndex}`,
            size,
          })
        );
        figure.append(caption(`SVG · ${ground}`));
        section.append(figure);
      }

      for (const debugView of glViews) {
        const outputs = glGrounds.map((ground) => {
          const figure = document.createElement("figure");
          figure.className = `gl ${ground}`;
          figure.ariaBusy = "true";
          const canvas = document.createElement("canvas");
          const state = document.createElement("div");
          state.className = "render-state";
          state.setAttribute("role", "status");
          state.setAttribute("aria-label", "Rendering flower");
          figure.append(
            canvas,
            state,
            caption(`GL · ${debugView} · ${ground}`)
          );
          section.append(figure);
          return { canvas, figure, state };
        });
        renderJobs.push(async () => {
          if (disposed) return;
          const source = outputs[0].canvas;
          const rendered = entry.renderGl({
            canvas: source,
            debugView,
            onProgress: ({ completed, phase, total }) => {
              for (const { figure, state } of outputs) {
                figure.dataset.phase = phase;
                if (completed && total) {
                  figure.dataset.hasFrame = "true";
                  state.textContent = `${completed}/${total}`;
                }
              }
            },
            size,
          });
          renderers.add(rendered);
          let hasRenderedFrame = false;
          try {
            await rendered.ready;
            hasRenderedFrame = true;
            if (!disposed) {
              if (debugView === "final") {
                const report = await compareRenderedFlowerMediaFrames(
                  entry.identity,
                  svg,
                  source,
                  size
                );
                mediaReports.push(report);
                if (mediaStatus) {
                  mediaStatus.dataset.mediaStatus = report.issues.length
                    ? "review"
                    : "passed";
                  mediaStatus.textContent = report.issues.length
                    ? `${report.issues.length} SVG/GL parity note${report.issues.length === 1 ? "" : "s"}`
                    : "SVG/GL parity passed";
                  if (report.issues.length) {
                    const review = document.createElement("details");
                    const summary = document.createElement("summary");
                    summary.textContent = mediaStatus.textContent;
                    const list = document.createElement("ul");
                    for (const issue of report.issues) {
                      const item = document.createElement("li");
                      item.textContent = `${issue.code}: ${issue.message}`;
                      list.append(item);
                    }
                    review.append(summary, list);
                    details.append(review);
                  }
                }
              }
              for (const { canvas, figure, state } of outputs) {
                const still = document.createElement("canvas");
                still.width = source.width;
                still.height = source.height;
                const context = still.getContext("2d");
                if (!context)
                  throw new Error("flower workbench needs a 2D canvas context");
                context.drawImage(source, 0, 0);
                canvas.replaceWith(still);
                state.remove();
                figure.ariaBusy = "false";
              }
            }
          } finally {
            rendered.dispose();
            renderers.delete(rendered);
            if (hasRenderedFrame)
              source
                .getContext("webgl2")
                ?.getExtension("WEBGL_lose_context")
                ?.loseContext();
          }
        });
      }
      main.append(section);
    }
  } catch (error) {
    dispose();
    throw error;
  }

  const media = renderJobs
    .reduce((previous, render) => previous.then(render), Promise.resolve())
    .then(
      () => {
        const reports = Object.freeze([...mediaReports]);
        if (!disposed) {
          host.dataset.mediaIssues = String(
            reports.reduce((count, report) => count + report.issues.length, 0)
          );
          host.dataset.mediaReports = String(reports.length);
          host.dataset.ready = "true";
        }
        return reports;
      },
      (error: unknown) => {
        dispose();
        throw error;
      }
    );
  const ready = media.then(() => undefined);
  return Object.freeze({
    dispose,
    element: host,
    media,
    ready,
  });
}
