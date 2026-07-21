import { defineConfig } from "tsup";

export default defineConfig([
  // ESM build for npm consumers (peerjs stays an external dependency)
  {
    entry: { index: "src/index.ts" },
    format: ["esm"],
    dts: true,
    sourcemap: true,
    clean: true,
    target: "es2020",
    platform: "browser",
  },
  // IIFE build for <script> tag consumers — exposes window.OpenControl,
  // bundles peerjs so a single file is all you need.
  {
    entry: { opencontrol: "src/index.ts" },
    format: ["iife"],
    globalName: "OpenControl",
    minify: true,
    sourcemap: true,
    clean: false,
    target: "es2020",
    platform: "browser",
    noExternal: [/.*/],
    outExtension: () => ({ js: ".js" }),
  },
]);
