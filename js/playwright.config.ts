import { defineConfig } from "@playwright/test";

// The web smoke test runs the app (vite dev server) against build/dist.
export default defineConfig({
  testDir: "test/web",
  testMatch: "*.spec.ts",
  timeout: 180_000,
  use: { baseURL: "http://127.0.0.1:5199/", headless: true },
  webServer: {
    command: "npx vite --host 127.0.0.1 --port 5199 --strictPort",
    url: "http://127.0.0.1:5199/",
    reuseExistingServer: true,
  },
});
