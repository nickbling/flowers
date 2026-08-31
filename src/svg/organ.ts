import { evaluatePigment } from "@/src/core/evaluate";
import type {
  LaminaGeometry,
  Matrix4,
  OrganAppearance,
  OrganGeometry,
  Point2,
} from "@/src/core/model";
import type { FlowerSpecimen } from "@/src/core/species";
import { transformPoint } from "@/src/core/transform";
import { number, preciseNumber } from "@/src/svg/format";
import {
  fieldSample,
  fieldSampleAt,
  laminaSectionPoint,
  svgColor,
} from "@/src/svg/pigment";
import {
  catmullRom,
  geometryBounds,
  polygon,
  projectEllipsoid,
  projectPoint,
} from "@/src/svg/projection";
import { shadeSvgTone, svgSurfacePalette } from "@/src/svg/studio";
import {
  type ProjectedSweep,
  projectedSweep,
  sweepSurfaceU,
} from "@/src/svg/sweep";
import { type SvgNode, svgNode, svgStyle } from "@/src/svg/writer";

function pathStyle(
  fill: string,
  stroke: string,
  strokeWidth: number,
  extra: Readonly<Record<string, number | string | undefined>> = {}
): string {
  return svgStyle({
    fill,
    "paint-order": "stroke fill",
    stroke,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "stroke-width": strokeWidth,
    "vector-effect": "non-scaling-stroke",
    ...extra,
  });
}

function laminaNodes(
  geometry: LaminaGeometry,
  fills: readonly string[],
  outline: string,
  rim: string,
  fiberShadow: string,
  fiberHighlight: string,
  thickness: number,
  outlineOpacity: number,
  projection?: Matrix4
): readonly SvgNode[] {
  const sectionPoint = (surfaceU: number, sectionIndex: number): Point2 =>
    projectPoint(
      laminaSectionPoint(
        geometry,
        surfaceU,
        sectionIndex / (geometry.sections.length - 1)
      ),
      projection
    );
  const projectedOutline = projection
    ? [
        ...geometry.sections.map((_, index) => sectionPoint(1, index)),
        ...geometry.sections
          .slice(1, -1)
          .map((_, index) =>
            sectionPoint(-1, geometry.sections.length - 2 - index)
          ),
      ]
    : geometry.outline;
  const shape = catmullRom(projectedOutline, true);
  const midrib = catmullRom(
    geometry.sections.map((_, index) => sectionPoint(0, index)),
    false
  );
  const features = Object.entries(geometry.features)
    .filter(([name]) => name !== "midrib")
    .map(([, points]) =>
      svgNode("path", {
        d: catmullRom(
          points.map(([x, y]) => projectPoint([x, y, 0], projection)),
          false
        ),
        style: pathStyle("none", outline, 0.45, {
          "stroke-opacity": 0.16,
        }),
      })
    );
  const bands = fills.map((fill, index) => {
    const fromU = -1 + (2 * index) / fills.length;
    const toU = -1 + (2 * (index + 1)) / fills.length;
    const forward = geometry.sections.map((_, sectionIndex) =>
      sectionPoint(toU, sectionIndex)
    );
    const reverse = [...geometry.sections].reverse().map((_, reverseIndex) => {
      const sectionIndex = geometry.sections.length - 1 - reverseIndex;
      return sectionPoint(fromU, sectionIndex);
    });
    return svgNode("path", {
      d: catmullRom([...forward, ...reverse], true),
      style: pathStyle(fill, fill, 0.38, { "stroke-opacity": 1 }),
    });
  });
  const fiberProfiles = [
    [-0.67, 0.06, 0.86, 0.38, 0.095],
    [-0.32, 0.11, 0.78, 0.31, 0.075],
    [-0.05, 0.04, 0.96, 0.36, 0.11],
    [0.31, 0.08, 0.88, 0.32, 0.085],
    [0.66, 0.12, 0.82, 0.29, 0.075],
  ] as const;
  const fibers = fiberProfiles.flatMap(
    ([surfaceU, start, end, strokeWidth, opacity]) => {
      const first = Math.max(
        1,
        Math.floor(start * (geometry.sections.length - 1))
      );
      const last = Math.min(
        geometry.sections.length - 2,
        Math.ceil(end * (geometry.sections.length - 1))
      );
      const path = (offset: number) =>
        catmullRom(
          Array.from({ length: last - first + 1 }, (_, index) =>
            sectionPoint(surfaceU + offset, first + index)
          ),
          false
        );
      return [
        svgNode("path", {
          d: path(0),
          style: pathStyle("none", fiberShadow, strokeWidth, {
            "stroke-opacity": opacity,
          }),
        }),
        svgNode("path", {
          d: path(0.014),
          style: pathStyle("none", fiberHighlight, strokeWidth * 0.78, {
            "stroke-opacity": opacity * 0.82,
          }),
        }),
      ];
    }
  );
  return [
    svgNode("path", {
      d: shape,
      style: pathStyle("none", outline, 1.1 + 1.9 * thickness, {
        "stroke-opacity": outlineOpacity,
      }),
    }),
    ...bands,
    ...fibers,
    svgNode("path", {
      d: midrib,
      style: pathStyle("none", outline, 0.55, { "stroke-opacity": 0.14 }),
    }),
    ...features,
    svgNode("path", {
      d: shape,
      style: pathStyle("none", rim, 0.35 + 1.1 * thickness, {
        "stroke-opacity": 0.48,
      }),
    }),
  ];
}

