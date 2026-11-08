import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", fullyParallel: true, workers: 2, timeout: 30000,
  use: { baseURL: "http://127.0.0.1:3000", headless: true, launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "/usr/bin/chromium", args: ["--no-sandbox"] }, screenshot: "only-on-failure", trace: "retain-on-failure" },
  webServer: { command: "python3 -m http.server 3000 --bind 127.0.0.1 --directory out", url: "http://127.0.0.1:3000", reuseExistingServer: false },
});
