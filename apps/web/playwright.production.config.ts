import { defineConfig, devices } from '@playwright/test';

const chromiumExecutablePath = process.env['PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'];

export default defineConfig({
  testDir: './e2e',
  timeout: 45 * 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env['SPEECH_PRODUCTION_BASE_URL'] ?? 'https://speech-amber-beta.vercel.app',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'production-chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          ...(chromiumExecutablePath ? { executablePath: chromiumExecutablePath } : {}),
        },
      },
    },
  ],
});
