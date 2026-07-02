import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { type PlumeriaOptions, plumeria } from "../src";

// Frozen output of plumeria/1. A seed that grew a certain flower must grow
// the same flower forever, so these fingerprints must not drift. If one
// changes, the species changed, which is a new version for new seeds, never
// an edit here. The snapshot is minted once (vitest -u) and then guards
// every refactor: move a single pixel and it fails.
const fingerprint = (opts: PlumeriaOptions) =>
  createHash("sha256").update(plumeria(opts)).digest("hex").slice(0, 16);

const CASES: PlumeriaOptions[] = [
  { seed: "2026-06-14" },
  { seed: "2026-06-14", theme: "dark" },
  { seed: "2026-06-14", bloom: true },
  { seed: "2026-06-14", glow: true },
  { seed: "2026-06-14", shadow: true },
  { seed: "hello" },
  { date: "1991-03-22", seed: "1991-03-22" },
  { date: "2000-01-21", seed: "2000-01-21" },
];

describe("plumeria/1 vectors", () => {
  for (const opts of CASES) {
    it(`is frozen for ${JSON.stringify(opts)}`, () => {
      expect(fingerprint(opts)).toMatchSnapshot();
    });
  }
});
