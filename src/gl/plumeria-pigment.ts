import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RGBAFormat,
  SRGBColorSpace,
} from "three";
import type { PigmentMark } from "@/src/plumeria/markings";
import { lightTone, preparePlumeriaPigment } from "@/src/plumeria/pigment";
import type { PlumeriaSpecimen } from "@/src/plumeria/specimen";
import { toHex } from "@/src/shared/color";

const SIZE = 256;

/** Opaque unlit pigment along/across each complete petal, in material UV0.
 * UV1 remains exclusively the physical, nondirectional normal-map coordinate.
 */
export function createPlumeriaPigment(
  specimen: Pick<PlumeriaSpecimen, "genome" | "livery">,
  marks: readonly PigmentMark[]
): DataTexture {
  const { genome, livery } = specimen;
  const pigment = preparePlumeriaPigment(genome, livery, marks);
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y += 1) {
    const along = (y + 0.5) / SIZE;
    const row = pigment(along);
    for (let x = 0; x < SIZE; x += 1) {
      const across = (2 * (x + 0.5)) / SIZE - 1;
      // Integrate over the real texel's across footprint. Mipmaps then handle
      // minification; no projection, illumination or relief is baked in.
      const tone = row(across, [(2 * x) / SIZE - 1, (2 * (x + 1)) / SIZE - 1]);
      const rgb = Number.parseInt(toHex(lightTone(tone)).slice(1), 16);
      const at = 4 * (y * SIZE + x);
      data[at] = rgb >> 16;
      data[at + 1] = (rgb >> 8) & 255;
      data[at + 2] = rgb & 255;
      data[at + 3] = 255;
    }
  }
  const texture = new DataTexture(data, SIZE, SIZE, RGBAFormat);
  texture.name = "plumeria petal pigment";
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
