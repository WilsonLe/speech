import { expect, test } from '@playwright/test';

test('loads ONNX Runtime Web inside the ASR worker on demand', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Benchmark worker provider' }).click();

  const runtimeStatus = page.getByLabel('ONNX Runtime worker status');
  await expect(runtimeStatus.getByText('Provider', { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(runtimeStatus.locator('dd').first()).toHaveText(/^(wasm|webgpu)$/);
  await expect(runtimeStatus.getByText('Language mode', { exact: true })).toBeVisible();
  await expect(runtimeStatus.getByText('auto', { exact: true })).toBeVisible();
  await expect(runtimeStatus.getByText('Language spans', { exact: true })).toBeVisible();
  await expect(runtimeStatus.getByText('no spans yet', { exact: true })).toBeVisible();
});
