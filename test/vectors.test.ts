import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  definePlumeriaCultivar,
  getPlumeriaVariant,
  type PlumeriaOptions,
  plumeria,
  plumeriaVariants,
} from "@/src";

const fingerprint = (opts: PlumeriaOptions) =>
  createHash("sha256").update(plumeria(opts)).digest("hex").slice(0, 16);

const ALBA = definePlumeriaCultivar({
  name: "alba rosa",
  body: { base: "#fffaf2", tip: "#fffefd" },
  throat: { color: "#f2bd22", reach: [0.46, 0.58] },
  margin: { color: "#e9a7bc", strength: [0.08, 0.18] },
  form: { fullness: [0.72, 0.9] },
});

const CASES: readonly Readonly<{
  expected: string;
  name: string;
  options: PlumeriaOptions;
}>[] = [
  {
    expected: "76aa25e864be78ad",
    name: "reference",
    options: { seed: "2026-06-14" },
  },
  {
    expected: "3f1607e17e9febdb",
    name: "bloom hooks",
    options: { seed: "2026-06-14", bloom: true },
  },
  {
    expected: "b882818f47c5f9c7",
    name: "ground glow",
    options: { seed: "2026-06-14", glow: true },
  },
  {
    expected: "934a5c80ec44f071",
    name: "cast shadow",
    options: { seed: "2026-06-14", shadow: true },
  },
  {
    expected: "7593970fc256b55b",
    name: "alternate seed",
    options: { seed: "hello" },
  },
  {
    expected: "035b3e3dc999d5ea",
    name: "dated moon exposure",
    options: { date: "1991-03-22", seed: "1991-03-22" },
  },
  {
    expected: "3a971c1b03b99397",
    name: "full moon exposure",
    options: { date: "2000-01-21", seed: "2000-01-21" },
  },
  {
    expected: "c4a2dd1a5fa4755c",
    name: "custom cultivar",
    options: { seed: "custom-alba", cultivar: ALBA },
  },
];

describe("plumeria vectors", () => {
  for (const { expected, name, options } of CASES) {
    it(`is frozen for ${name}`, () => {
      expect(fingerprint(options)).toBe(expected);
    });
  }

  it("freezes catalog SVG output", () => {
    const corpus = plumeriaVariants
      .map(({ id }) =>
        plumeria({
          seed: `proof:${id}`,
          variant: getPlumeriaVariant(id),
        })
      )
      .join("\0");

    expect(createHash("sha256").update(corpus).digest("hex").slice(0, 16)).toBe(
      "3dce28a37065a79f"
    );
  });
});
