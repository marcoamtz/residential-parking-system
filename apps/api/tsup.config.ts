import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  clean: true,
  // Workspace packages are TypeScript source; bundle them into the API artifact.
  noExternal: [/^@parking\//],
});
