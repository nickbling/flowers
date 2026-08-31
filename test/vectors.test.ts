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
    expected: "6d9f0c0554273474",
    name: "reference",
    options: { seed: "2026-06-14" },
  },
  {
    expected: "e96646f85eea11c8",
    name: "bloom hooks",
    options: { seed: "2026-06-14", bloom: true },
  },
  {
    expected: "b9bb8c4c2da97178",
    name: "ground glow",
    options: { seed: "2026-06-14", glow: true },
  },
  {
    expected: "dedfe04d18e6591c",
    name: "cast shadow",
    options: { seed: "2026-06-14", shadow: true },
  },
  {
    expected: "2479d6ddd43c4e3f",
    name: "alternate seed",
    options: { seed: "hello" },
  },
  {
    expected: "fe070636e738b7c7",
    name: "dated moon exposure",
    options: { date: "1991-03-22", seed: "1991-03-22" },
  },
  {
    expected: "216c47a50b8a5e47",
    name: "full moon exposure",
    options: { date: "2000-01-21", seed: "2000-01-21" },
  },
  {
    expected: "fcfaba0675707d8b",
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
