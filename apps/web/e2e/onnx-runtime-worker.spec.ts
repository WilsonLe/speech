import { expect, test } from '@playwright/test';

test('loads ONNX Runtime Web inside the ASR worker on demand', async ({ page }) => {
  await page.goto('/');

  const trainingSpikeStatus = page.getByLabel('ONNX Runtime Web training spike status');
  await expect(trainingSpikeStatus.getByText('Training artifact', { exact: true })).toBeVisible();
  await expect(
    trainingSpikeStatus.getByText('onnxruntime-web 1.27.0', { exact: true }),
  ).toBeVisible();
  await expect(
    trainingSpikeStatus.getByText('Browser training API', { exact: true }),
  ).toBeVisible();
  await expect(trainingSpikeStatus.getByText('not exposed', { exact: true })).toBeVisible();
  await expect(trainingSpikeStatus.getByText('Training decision', { exact: true })).toBeVisible();
  await expect(
    trainingSpikeStatus.getByText('defer; use local trainer', { exact: true }),
  ).toBeVisible();

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
  await expect(runtimeStatus.getByText('Adapter profile', { exact: true })).toBeVisible();
  await expect(runtimeStatus.getByText(/profile-local-adapter-smoke/)).toBeVisible();
  await expect(runtimeStatus.getByText('Adapter median run', { exact: true })).toBeVisible();
  await expect(runtimeStatus.getByText('Adapter RTF overhead', { exact: true })).toBeVisible();
});
