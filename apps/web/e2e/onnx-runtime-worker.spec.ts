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
    trainingSpikeStatus.getByText('fixed adapter-math backend required', { exact: true }),
  ).toBeVisible();
  await expect(trainingSpikeStatus.getByText('ORT package proof', { exact: true })).toBeVisible();
  await expect(
    trainingSpikeStatus.getByText('blocked-no-public-js-api-or-package-artifact', { exact: true }),
  ).toBeVisible();

  const secondTab = await page.context().newPage();
  await secondTab.goto('/');

  await page.getByRole('button', { name: 'Run browser training prototype' }).click();
  let browserTrainingStatus = page.getByLabel('Browser training prototype status');
  let browserTrainingRecovery = page.getByLabel('Browser training recovery status');
  await expect(browserTrainingStatus.getByText('training', { exact: true })).toBeVisible({
    timeout: 10_000,
  });
  await expect(browserTrainingRecovery.getByText(/available at epoch/)).toBeVisible({
    timeout: 10_000,
  });
  await expect(
    browserTrainingRecovery.getByText('training lock held in this browser', { exact: true }),
  ).toBeVisible({ timeout: 10_000 });

  await secondTab.getByRole('button', { name: 'Run browser training prototype' }).click();
  await expect(
    secondTab.getByText(/Another tab is already training this profile\. Pause or cancel it/),
  ).toBeVisible({ timeout: 10_000 });
  await expect(
    secondTab
      .getByLabel('Browser training recovery status')
      .getByText('another tab is training this profile', { exact: true }),
  ).toBeVisible({ timeout: 10_000 });
  await secondTab.close();

  await page.getByRole('button', { name: 'Cancel browser training' }).click();
  await expect(browserTrainingStatus.getByText('cancelled', { exact: true })).toBeVisible({
    timeout: 10_000,
  });
  await expect(browserTrainingRecovery.getByText('cancelled', { exact: true })).toBeVisible();

  await page.reload({ waitUntil: 'networkidle' });
  browserTrainingRecovery = page.getByLabel('Browser training recovery status');
  await expect(browserTrainingRecovery.getByText(/available at epoch/)).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole('button', { name: 'Resume browser training prototype' }).click();
  browserTrainingStatus = page.getByLabel('Browser training prototype status');
  await expect(browserTrainingStatus.getByText('Training worker', { exact: true })).toBeVisible({
    timeout: 10_000,
  });
  await expect(
    browserTrainingStatus.getByText('dedicated-training-worker', { exact: true }),
  ).toBeVisible();
  await expect(browserTrainingStatus.getByText('Prototype status', { exact: true })).toBeVisible();
  await expect(browserTrainingStatus.getByText('completed', { exact: true })).toBeVisible();
  await expect(browserTrainingStatus.getByText('Training examples', { exact: true })).toBeVisible();
  await expect(browserTrainingStatus.getByText('Checkpoint epoch', { exact: true })).toBeVisible();
  await expect(browserTrainingStatus.getByText('Loss reduction', { exact: true })).toBeVisible();
  await expect(
    browserTrainingStatus.getByText('required before activation', { exact: true }),
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
