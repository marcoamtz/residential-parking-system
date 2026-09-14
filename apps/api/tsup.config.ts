import { defineConfig } from "tsup";

/**
 * Single-file bundles for the container image: the API server, the rotation worker, and the
 * migrator. Everything is bundled, including workspace packages and node_modules, so the runtime
 * image needs Node.js and dist/ only. pg-native is an optional native binding pg probes for.
 * Code splitting is off so each entrypoint is one self-contained file (ADR-0014).
 */
export default defineConfig({
  entry: {
    index: "src/index.ts",
    scheduler: "src/scheduler/index.ts",
    migrate: "../../packages/db/src/migrate.ts",
  },
  format: ["esm"],
  splitting: false,
  target: "node22",
  platform: "node",
  clean: true,
  noExternal: [/.*/],
  external: ["pg-native"],
  banner: {
    // ESM bundles of CommonJS packages (pg, ioredis) expect `require` to exist.
    // Aliased so it cannot collide with a bundled dependency's own `createRequire` import.
    js: 'import { createRequire as __bundleCreateRequire } from "node:module"; const require = __bundleCreateRequire(import.meta.url);',
  },
});
