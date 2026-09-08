import type { Genome } from "@/src/plumeria/genome";
import type { PlumeriaLivery } from "@/src/plumeria/specimen";
import { between, createRng } from "@/src/shared/prng";

/** Pigment-only ribbons in canonical (along, signed half-width) coordinates. */
export type PigmentMark = Readonly<{
  kind: "ray" | "vein" | "stripe";
  from: number;
  to: number;
  start: number;
  end: number;
  bow: number;
  width: number;
  opacity: number;
}>;

export function preparePigmentMarks(
  seed: string,
  genome: Genome,
  livery: PlumeriaLivery
): readonly PigmentMark[] {
  // Independent of identity and the historical SVG paint stream.
  const rng = createRng(`${seed}|pigment-marks`);
  const marks: PigmentMark[] = [];
  for (const kind of ["ray", "vein"] as const) {
    const count = kind === "ray" ? 3 : 4;
    for (const side of [-1, 1]) {
      for (let i = 0; i < count; i += 1) {
        marks.push(
          Object.freeze({
            kind,
            from: kind === "ray" ? 0.035 : between(rng, 0.12, 0.2),
            to:
              kind === "ray"
                ? Math.min(
                    0.98,
                    0.16 + genome.throat.reach + 0.22 * genome.throat.rays
                  ) * between(rng, 0.8, 1)
                : between(rng, 0.76, 0.93),
            start: side * between(rng, 0.015, 0.07),
            end: side * ((i + between(rng, 0.65, 0.95)) / (count + 0.3)),
            bow: side * between(rng, 0.015, 0.075),
            width:
              kind === "ray"
                ? between(rng, 0.035, 0.065)
                : between(rng, 0.012, 0.022),
            opacity:
              kind === "ray"
                ? 0.36 * genome.throat.rays
                : 0.32 * genome.veins.strength,
          })
        );
      }
    }
  }
  const candy = genome.cultivar === "candy stripe";
  if (candy || livery.stripeVisible) {
    const center = (candy ? 0.7 : 1) * livery.stripeSide;
    marks.push(
      Object.freeze({
        kind: "stripe",
        from: 0.18,
        to: 0.94,
        start: center * 0.65,
        end: center,
        bow: between(rng, -0.045, 0.045),
        width: candy ? 0.25 : 0.19,
        opacity: candy ? 0.48 : 0.2,
      })
    );
  }
  return Object.freeze(marks);
}

/** Both adapters use this exact curved center and tapered support. */
export function pigmentMarkSection(
  mark: PigmentMark,
  along: number
): Readonly<{ center: number; width: number; fade: number }> {
  const t = Math.max(
    0,
    Math.min(1, (along - mark.from) / (mark.to - mark.from))
  );
  return {
    center:
      mark.start + (mark.end - mark.start) * t + 4 * mark.bow * t * (1 - t),
    width: mark.width * Math.sin(Math.PI * t) ** 0.7,
    fade: mark.kind === "stripe" ? Math.sin(Math.PI * t) : 1,
  };
}

export function pigmentMarkWeight(
  mark: PigmentMark,
  along: number,
  across: number
): number {
  if (along <= mark.from || along >= mark.to) return 0;
  return (
    pigmentSectionWeight(pigmentMarkSection(mark, along), across) * mark.opacity
  );
}

export function pigmentSectionWeight(
  section: Readonly<{ center: number; width: number; fade: number }>,
  across: number,
  cell?: readonly [number, number]
): number {
  const { center, width } = section;
  if (width <= 0) return 0;
  if (cell && cell[1] > cell[0]) {
    // Exact box integral of the compact quintic wash; preserves pigment mass
    // while giving the color a flat center instead of a shading-like trough.
    const integral = (x: number) => {
      const t = Math.min(1, Math.abs(x));
      return Math.sign(x) * (t - 2.5 * t ** 4 + 3 * t ** 5 - t ** 6);
    };
    return (
      ((section.fade * width) / (cell[1] - cell[0])) *
      (integral((cell[1] - center) / width) -
        integral((cell[0] - center) / width))
    );
  }
  const t = Math.min(1, Math.abs(across - center) / width);
  return section.fade * (1 - t ** 3 * (10 + t * (-15 + 6 * t)));
}
