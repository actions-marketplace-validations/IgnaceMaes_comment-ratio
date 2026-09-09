import { defineConfig } from "tsdown";

/**
 * GitHub runs JavaScript actions straight from the checked-out repository
 * without installing dependencies, so everything must be bundled into a single
 * self-contained entrypoint that is committed to `dist/`.
 */
export default defineConfig({
  entry: { index: "src/main.ts" },
  outDir: "dist",
  format: "esm",
  platform: "node",
  target: "node24",
  // Bundle every dependency; nothing may be left external.
  noExternal: () => true,
  // action.yml points at dist/index.js; package.json is ESM so ".js" is correct.
  outExtensions: () => ({ js: ".js" }),
  dts: false,
  sourcemap: false,
  minify: false,
  clean: true,
  treeshake: true,
});
