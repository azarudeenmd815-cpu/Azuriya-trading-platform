import { defineConfig, devices } from "@playwright/test";
const baseURL = process.env.WEB_BASE_URL || "http://localhost:3000";
export default defineConfig({
  testDir: "./tests",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL,
    storageState: {
      cookies: [],
      origins: [
        {
          origin: new URL(baseURL).origin,
          localStorage: [
            {
              name: "azuriya:site-consent",
              value: JSON.stringify({
                essential: true,
                optionalAnalytics: false,
              }),
            },
            { name: "azuriya:language", value: "en" },
          ],
        },
      ],
    },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1512, height: 982 },
      },
    },
  ],
  reporter: "list",
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
