import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
  },
  webServer: {
    command: "/home/dmgb/.local/share/mise/installs/bun/1.3.3/bin/bun server/index.ts",
    port: 3000,
    reuseExistingServer: false,
    timeout: 10_000,
    cwd: __dirname,
  },
});
