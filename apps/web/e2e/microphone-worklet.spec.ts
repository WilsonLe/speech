import { expect, test, type Locator } from '@playwright/test';

test('starts AudioWorklet PCM capture with a fake microphone', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: /start microphone check/i }).click();

  const metrics = page.locator('[aria-label="AudioWorklet capture metrics"]');
  await expect(metrics).toContainText('capturing', { timeout: 10_000 });
  await expect
    .poll(async () => readMetric(metrics, 'Captured chunks'), { timeout: 10_000 })
    .toBeGreaterThan(0);
  await expect
    .poll(async () => readMetric(metrics, 'Captured samples'), { timeout: 10_000 })
    .toBeGreaterThan(0);

  await page.getByRole('button', { name: /stop microphone/i }).click();
  await expect(metrics).toContainText('stopped');
  await expect(page.getByText(/microphone resources were released/i)).toBeVisible();
});

async function readMetric(metrics: Locator, label: string): Promise<number> {
  const lines = (await metrics.innerText()).split(/\n+/).map((line) => line.trim());
  const labelIndex = lines.findIndex((line) => line === label);
  if (labelIndex < 0) {
    return 0;
  }

  return Number(lines[labelIndex + 1] ?? 0);
}
