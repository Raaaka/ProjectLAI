import { defineConfig } from "tsup";

export default defineConfig([
  // CLI binary — ESM only with shebang
  {
    entry: { cli: "src/cli.ts" },
    format: ["esm"],
    dts: true,
    clean: true,
    shims: true,
    target: "node18",
    sourcemap: true,
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
  // Library API — ESM + CJS, no shebang
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    clean: false, // Don't clean, CLI output is already there
    shims: true,
    target: "node18",
    splitting: false,
    sourcemap: true,
  },
]);
