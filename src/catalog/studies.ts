import { daisy } from "@/src/catalog/daisy";
import {
  constanceEliottPassionflower,
  ladyMargaretPassionflower,
  passionflower,
} from "@/src/catalog/passionflower";
import { sunflower } from "@/src/catalog/sunflower";
import { createSpeciesStudy } from "@/src/devkit/study";

export const daisyStudy = createSpeciesStudy(daisy, [
  {
    id: "reference",
    intent: "balanced reference",
    seed: "reference",
  },
  {
    id: "compact",
    intent: "few, short and narrow rays",
    seed: "compact-bloom",
  },
  {
    id: "expanded",
    intent: "many, long and broad rays",
    seed: "expanded-bloom",
  },
]);

export const passionflowerStudy = createSpeciesStudy(passionflower, [
  {
    id: "reference",
    intent: "balanced reference",
    seed: "reference",
  },
  {
    cultivar: constanceEliottPassionflower,
    id: "compact",
    intent: "compact white and rose corona",
    seed: "compact",
  },
  {
    cultivar: ladyMargaretPassionflower,
    id: "expanded",
    intent: "expanded crimson and violet corona",
    seed: "expanded",
  },
]);

export const sunflowerStudy = createSpeciesStudy(sunflower, [
  {
    id: "reference",
    intent: "balanced reference",
    seed: "reference",
  },
  {
    id: "compact",
    intent: "small disk and sparse short rays",
    seed: "sunflower-compact",
  },
  {
    id: "expanded",
    intent: "large disk and dense long rays",
    seed: "sunflower-expanded",
  },
]);

export const catalogStudies = Object.freeze([
  daisyStudy,
  passionflowerStudy,
  sunflowerStudy,
]);
