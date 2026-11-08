import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e-connected", workers: 1, timeout: 60000,
  use: { baseURL: "http://127.0.0.1:3000", headless: true, launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "/usr/bin/chromium", args: ["--no-sandbox"] }, screenshot: "only-on-failure", trace: "retain-on-failure" },
  webServer: [
    { command: "../server/node_modules/.bin/tsx ../server/test/connected-fixture.ts", url: "http://127.0.0.1:4000/api/session", reuseExistingServer: false },
    { command: "NEXT_PUBLIC_FS_CONNECTED=true next dev --hostname 127.0.0.1 --port 3000", url: "http://127.0.0.1:3000", reuseExistingServer: false, timeout: 60000 }
  ]
});
