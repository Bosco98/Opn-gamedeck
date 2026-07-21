import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // expose on the LAN so phones can open the controller page
    port: 5173,
    fs: {
      // @opencontrol/sdk is npm-linked from ../sdk — let Vite serve it in dev
      allow: [".."],
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        controller: resolve(__dirname, "controller.html"),
      },
    },
  },
});
