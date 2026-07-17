import type { FlowerSpecimen } from "@/src/core";
import { assertSpeciesStudy, type SpeciesStudy } from "@/src/devkit/study";
import { renderFlower } from "@/src/gl/flower";
import { renderSvg } from "@/src/svg";

export type FlowerMediaColor = readonly [number, number, number];

export type FlowerMediaFrame = Readonly<{
  centerX: number;
  centerY: number;
  coverage: number;
  height: number;
  meanColor: FlowerMediaColor;
  width: number;
}>;

export type FlowerMediaIssue = Readonly<{
  code: "framing-mismatch" | "palette-mismatch" | "silhouette-mismatch";
  message: string;
}>;

export type FlowerMediaReport = Readonly<{
  gl: FlowerMediaFrame;
  issues: readonly FlowerMediaIssue[];
  silhouetteOverlap: number;
  spatialColorDifference: number;
  specimen: Readonly<{
    genomeId: string;
    species: string;
  }>;
  svg: FlowerMediaFrame;
}>;

export type FlowerMediaIdentity = Readonly<{
  genomeId: string;
  species: string;
}>;

export type InspectFlowerMediaOptions = Readonly<{
  size?: number;
}>;

export type FlowerMediaComparison = Readonly<{
  silhouetteOverlap: number;
  spatialColorDifference: number;
}>;

type MutableColor = [number, number, number, number];

type SpatialSignature = Readonly<{
  alpha: readonly number[];
  colors: readonly FlowerMediaColor[];
}>;

type MeasuredFrame = Readonly<{
  frame: FlowerMediaFrame;
  signature: SpatialSignature;
}>;

const ALPHA_THRESHOLD = 8;
const CHROMATICITY_DISTANCE = Math.SQRT2;
const COLOR_DISTANCE = Math.sqrt(3 * 255 ** 2);
const SIGNATURE_SIZE = 16;

function validateSize(size: number): void {
  if (!Number.isSafeInteger(size) || size < 128 || size > 1024)
    throw new RangeError(
      "flower media inspection size must be an integer from 128 to 1024"
    );
}

function colorDistance(
  first: FlowerMediaColor,
  second: FlowerMediaColor
): number {
  return Math.hypot(
    first[0] - second[0],
    first[1] - second[1],
    first[2] - second[2]
  );
}

function normalizedColorDistance(
  first: FlowerMediaColor,
  second: FlowerMediaColor
): number {
  return colorDistance(first, second) / COLOR_DISTANCE;
}

function chromaticity(color: FlowerMediaColor): FlowerMediaColor {
  const total = color[0] + color[1] + color[2];
  if (total < 1) return [1 / 3, 1 / 3, 1 / 3];
  return [color[0] / total, color[1] / total, color[2] / total];
}

export function normalizedChromaticDistance(
  first: FlowerMediaColor,
  second: FlowerMediaColor
): number {
  return (
    colorDistance(chromaticity(first), chromaticity(second)) /
    CHROMATICITY_DISTANCE
  );
}

function finishColor(
  color: MutableColor,
  fallback: FlowerMediaColor
): FlowerMediaColor {
  if (!color[3]) return fallback;
  return Object.freeze([
    color[0] / color[3],
    color[1] / color[3],
    color[2] / color[3],
  ]) as FlowerMediaColor;
}

function signatureFromPixels(
  pixels: Uint8ClampedArray,
  size: number,
  minimumX: number,
  minimumY: number,
  width: number,
  height: number
): SpatialSignature {
  const cells = SIGNATURE_SIZE ** 2;
  const alpha = new Float64Array(cells);
  const samples = new Uint32Array(cells);
  const colors = new Float64Array(cells * 3);
  for (const row of Array(height).keys()) {
    const y = minimumY + row;
    const cellY = Math.min(
      SIGNATURE_SIZE - 1,
      Math.floor(((y + 0.5 - minimumY) / height) * SIGNATURE_SIZE)
    );
    for (const column of Array(width).keys()) {
      const x = minimumX + column;
      const cellX = Math.min(
        SIGNATURE_SIZE - 1,
        Math.floor(((x + 0.5 - minimumX) / width) * SIGNATURE_SIZE)
      );
      const cell = cellY * SIGNATURE_SIZE + cellX;
      const index = (y * size + x) * 4;
      const weight =
        pixels[index + 3] > ALPHA_THRESHOLD ? pixels[index + 3] / 255 : 0;
      samples[cell] += 1;
      alpha[cell] += weight;
      colors[cell * 3] += pixels[index] * weight;
      colors[cell * 3 + 1] += pixels[index + 1] * weight;
      colors[cell * 3 + 2] += pixels[index + 2] * weight;
    }
  }
  return Object.freeze({
    alpha: Object.freeze(
      Array.from(alpha, (value, index) => value / Math.max(1, samples[index]))
    ),
    colors: Object.freeze(
      Array.from({ length: cells }, (_, index): FlowerMediaColor => {
        const weight = alpha[index];
        if (!weight) return Object.freeze([0, 0, 0]);
        return Object.freeze([
          colors[index * 3] / weight,
          colors[index * 3 + 1] / weight,
          colors[index * 3 + 2] / weight,
        ]);
      })
    ),
  });
}

