import { defineConfig, devices } from '@playwright/test';

const chromiumExecutablePath = process.env['PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'];
const includeEdgeProject = process.env['SPEECH_E2E_EDGE'] === '1';
const fakeMediaArgs = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'];
const chromiumLaunchOptions = {
  ...(chromiumExecutablePath ? { executablePath: chromiumExecutablePath } : {}),
  args: fakeMediaArgs,
};
const browserProjects = [
  {
    name: 'chromium',
    use: { ...devices['Desktop Chrome'], launchOptions: chromiumLaunchOptions },
  },
  ...(includeEdgeProject
    ? [
        {
          name: 'edge',
          use: {
            ...devices['Desktop Edge'],
            channel: 'msedge' as const,
            launchOptions: { args: fakeMediaArgs },
          },
        },
      ]
    : []),
];

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm build && pnpm preview --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
  projects: browserProjects,
});
