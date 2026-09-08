import {
  buildPlumeriaScene,
  type PlumeriaSceneOptions,
} from "@/src/gl/plumeria-scene";
import {
  type RenderedFlower,
  type RenderOptions,
  renderScene,
} from "@/src/gl/rendering";
import { BOTANICAL_STUDIO } from "@/src/gl/studio";
import { plumeriaCultivarName } from "@/src/plumeria/specimen";
import { createRng } from "@/src/shared/prng";

export {
  type DisposablePlumeriaScene,
  type PlumeriaScene,
  type PlumeriaSceneOptions,
  plumeriaScene,
} from "@/src/gl/plumeria-scene";

export type RenderPlumeriaOptions = PlumeriaSceneOptions &
  RenderOptions & {
    /** Number of accumulation frames. Defaults to the four-frame studio contract. */
    samples?: number;
  };

export type RenderedPlumeria = RenderedFlower & { cultivar: string };

export function renderPlumeria({
  seed,
  ...options
}: RenderPlumeriaOptions): RenderedPlumeria {
  const cultivar = plumeriaCultivarName(
    seed,
    options.cultivar,
    options.variant
  );
  return Object.freeze(
    Object.assign(
      renderScene({
        ...options,
        preserveDrawingBuffer: true,
        build() {
          const { portrait, studio } = buildPlumeriaScene({ seed, ...options });
          return {
            ...portrait,
            studio,
            random: createRng(`${seed}|${BOTANICAL_STUDIO.jitterNamespace}`),
          };
        },
      }),
      { cultivar }
    )
  );
}
