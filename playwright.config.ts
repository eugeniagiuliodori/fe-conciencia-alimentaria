import { existsSync } from "node:fs";
import { chromium, defineConfig } from "playwright/test";

// Evita la captura ARIA automática en los diagnósticos de fallo de Playwright.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = "1";

export default defineConfig({
  testDir: "./scripts/playwright/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  forbidOnly: true,
  reporter: "./scripts/playwright/e2e/reporter.ts",
  outputDir: "./reports/e2e",
  preserveOutput: "never",
  captureGitInfo: { commit: false, diff: false },
  use: {
    browserName: "chromium",
    channel: process.env.E2E_BROWSER_CHANNEL ||
      (existsSync(chromium.executablePath()) ? undefined : "chrome"),
    headless: true,
    viewport: { width: 1280, height: 900 },
    serviceWorkers: "block",
    actionTimeout: 5_000,
    navigationTimeout: 15_000,
    screenshot: "off",
    trace: "off",
    video: "off",
  },
});
