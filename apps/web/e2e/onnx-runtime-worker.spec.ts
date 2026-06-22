import { expect, test } from '@playwright/test';

test('loads ONNX Runtime Web inside the ASR worker on demand', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Check worker runtime' }).click();

  const runtimeStatus = page.getByLabel('ONNX Runtime worker status');
  await expect(runtimeStatus.getByText('Provider', { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(runtimeStatus.getByText('wasm', { exact: true })).toBeVisible();
});
