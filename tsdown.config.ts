import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "core/index": "src/core/index.ts",
    "catalog/index": "src/catalog/index.ts",
    "svg/index": "src/svg/index.ts",
    "gl/index": "src/gl/index.ts",
    "devkit/browser": "src/devkit/browser.ts",
    "devkit/index": "src/devkit/index.ts",
  },
  format: "esm",
  dts: true,
  clean: true,
});
