import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3100);

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Optional: point at an already-installed Chromium instead of `npx playwright install`.
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npm run build && npm run stats:fixtures && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    // Offline and deterministic: saved fixtures, throwaway database.
    env: { NHL_MODE: "fixtures", DATABASE_URL: "db/e2e.sqlite" },
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
