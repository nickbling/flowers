import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { definePlumeriaCultivar, type PlumeriaOptions, plumeria } from "@/src";

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
    expected: "0508d02a9131c0d4",
    name: "reference",
    options: { seed: "2026-06-14" },
  },
  {
    expected: "ae6c4594146dfb68",
    name: "bloom hooks",
    options: { seed: "2026-06-14", bloom: true },
  },
  {
    expected: "952cb7581d6beccc",
    name: "ground glow",
    options: { seed: "2026-06-14", glow: true },
  },
  {
    expected: "08f54774ffe487a7",
    name: "cast shadow",
    options: { seed: "2026-06-14", shadow: true },
  },
  {
    expected: "2feaceacc08a48a8",
    name: "alternate seed",
    options: { seed: "hello" },
  },
  {
    expected: "c0c6bfa15d5f5c5d",
    name: "dated moon exposure",
    options: { date: "1991-03-22", seed: "1991-03-22" },
  },
  {
    expected: "1f215d7c7e06017d",
    name: "full moon exposure",
    options: { date: "2000-01-21", seed: "2000-01-21" },
  },
  {
    expected: "5b498c9736b06ca6",
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
});
