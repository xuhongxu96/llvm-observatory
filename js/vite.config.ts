import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// The web app lives in src/web. build/dist (driver, LLVM tools, sources, target.json) is
// served as its public directory, at the site root.
export default defineConfig({
  root: here("src/web"),
  base: "./",
  publicDir: here("../build/dist"),
  plugins: [react()],
  worker: { format: "es" },
  build: { outDir: here("dist"), emptyOutDir: true },
  test: {
    root: here("."),
    include: ["test/unit/**/*.test.ts", "test/web/**/*.test.tsx"],
  },
});
