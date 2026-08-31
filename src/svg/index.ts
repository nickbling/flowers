import { auditSpecimen } from "@/src/core/audit";
import type { FlowerModel, Point2 } from "@/src/core/model";
import { pigmentUsesSpace } from "@/src/core/pigment";
import type { FlowerSpecimen } from "@/src/core/species";
import { preciseNumber, spatialNumber } from "@/src/svg/format";
import { geometryNode } from "@/src/svg/organ";
import { gradient } from "@/src/svg/pigment";
import {
  flatten,
  meshDepthCoefficients,
  projectionPlan,
  renderedDepth,
  transformAttribute,
} from "@/src/svg/projection";
import { createSvgVectorLight } from "@/src/svg/studio";
import { projectedSweep } from "@/src/svg/sweep";
import {
  type SvgNode,
  serializeSvg,
  svgNode,
  svgStyle,
} from "@/src/svg/writer";

const VIEWBOX = 480;
const LAMINA_BANDS = 12;

export type SvgRenderOptions = Readonly<{
  /** Optional opaque ground. Omit it for a transparent document. */
  background?: `#${string}`;
  /** Prefix for document-local IDs when several SVGs share one DOM tree. */
  idPrefix?: string;
  /** Fraction of the frame kept clear around the model. */
  padding?: number;
  /** Width and height attributes in CSS pixels. */
  size?: number;
  title?: string;
}>;

