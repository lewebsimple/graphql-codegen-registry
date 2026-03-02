import { defineConfig } from "rolldown";

import pkg from "./package.json" assert { type: "json" };

const external = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
];

export default defineConfig({
  input: {
    preset: "src/preset/index.ts",
    plugin: "src/plugin/index.ts",
  },
  output: {
    cleanDir: true,
    entryFileNames: "[name]/index.js",
    chunkFileNames: "chunks/[name].js",
    sourcemap: true,
  },
  external,
  platform: "node",
});
