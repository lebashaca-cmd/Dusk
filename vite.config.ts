import { defineConfig } from "vite";

const API = process.env.API_URL ?? "http://localhost:3000";

export default defineConfig({
  root: "src/web",
  publicDir: false,
  build: {
    outDir: "../../dist/web",
    emptyOutDir: true,
    target: "es2022",
  },
  server: {
    port: 5173,
    proxy: {
      // Anchored on purpose: a bare "/api" would also catch the module /api.ts, and "/media" the folder src/web/media.
      "^/api/": API,
      "^/auth/": API,
      "^/media/(track|avatar)/": API,
    },
  },
});
