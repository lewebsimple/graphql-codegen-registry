import { defineConfig } from "rolldown";

import pkg from "./package.json" assert { type: "json" };

const external = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
];

export default defineConfig({
  input: "src/index.ts",
  output: {
    cleanDir: true,
    chunkFileNames: "chunks/[name].js",
    sourcemap: true,
  },
  external,
  platform: "node",
});
