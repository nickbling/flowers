import { daisy } from "@/src/catalog/daisy";
import { passionflower } from "@/src/catalog/passionflower";
import { sunflower } from "@/src/catalog/sunflower";
import {
  createFlowerCatalog,
  defineFlowerPack,
  type FlowerCatalog,
  type FlowerPack,
} from "@/src/core";

export {
  alaskaDaisy,
  bananaCreamDaisy,
  crazyDaisy,
  type DaisyCultivar,
  type DaisyTraits,
  daisy,
  daisyCultivars,
  realNeatDaisy,
} from "@/src/catalog/daisy";
export {
  amethystPassionflower,
  caeruleaPassionflower,
  constanceEliottPassionflower,
  incensePassionflower,
  ladyMargaretPassionflower,
  type PassionflowerCultivar,
  type PassionflowerTraits,
  passionflower,
  passionflowerCultivars,
} from "@/src/catalog/passionflower";
export {
  catalogStudies,
  daisyStudy,
  passionflowerStudy,
  sunflowerStudy,
} from "@/src/catalog/studies";
export {
  lemonQueenSunflower,
  procutOrangeSunflower,
  procutRedLemonBicolorSunflower,
  procutRedSunflower,
  procutWhiteLiteSunflower,
  type SunflowerCultivar,
  type SunflowerTraits,
  sunflower,
  sunflowerCultivars,
  teddyBearSunflower,
} from "@/src/catalog/sunflower";

export const catalogPack: FlowerPack = defineFlowerPack({
  id: "@nbot/flowers",
  species: [daisy, passionflower, sunflower],
});

export const catalog: FlowerCatalog = createFlowerCatalog([catalogPack]);