function measureFrame(source: CanvasImageSource, size: number): MeasuredFrame {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("flower media inspection needs a 2D canvas");
  context.drawImage(source, 0, 0, size, size);
  const pixels = context.getImageData(0, 0, size, size).data;
  let alphaMass = 0;
  let maximumX = -1;
  let maximumY = -1;
  let minimumX = size;
  let minimumY = size;
  const mean: MutableColor = [0, 0, 0, 0];
  for (const pixel of Array(pixels.length / 4).keys()) {
    const index = pixel * 4;
    if (pixels[index + 3] <= ALPHA_THRESHOLD) continue;
    const weight = pixels[index + 3] / 255;
    const x = pixel % size;
    const y = Math.floor(pixel / size);
    alphaMass += weight;
    minimumX = Math.min(minimumX, x);
    minimumY = Math.min(minimumY, y);
    maximumX = Math.max(maximumX, x);
    maximumY = Math.max(maximumY, y);
    mean[0] += pixels[index] * weight;
    mean[1] += pixels[index + 1] * weight;
    mean[2] += pixels[index + 2] * weight;
    mean[3] += weight;
  }
  if (!alphaMass)
    throw new Error("flower media inspection found an empty frame");

  const width = maximumX - minimumX + 1;
  const height = maximumY - minimumY + 1;
  return Object.freeze({
    frame: Object.freeze({
      centerX: (minimumX + maximumX + 1) / (2 * size),
      centerY: (minimumY + maximumY + 1) / (2 * size),
      coverage: alphaMass / (size * size),
      height: height / size,
      meanColor: finishColor(mean, [0, 0, 0]),
      width: width / size,
    }),
    signature: signatureFromPixels(
      pixels,
      size,
      minimumX,
      minimumY,
      width,
      height
    ),
  });
}

function weightedPercentile(
  values: readonly Readonly<{ value: number; weight: number }>[],
  percentile: number
): number {
  if (!values.length) return 0;
  const ordered = [...values].sort((left, right) => left.value - right.value);
  const total = ordered.reduce((sum, entry) => sum + entry.weight, 0);
  const target = total * percentile;
  let cumulative = 0;
  for (const entry of ordered) {
    cumulative += entry.weight;
    if (cumulative >= target) return entry.value;
  }
  return ordered.at(-1)?.value ?? 0;
}

function compareSignatures(
  svg: SpatialSignature,
  gl: SpatialSignature
): FlowerMediaComparison {
  let intersection = 0;
  let union = 0;
  const differences: { value: number; weight: number }[] = [];
  for (const [index, svgAlpha] of svg.alpha.entries()) {
    const shared = Math.min(svgAlpha, gl.alpha[index]);
    intersection += shared;
    union += Math.max(svgAlpha, gl.alpha[index]);
    if (shared < 0.08) continue;
    differences.push({
      value: normalizedChromaticDistance(svg.colors[index], gl.colors[index]),
      weight: shared,
    });
  }
  return Object.freeze({
    silhouetteOverlap: intersection / Math.max(1e-6, union),
    spatialColorDifference: weightedPercentile(differences, 0.9),
  });
}

