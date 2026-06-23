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

  const calibration = page.getByLabel('Enrollment calibration guidance');
  await expect(calibration).toContainText('Calibration and voice guidance');
  await calibration.getByRole('button', { name: /room-noise sample/i }).click();
  await calibration.getByRole('button', { name: /normal baseline/i }).click();
  await calibration.getByLabel('Voice condition').selectOption('projected');
  await expect(calibration).toContainText('Projected means loud and clear');
  await expect(calibration).toContainText('Do not strain');

  const recorder = page.getByLabel('Enrollment recorder', { exact: true });
  await expect(recorder).toContainText('Enrollment recorder and quality analyzer');
  await recorder.getByRole('button', { name: /start enrollment take/i }).click();
  await expect(recorder).toContainText('recording');
  await expect
    .poll(async () => readMetric(recorder, 'Take samples'), { timeout: 10_000 })
    .toBeGreaterThan(0);
  await recorder.getByRole('button', { name: /stop and analyze take/i }).click();
  await expect(page.getByLabel('Enrollment quality report')).toContainText('Quality report', {
    timeout: 10_000,
  });
  await expect(page.getByLabel('Enrollment quality report')).toContainText(
    'No audio or transcript text in report',
  );
  await expect(recorder.getByRole('button', { name: /manually accept take/i })).toBeEnabled();
  await recorder.getByRole('button', { name: /retry take/i }).click();
  await expect(recorder).toContainText('Take cleared from memory');

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
