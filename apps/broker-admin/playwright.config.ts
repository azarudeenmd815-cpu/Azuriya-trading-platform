import { defineConfig, devices } from "@playwright/test";
export default defineConfig({ testDir: "./tests", timeout: 90_000, fullyParallel: false, workers: 1, use: { baseURL: process.env.ADMIN_BASE_URL || "http://localhost:3001", trace: "retain-on-failure", screenshot: "only-on-failure" }, projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1512, height: 982 } } }], reporter: "list", webServer: { command: "pnpm dev", url: "http://localhost:3001", reuseExistingServer: true, timeout: 120_000 } });