export function reviewFlowerMediaFrames(
  svg: FlowerMediaFrame,
  gl: FlowerMediaFrame,
  comparison: FlowerMediaComparison
): readonly FlowerMediaIssue[] {
  const issues: FlowerMediaIssue[] = [];
  const widthDifference = Math.abs(svg.width - gl.width);
  const heightDifference = Math.abs(svg.height - gl.height);
  const centerDifference = Math.hypot(
    svg.centerX - gl.centerX,
    svg.centerY - gl.centerY
  );
  if (
    widthDifference > 0.1 ||
    heightDifference > 0.1 ||
    centerDifference > 0.065
  )
    issues.push({
      code: "framing-mismatch",
      message:
        "SVG and GL disagree on the flower's normalized bounds or portrait center",
    });

  const coverageRatio =
    Math.max(svg.coverage, gl.coverage) /
    Math.max(1e-6, Math.min(svg.coverage, gl.coverage));
  if (coverageRatio > 1.5 || comparison.silhouetteOverlap < 0.85)
    issues.push({
      code: "silhouette-mismatch",
      message:
        "SVG and GL expose substantially different normalized silhouettes",
    });

  const meanDifference = normalizedColorDistance(svg.meanColor, gl.meanColor);
  if (meanDifference > 0.25 || comparison.spatialColorDifference > 0.22)
    issues.push({
      code: "palette-mismatch",
      message:
        "SVG and GL no longer preserve a comparable global and spatial palette",
    });

  return Object.freeze(issues.map((issue) => Object.freeze(issue)));
}

async function loadSvgImage(svg: string): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(
    new Blob([svg], { type: "image/svg+xml;charset=utf-8" })
  );
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight)
      throw new Error("flower media inspection could not decode the SVG");
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function compareRenderedFlowerMediaFrames(
  identity: FlowerMediaIdentity,
  svg: string,
  gl: CanvasImageSource,
  size: number
): Promise<FlowerMediaReport> {
  validateSize(size);
  const svgMeasurement = measureFrame(await loadSvgImage(svg), size);
  const glMeasurement = measureFrame(gl, size);
  const comparison = compareSignatures(
    svgMeasurement.signature,
    glMeasurement.signature
  );
  return Object.freeze({
    gl: glMeasurement.frame,
    issues: reviewFlowerMediaFrames(
      svgMeasurement.frame,
      glMeasurement.frame,
      comparison
    ),
    ...comparison,
    specimen: Object.freeze({ ...identity }),
    svg: svgMeasurement.frame,
  });
}

export async function compareFlowerMediaFrames(
  specimen: FlowerSpecimen,
  svg: string,
  gl: CanvasImageSource,
  size: number
): Promise<FlowerMediaReport> {
  return compareRenderedFlowerMediaFrames(
    {
      genomeId: specimen.model.genomeId,
      species: specimen.genome.species.id,
    },
    svg,
    gl,
    size
  );
}

/** Renders one specimen through both maintained media and compares their portrait. */
export async function inspectFlowerMedia(
  specimen: FlowerSpecimen,
  options: InspectFlowerMediaOptions = {}
): Promise<FlowerMediaReport> {
  const size = options.size ?? 360;
  validateSize(size);
  const canvas = document.createElement("canvas");
  const rendered = renderFlower({
    canvas,
    preserveDrawingBuffer: true,
    size,
    specimen,
  });
  try {
    await rendered.ready;
    return await compareFlowerMediaFrames(
      specimen,
      renderSvg(specimen, { idPrefix: "media-inspection", size }),
      canvas,
      size
    );
  } finally {
    rendered.dispose();
    canvas
      .getContext("webgl2")
      ?.getExtension("WEBGL_lose_context")
      ?.loseContext();
  }
}

export function assertFlowerMediaReport(report: FlowerMediaReport): void {
  if (!report.issues.length) return;
  throw new Error(
    `flower media contract failed for ${report.specimen.species}:\n${report.issues
      .map((issue) => `[${issue.code}] ${issue.message}`)
      .join("\n")}`
  );
}

/** Renders both maintained media and fails when they no longer depict one flower. */
export async function assertFlowerMedia(
  specimen: FlowerSpecimen,
  options: InspectFlowerMediaOptions = {}
): Promise<FlowerMediaReport> {
  const report = await inspectFlowerMedia(specimen, options);
  assertFlowerMediaReport(report);
  return report;
}

/** Gates every named case without opening concurrent WebGL contexts. */
export async function assertSpeciesMedia(
  study: SpeciesStudy,
  options: InspectFlowerMediaOptions = {}
): Promise<readonly FlowerMediaReport[]> {
  assertSpeciesStudy(study);
  const reports: FlowerMediaReport[] = [];
  for (const { specimen } of study.cases)
    reports.push(await assertFlowerMedia(specimen, options));
  return Object.freeze(reports);
}