export function geometryNode(
  id: string,
  gradientIds: readonly string[],
  geometry: OrganGeometry,
  appearance: OrganAppearance,
  transform: Matrix4,
  specimen: FlowerSpecimen,
  projection?: Matrix4,
  projected?: ProjectedSweep
): readonly SvgNode[] {
  const midpointSurfaceU = projected ? sweepSurfaceU(projected, 0, 0.5) : 0;
  const midpoint = evaluatePigment(
    appearance.pigment,
    fieldSample(
      geometry,
      transform,
      geometryBounds(geometry),
      0.5,
      specimen.model.genomeId,
      midpointSurfaceU,
      projected
    )
  );
  const palette = svgSurfacePalette(midpoint);
  const outline = svgColor(palette.outline);
  const rim = svgColor(palette.rim);
  const fill = gradientIds[0] ? `url(#${gradientIds[0]})` : svgColor(midpoint);
  if (geometry.kind === "lamina")
    return [
      svgNode(
        "g",
        { id },
        laminaNodes(
          geometry,
          gradientIds.map((gradientId) => `url(#${gradientId})`),
          outline,
          rim,
          svgColor(palette.fiberShadow),
          svgColor(palette.fiberHighlight),
          appearance.tissue.thickness,
          palette.outlineOpacity,
          projection
        )
      ),
    ];
  if (geometry.kind === "ellipsoid") {
    const ellipse = projection
      ? projectEllipsoid(geometry.radii, projection)
      : {
          angle: 0,
          center: [0, 0] as Point2,
          radiusX: geometry.radii[0],
          radiusY: geometry.radii[1],
        };
    return [
      svgNode("ellipse", {
        cx: preciseNumber(ellipse.center[0]),
        cy: preciseNumber(ellipse.center[1]),
        id,
        rx: preciseNumber(ellipse.radiusX),
        ry: preciseNumber(ellipse.radiusY),
        style: pathStyle(fill, outline, 0.65, { "stroke-opacity": 0.3 }),
        transform:
          Math.abs(ellipse.angle) > 1e-8
            ? `rotate(${number(ellipse.angle)} ${preciseNumber(ellipse.center[0])} ${preciseNumber(ellipse.center[1])})`
            : undefined,
      }),
    ];
  }
  if (geometry.kind === "sweep") {
    const sweep = projected ?? projectedSweep(geometry, transform, projection);
    return [
      svgNode("g", { id }, [
        ...sweep.halves.map((half, index) =>
          svgNode("path", {
            d: polygon(half),
            style: svgStyle({
              fill: `url(#${gradientIds[index]})`,
              stroke: "none",
            }),
          })
        ),
        svgNode("path", {
          d: polygon(sweep.outline),
          style: pathStyle("none", outline, 0.35, {
            "stroke-opacity": 0.24,
          }),
        }),
      ]),
    ];
  }
  const bounds = geometryBounds(geometry);
  const triangles = Array.from(
    { length: geometry.indices.length / 3 },
    (_, triangle) => {
      const points = [0, 1, 2].map(
        (offset) => geometry.positions[geometry.indices[triangle * 3 + offset]]
      );
      const depth =
        points.reduce(
          (sum, point) => sum + transformPoint(transform, point)[2],
          0
        ) / 3;
      return { depth, points, triangle };
    }
  ).sort((left, right) => {
    if (left.depth < right.depth) return -1;
    if (left.depth > right.depth) return 1;
    return left.triangle - right.triangle;
  });
  const children = triangles.map(({ points, triangle }) => {
    const projectedPoints = points.map((point) =>
      projectPoint(point, projection)
    );
    const coordinates = geometry.surfaceCoordinates
      ? [0, 1, 2].map(
          (offset) =>
            geometry.surfaceCoordinates?.[
              geometry.indices[triangle * 3 + offset]
            ]
        )
      : undefined;
    const local = [0, 1, 2].map((axis) =>
      points.reduce((sum, point) => sum + point[axis], 0)
    ) as [number, number, number];
    local[0] /= 3;
    local[1] /= 3;
    local[2] /= 3;
    const surfaceU = coordinates
      ? (coordinates.reduce(
          (sum, coordinate) => sum + (coordinate?.[0] ?? 0),
          0
        ) /
          3) *
          2 -
        1
      : ((local[0] - bounds.minimum[0]) /
          Math.max(1e-9, bounds.maximum[0] - bounds.minimum[0])) *
          2 -
        1;
    const surfaceV = coordinates
      ? coordinates.reduce(
          (sum, coordinate) => sum + (coordinate?.[1] ?? 0),
          0
        ) / 3
      : (local[1] - bounds.minimum[1]) /
        Math.max(1e-9, bounds.maximum[1] - bounds.minimum[1]);
    const triangleFill = svgColor(
      shadeSvgTone(
        evaluatePigment(
          appearance.pigment,
          fieldSampleAt(
            geometry,
            transform,
            local,
            specimen.model.genomeId,
            surfaceU,
            surfaceV
          )
        ),
        surfaceV,
        surfaceU,
        appearance,
        geometry.kind
      )
    );
    return svgNode("path", {
      d: `${projectedPoints
        .map(
          ([x, y], index) =>
            `${index === 0 ? "M" : "L"} ${preciseNumber(x)} ${preciseNumber(y)}`
        )
        .join(" ")} Z`,
      style: pathStyle(triangleFill, outline, 0.45, {
        "stroke-opacity": 0.2,
      }),
    });
  });
  return [svgNode("g", { id }, children)];
}
