import { describe, expect, it } from "vitest";
import {
  cultivarRecipe,
  definePlumeriaCultivar,
  type PlumeriaCultivarDefinition,
} from "@/src/plumeria/cultivar";
import { growPlumeria } from "@/src/plumeria/specimen";

const ALBA: PlumeriaCultivarDefinition = {
  name: "  alba rosa  ",
  body: { base: ["#fff8ed", "#fffdf8"], tip: "#fffefa" },
  throat: { color: ["#efb817", "#ffd43d"], reach: [0.46, 0.6] },
  margin: { color: "#edabc0", strength: [0.08, 0.2] },
  form: { fullness: [0.72, 0.9], taper: [0.12, 0.28] },
};

describe("definePlumeriaCultivar", () => {
  it("normalizes a compact definition into a versioned recipe", () => {
    const cultivar = definePlumeriaCultivar(ALBA);
    const recipe = cultivarRecipe(cultivar);

    expect(cultivar).toMatchObject({
      kind: "plumeria-cultivar",
      name: "alba rosa",
      version: 1,
    });
    expect(recipe.body.base.l[0]).toBeLessThan(recipe.body.base.l[1]);
    expect(recipe.throat.reach).toEqual([0.46, 0.6]);
    expect(recipe.margin.strength).toEqual([0.08, 0.2]);
    expect(recipe.blush.strength).toEqual([0, 0]);
    expect(recipe.veins.strength).toEqual([0, 0]);
    expect(recipe.form.fullness).toEqual([0.72, 0.9]);
    expect(definePlumeriaCultivar(ALBA)).toEqual(cultivar);
  });

  it("takes the short hue arc across the OKLCH seam", () => {
    const cultivar = definePlumeriaCultivar({
      name: "seam",
      body: { base: ["#ff0080", "#ff00aa"] },
      throat: { color: "#f4ca26" },
    });
    const [from, to] = cultivar.recipe.body.base.h;

    expect(Math.abs(to - from)).toBeLessThanOrEqual(180);
  });

  it("expands scalar values and defaults omitted colors", () => {
    const cultivar = definePlumeriaCultivar({
      name: "white",
      body: { base: "#fffaf0" },
      throat: { color: "#f4ca26", reach: 0.52 },
    });
    const recipe = cultivarRecipe(cultivar);

    expect(recipe.throat.reach).toEqual([0.52, 0.52]);
    expect(recipe.body.tip).toEqual(recipe.body.base);
    expect(recipe.margin.tone).toEqual(recipe.body.tip);
    expect(recipe.blush.tone).toEqual(recipe.body.base);
    expect(recipe.veins.tone).toEqual(recipe.throat.tone);
  });

  it("returns canonical data that cannot drift between renderers", () => {
    const cultivar = definePlumeriaCultivar(ALBA);

    expect(Object.isFrozen(cultivar)).toBe(true);
    expect(Object.isFrozen(cultivar.recipe)).toBe(true);
    expect(Object.isFrozen(cultivar.recipe.body.base.l)).toBe(true);
    expect(() => {
      (cultivar.recipe.body.base.l as unknown as number[])[0] = 0;
    }).toThrow(TypeError);
  });

  it("keeps renderer identity independent from the display name", () => {
    const first = definePlumeriaCultivar(ALBA);
    const renamed = definePlumeriaCultivar({
      ...ALBA,
      name: "another display name",
    });

    expect(growPlumeria("same-recipe", 0, first).uid).toBe(
      growPlumeria("same-recipe", 0, renamed).uid
    );
  });

  it.each([
    ["empty name", { ...ALBA, name: "  " }],
    [
      "short hex",
      { ...ALBA, body: { ...ALBA.body, base: "#fff" as `#${string}` } },
    ],
    [
      "reversed range",
      { ...ALBA, throat: { ...ALBA.throat, reach: [0.7, 0.2] } },
    ],
    [
      "out-of-range strength",
      { ...ALBA, margin: { color: "#edabc0", strength: 1.1 } },
    ],
  ] satisfies readonly [
    string,
    PlumeriaCultivarDefinition,
  ][])("rejects %s", (_name, definition) => {
    expect(() => definePlumeriaCultivar(definition)).toThrow();
  });

  it("rejects unsupported canonical versions at the renderer boundary", () => {
    const cultivar = definePlumeriaCultivar(ALBA);
    const unsupported = { ...cultivar, version: 2 };

    expect(() =>
      cultivarRecipe(unsupported as unknown as typeof cultivar)
    ).toThrow("unsupported plumeria cultivar");
  });
});
