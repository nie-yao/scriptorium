import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig(() => {
  const apiPort = process.env.SCRIPTORIUM_API_PORT ?? "4317";

  return {
    root: __dirname,
    plugins: [react()],
    resolve: {
      alias: {
        "@scriptorium/core": path.resolve(__dirname, "../../packages/core/src"),
        "@scriptorium/platform": path.resolve(__dirname, "../../packages/platform/src")
      }
    },
    server: {
      host: "127.0.0.1",
      port: 5173,
      proxy: {
        "/api": `http://127.0.0.1:${apiPort}`
      }
    },
    build: {
      outDir: "../../dist/web",
      emptyOutDir: true
    }
  };
});