function validateOptions(
  options: SvgRenderOptions
): Required<Pick<SvgRenderOptions, "padding" | "size">> & SvgRenderOptions {
  const size = options.size ?? VIEWBOX;
  const padding = options.padding ?? 0.075;
  if (!Number.isSafeInteger(size) || size < 1 || size > 4096)
    throw new RangeError("SVG size must be an integer from 1 to 4096");
  if (!Number.isFinite(padding) || padding < 0 || padding >= 0.4)
    throw new RangeError("SVG padding must be from 0 to 0.4");
  if (options.background && !/^#[0-9a-f]{6}$/i.test(options.background))
    throw new TypeError("SVG background must be a six-digit hex color");
  if (
    options.idPrefix !== undefined &&
    !/^[a-z][a-z0-9_-]*$/i.test(options.idPrefix)
  )
    throw new TypeError(
      "SVG idPrefix must start with a letter and contain only letters, digits, underscores or hyphens"
    );
  return { ...options, padding, size };
}

function portraitTransform(model: FlowerModel, padding: number): string {
  const { maximum, minimum } = model.portrait.bounds;
  const width = maximum[0] - minimum[0];
  const height = maximum[1] - minimum[1];
  const usable = VIEWBOX * (1 - padding * 2);
  const scale = usable / Math.max(width, height);
  const centerX = (minimum[0] + maximum[0]) / 2;
  const centerY = (minimum[1] + maximum[1]) / 2;
  return `translate(${VIEWBOX / 2} ${VIEWBOX / 2}) scale(${preciseNumber(scale)} ${preciseNumber(-scale)}) translate(${spatialNumber(-centerX, width)} ${spatialNumber(-centerY, height)})`;
}

export function renderSvg(
  specimen: FlowerSpecimen,
  rawOptions: SvgRenderOptions = {}
): string {
  const options = validateOptions(rawOptions);
  const issues = auditSpecimen(specimen);
  if (issues.length)
    throw new Error(
      `cannot render an invalid flower specimen:\n${issues
        .map((issue) => `${issue.path} [${issue.code}] ${issue.message}`)
        .join("\n")}`
    );
  const fingerprint = specimen.model.genomeId.split("/").at(-1);
  if (!fingerprint) throw new Error("flower model has no identity fingerprint");
  const prefix = `${options.idPrefix ? `${options.idPrefix}-` : ""}f${fingerprint}`;
  const definitions: SvgNode[] = [];
  const definitionIds = new Map<string, string>();
  const portraitSpan: Point2 = [
    specimen.model.portrait.bounds.maximum[0] -
      specimen.model.portrait.bounds.minimum[0],
    specimen.model.portrait.bounds.maximum[1] -
      specimen.model.portrait.bounds.minimum[1],
  ];
  const draws = [...flatten(specimen.model.roots)].sort((left, right) => {
    const leftGeometry = specimen.model.geometries[left.organ.geometry];
    const rightGeometry = specimen.model.geometries[right.organ.geometry];
    const depth =
      renderedDepth(leftGeometry, left.transform) -
      renderedDepth(rightGeometry, right.transform);
    return depth === 0 ? left.order - right.order : depth;
  });
  const uses = draws.map(({ organ, transform }) => {
    const geometry = specimen.model.geometries[organ.geometry];
    const appearance = specimen.model.appearances[organ.appearance];
    const projection = projectionPlan(transform);
    const projected =
      geometry.kind === "sweep"
        ? projectedSweep(geometry, transform, projection.definition)
        : undefined;
    const flowerPigment = pigmentUsesSpace(appearance.pigment, "flower");
    const viewSensitiveEllipsoid =
      geometry.kind === "ellipsoid" &&
      (pigmentUsesSpace(appearance.pigment, "organ") ||
        pigmentUsesSpace(appearance.pigment, "surface"));
    const pigmentKey = flowerPigment
      ? transform
      : viewSensitiveEllipsoid
        ? [
            transform[0],
            transform[1],
            transform[2],
            transform[4],
            transform[5],
            transform[6],
            transform[8],
            transform[9],
            transform[10],
          ]
        : undefined;
    const meshDepthKey =
      geometry.kind === "mesh" ? meshDepthCoefficients(transform) : undefined;
    const key = JSON.stringify([
      organ.geometry,
      organ.appearance,
      projection.key,
      projected?.key,
      pigmentKey,
      meshDepthKey,
    ]);
    let id = definitionIds.get(key);
    if (!id) {
      id = `${prefix}-shape-${definitionIds.size}`;
      const gradientIds = Array.from(
        {
          length:
            geometry.kind === "mesh"
              ? 0
              : geometry.kind === "lamina"
                ? LAMINA_BANDS
                : geometry.kind === "sweep"
                  ? 2
                  : 1,
        },
        (_, gradientIndex) => `${id}-paint-${gradientIndex}`
      );
      definitions.push(
        ...gradientIds.map((gradientId, gradientIndex) =>
          gradient(
            gradientId,
            geometry,
            appearance,
            transform,
            specimen,
            geometry.kind === "lamina"
              ? -1 + (2 * (gradientIndex + 0.5)) / LAMINA_BANDS
              : 0,
            projection.definition,
            projected,
            geometry.kind === "sweep" ? (gradientIndex as 0 | 1) : undefined
          )
        ),
        ...geometryNode(
          id,
          gradientIds,
          geometry,
          appearance,
          transform,
          specimen,
          projection.definition,
          projected
        )
      );
      definitionIds.set(key, id);
    }
    return svgNode("use", {
      "data-organ": organ.semantic,
      href: `#${id}`,
      transform: projection.use
        ? transformAttribute(projection.use, portraitSpan)
        : undefined,
    });
  });
  const title =
    options.title ??
    `${specimen.genome.cultivar.name} ${specimen.genome.species.id}`;
  const children: SvgNode[] = [svgNode("title", {}, [title])];
  if (options.background)
    children.push(
      svgNode("rect", {
        height: VIEWBOX,
        style: svgStyle({ fill: options.background, stroke: "none" }),
        width: VIEWBOX,
        x: 0,
        y: 0,
      })
    );
  const compositionId = `${prefix}-composition`;
  definitions.push(svgNode("g", { id: compositionId }, uses));
  const light = createSvgVectorLight(specimen.model, prefix, compositionId);
  definitions.push(...light.definitions);
  children.push(
    svgNode("defs", {}, definitions),
    svgNode(
      "g",
      { transform: portraitTransform(specimen.model, options.padding) },
      [
        svgNode("use", { href: `#${compositionId}` }),
        ...(light.overlay ? [light.overlay] : []),
      ]
    )
  );
  return serializeSvg(
    svgNode(
      "svg",
      {
        "aria-label": title,
        height: options.size,
        role: "img",
        style: svgStyle({ fill: "#000", stroke: "none" }),
        viewBox: `0 0 ${VIEWBOX} ${VIEWBOX}`,
        width: options.size,
        xmlns: "http://www.w3.org/2000/svg",
      },
      children
    )
  );
}
