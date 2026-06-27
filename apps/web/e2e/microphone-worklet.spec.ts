import { expect, test, type Download, type Locator } from '@playwright/test';

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
  const profileStore = page.getByLabel('Enrollment profile storage');
  await expect(recorder).toContainText('Enrollment recorder and quality analyzer');
  await expect(profileStore).toContainText('ready', { timeout: 10_000 });
  await deleteStoredProfileIfPresent(profileStore);

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
  const acceptAndSave = recorder.getByRole('button', { name: /manually accept and save take/i });
  await expect(acceptAndSave).toBeEnabled();
  await acceptAndSave.click();
  await expect(profileStore).toContainText(/Accepted take saved/i, { timeout: 10_000 });
  await expect
    .poll(async () => readMetric(profileStore, 'Stored accepted takes'), { timeout: 10_000 })
    .toBeGreaterThan(0);
  const personalModels = page.locator('section.personal-models');
  const personalModelRows = page.getByLabel('Personal voice model rows');
  await personalModels.getByRole('button', { name: /refresh/i }).click();
  await expect(personalModelRows).toContainText('Local enrollment profile', { timeout: 10_000 });
  await expect(personalModelRows).toContainText(/\d+ recordings/);
  await expect(personalModelRows).toContainText('Ready');
  await expect(personalModelRows).toContainText(/\d+ vocabulary/);
  const readiness = page.getByLabel('Training readiness report');
  await expect(readiness).toContainText('Training readiness report');
  await expect(readiness).toContainText('needs-more-data');
  await expect(readiness).toContainText('Aggregate counts only');
  await profileStore.getByRole('button', { name: /enable local profile/i }).click();
  await expect(profileStore).toContainText(/Profile enabled locally/i, { timeout: 10_000 });
  await expect(profileStore).toContainText('local-enrollment-profile');
  const downloadPromise = page.waitForEvent('download');
  await profileStore.getByRole('button', { name: /export sensitive profile package/i }).click();
  const exportedPath = await requireDownloadPath(await downloadPromise);
  await expect(profileStore).toContainText(/Profile export downloaded locally/i, {
    timeout: 10_000,
  });

  await page.reload();
  const resumedProfileStore = page.getByLabel('Enrollment profile storage');
  await expect(resumedProfileStore).toContainText(/resumed accepted enrollment takes/i, {
    timeout: 10_000,
  });
  await expect
    .poll(async () => readMetric(resumedProfileStore, 'Stored accepted takes'), {
      timeout: 10_000,
    })
    .toBeGreaterThan(0);
  await resumedProfileStore
    .getByRole('button', { name: /delete stored enrollment profile/i })
    .click();
  await expect(resumedProfileStore).toContainText(/deleted locally/i, { timeout: 10_000 });
  await expect
    .poll(async () => readMetric(resumedProfileStore, 'Stored accepted takes'), {
      timeout: 10_000,
    })
    .toBe(0);
  await resumedProfileStore.locator('input[type="file"]').setInputFiles(exportedPath);
  await expect(resumedProfileStore).toContainText(/import verified checksums/i, {
    timeout: 10_000,
  });
  await expect
    .poll(async () => readMetric(resumedProfileStore, 'Stored accepted takes'), {
      timeout: 10_000,
    })
    .toBeGreaterThan(0);
  await resumedProfileStore
    .getByRole('button', { name: /delete stored enrollment profile/i })
    .click();
  await expect(resumedProfileStore).toContainText(/deleted locally/i, { timeout: 10_000 });

  await page.getByRole('button', { name: /start microphone check/i }).click();
  await page.getByRole('button', { name: /stop microphone/i }).click();
  await expect(metrics).toContainText('stopped');
  await expect(page.getByLabel('Permission and capture check')).toContainText(
    /microphone stopped\./i,
  );
});

async function requireDownloadPath(download: Download): Promise<string> {
  expect(download.suggestedFilename()).toMatch(/\.speechprofile\.json$/);
  const path = await download.path();
  if (path === null) throw new Error('Profile export download path was unavailable.');
  return path;
}

async function deleteStoredProfileIfPresent(profileStore: Locator): Promise<void> {
  const deleteButton = profileStore.getByRole('button', {
    name: /delete stored enrollment profile/i,
  });
  if (await deleteButton.isEnabled()) {
    await deleteButton.click();
    await expect(profileStore).toContainText(/deleted locally/i, { timeout: 10_000 });
  }
}

async function readMetric(metrics: Locator, label: string): Promise<number> {
  const lines = (await metrics.innerText()).split(/\n+/).map((line) => line.trim());
  const labelIndex = lines.findIndex((line) => line === label);
  if (labelIndex < 0) {
    return 0;
  }

  return Number(lines[labelIndex + 1] ?? 0);
}
