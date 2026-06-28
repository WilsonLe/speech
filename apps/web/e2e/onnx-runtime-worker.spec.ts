import { expect, test, type Page } from '@playwright/test';

test('loads ONNX Runtime Web inside the ASR worker on demand', async ({ page }) => {
  await page.goto('/');

  await page.locator('summary', { hasText: 'Training support details' }).click();
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

  await expect(page.getByRole('button', { name: 'Restart training check' })).toBeDisabled();
  await page.getByRole('button', { name: 'Run training check' }).click();
  let browserTrainingProgress = page.getByLabel('Training progress');
  await expect(
    browserTrainingProgress.getByRole('heading', { name: 'Training voice model' }),
  ).toBeVisible({
    timeout: 10_000,
  });
  await expect(
    browserTrainingProgress.getByText('Preparing', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    browserTrainingProgress.getByText('Training', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    browserTrainingProgress.getByText('Checking', { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText('Training is running locally.', { exact: true })).toBeVisible({
    timeout: 10_000,
  });
  let trainingDetails = await openTrainingDetails(page);
  let browserTrainingRecovery = trainingDetails.getByLabel('Browser training recovery status');
  await expect(browserTrainingRecovery.getByText(/available at epoch/)).toBeVisible({
    timeout: 10_000,
  });
  await expect(
    browserTrainingRecovery.getByText('training lock held in this browser', { exact: true }),
  ).toBeVisible({ timeout: 10_000 });

  const cancelDialogMessages: string[] = [];
  page.once('dialog', async (dialog) => {
    cancelDialogMessages.push(dialog.message());
    await dialog.dismiss();
  });
  await page.getByRole('button', { name: 'Cancel training check' }).click();
  expect(cancelDialogMessages.join(' ')).toMatch(/Cancel training check/);
  await expect(page.getByText('Training is running locally.', { exact: true })).toBeVisible();

  await secondTab.getByRole('button', { name: 'Run training check' }).click();
  await expect(secondTab.locator('.error-message')).toContainText(
    'Another tab is already training this voice model. Pause or cancel that run, then try again.',
    { timeout: 10_000 },
  );
  await expect(secondTab.getByLabel('Training progress')).toContainText('Training needs attention');
  await secondTab.close();

  await page.getByRole('button', { name: 'Check training support' }).click();
  const pauseOutcome = await waitForPauseOrCompletion(page);
  trainingDetails = await openTrainingDetails(page);
  browserTrainingRecovery = trainingDetails.getByLabel('Browser training recovery status');
  browserTrainingProgress = page.getByLabel('Training progress');
  if (pauseOutcome === 'paused') {
    await expect(browserTrainingRecovery.getByText('paused', { exact: true })).toBeVisible();
    await expect(
      page
        .getByLabel('Training resource guidance')
        .getByText('ASR runtime activity can pause training at a cooperative checkpoint boundary.'),
    ).toBeVisible();
    await expect(
      browserTrainingProgress.getByRole('heading', { name: 'Training paused' }),
    ).toBeVisible({
      timeout: 10_000,
    });
  } else {
    await expect(
      browserTrainingProgress.getByText(
        'Training finished. Review results before using the model.',
        {
          exact: true,
        },
      ),
    ).toBeVisible();
  }
  const restartButton = page.getByRole('button', { name: 'Restart training check' });
  await expect(restartButton).toBeEnabled();
  const restartDialogMessages: string[] = [];
  page.once('dialog', async (dialog) => {
    restartDialogMessages.push(dialog.message());
    await dialog.dismiss();
  });
  await restartButton.click();
  expect(restartDialogMessages.join(' ')).toMatch(/Restart training check/);
  await expect(browserTrainingRecovery.getByText(/available at epoch/)).toBeVisible();

  await page.reload({ waitUntil: 'networkidle' });
  trainingDetails = await openTrainingDetails(page);
  browserTrainingRecovery = trainingDetails.getByLabel('Browser training recovery status');
  browserTrainingProgress = page.getByLabel('Training progress');
  await expect(browserTrainingRecovery.getByText(/available at epoch/)).toBeVisible({
    timeout: 10_000,
  });
  await expect(
    browserTrainingProgress.getByRole('heading', { name: 'Resume training' }),
  ).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole('button', { name: 'Resume training check' }).click();
  browserTrainingProgress = page.getByLabel('Training progress');
  await expect(
    browserTrainingProgress.getByText('Training finished. Review results before using the model.', {
      exact: true,
    }),
  ).toBeVisible({
    timeout: 10_000,
  });
  await expect(
    browserTrainingProgress.getByRole('heading', { name: 'Checking results' }),
  ).toBeVisible();
  trainingDetails = await openTrainingDetails(page);
  const technicalDetails = trainingDetails.getByLabel('Training technical details');
  await expect(technicalDetails.getByText('Epochs completed', { exact: true })).toBeVisible();
  await expect(technicalDetails.getByText('Loss reduction', { exact: true })).toBeVisible();
  await expect(technicalDetails.getByText('Quality gate', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Check training support' }).click();

  const runtimeDisclosure = page.locator('details', { hasText: 'Runtime details' });
  await runtimeDisclosure.locator('summary').click();
  const runtimeStatus = page.getByLabel('Runtime details');
  await expect(runtimeStatus.getByText('Processing mode', { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(runtimeStatus.locator('dd').first()).toHaveText(/^(wasm|webgpu)$/);
  await expect(runtimeStatus.getByText('Language mode', { exact: true })).toBeVisible();
  await expect(runtimeStatus.getByText('auto', { exact: true })).toBeVisible();
  await expect(runtimeStatus.getByText('Language spans', { exact: true })).toBeVisible();
  await expect(runtimeStatus.getByText('no spans yet', { exact: true })).toBeVisible();
  await expect(runtimeStatus.getByText('Personal-model profile', { exact: true })).toBeVisible();
  await expect(runtimeStatus.getByText('profile loaded', { exact: true })).toBeVisible();
  await expect(runtimeStatus.getByText('Personal-model run time', { exact: true })).toBeVisible();
  await expect(runtimeStatus.getByText('Personal-model overhead', { exact: true })).toBeVisible();
});

async function openTrainingDetails(page: Page) {
  const details = page.locator('details.training-details-disclosure', {
    has: page.locator('summary', { hasText: 'Training details' }),
  });
  if ((await details.getAttribute('open')) === null) {
    await details.locator('summary').click();
  }
  return details;
}

async function waitForPauseOrCompletion(page: Page): Promise<'paused' | 'completed'> {
  const pausedMessage = page.getByText('Training paused. Progress is saved on this device.', {
    exact: true,
  });
  const completedMessage = page
    .getByLabel('Training progress')
    .getByText('Training finished. Review results before using the model.', { exact: true });
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await pausedMessage.isVisible()) return 'paused';
    if (await completedMessage.isVisible()) return 'completed';
    await page.waitForTimeout(100);
  }
  await expect(pausedMessage).toBeVisible({ timeout: 1 });
  return 'paused';
}
