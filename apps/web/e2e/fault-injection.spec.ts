import { expect, test, type Download, type Locator, type Page } from '@playwright/test';

const browserTrainingWorkerRoute = /\/assets\/browser-training\.worker-[^/]+\.js$/;
const recoveryStorageKey = 'speech:browser-training-recovery:v1';

test.describe('cross-browser personal-model fault injection', () => {
  test('surfaces injected browser-training worker faults without leaking private artifacts', async ({
    page,
  }) => {
    await page.route(browserTrainingWorkerRoute, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: `self.addEventListener('message', (event) => {
          const requestId = event.data && event.data.requestId ? event.data.requestId : 'fault-request';
          self.postMessage({
            type: 'BROWSER_TRAINING_ERROR',
            requestId,
            message: 'Injected browser-training worker fault.'
          });
        });`,
      });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Run browser training prototype' }).click();

    const runtime = page.locator('section.runtime');
    await expect(runtime.locator('.error-message')).toContainText(
      'Injected browser-training worker fault.',
      { timeout: 10_000 },
    );
    await expect(runtime.getByLabel('Browser training named-phase progress')).toContainText(
      'Worker returned an error before the run completed.',
    );
    await assertNoPrivateArtifactLeak(runtime.locator('.error-message'));
  });

  test('keeps training fault-tolerant when recovery checkpoint storage hits quota', async ({
    page,
  }) => {
    await page.addInitScript((storageKey) => {
      const nativeSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function patchedSetItem(key: string, value: string): void {
        if (key === storageKey) {
          throw new DOMException('Injected recovery storage quota exceeded.', 'QuotaExceededError');
        }
        return nativeSetItem.call(this, key, value);
      };
    }, recoveryStorageKey);

    await page.goto('/');
    await page.getByRole('button', { name: 'Run browser training prototype' }).click();

    const runtime = page.locator('section.runtime');
    const status = runtime.getByLabel('Browser training prototype status');
    await expect(status.getByText('training', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(runtime.getByText(/Prototype recovery uses browser-local storage/)).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole('button', { name: 'Pause browser training' }).click();
    await expect(status.getByText('paused', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(runtime.getByLabel('Browser training recovery status')).toContainText(
      'Recovery statusnone',
    );
    await expect(
      page.getByRole('button', { name: 'Resume browser training prototype' }),
    ).toBeDisabled();
  });

  test('rejects hostile profile imports without echoing private identifiers', async ({ page }) => {
    await page.goto('/');

    const personalModels = page.locator('section.personal-models');
    const hostileProfileId = 'private-profile-id-should-not-render';
    await personalModels.locator('input[type="file"]').setInputFiles({
      name: 'hostile.speechprofile.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          schemaVersion: 1,
          packageType: 'speech-enrollment-profile-export',
          profileId: hostileProfileId,
          profile: { id: hostileProfileId },
          utterances: [],
          files: {},
        }),
        'utf8',
      ),
    });

    await expect(personalModels.locator('.error-message')).toBeVisible({ timeout: 10_000 });
    await expect(personalModels.locator('.error-message')).not.toContainText(hostileProfileId);
    await expect(personalModels.getByLabel('Personal voice model rows')).toContainText('Generic');
  });

  test('covers profile export/import, activation, rollback, and deletion under fake media', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto('/');

    const profileStore = page.getByLabel('Enrollment profile storage');
    await expect(profileStore).toContainText('ready', { timeout: 10_000 });
    await deleteStoredProfileIfPresent(profileStore);
    const exportedProfilePath = await saveOneAcceptedTakeAndExport(page, profileStore);

    const personalModels = page.locator('section.personal-models');
    await personalModels.getByRole('button', { name: 'Refresh' }).click();
    await expect(personalModels.getByLabel('Personal voice model rows')).toContainText(
      'Local enrollment profile',
      { timeout: 10_000 },
    );
    await personalModels.getByLabel('Import behavior').selectOption('import-as-new');
    await personalModels
      .locator('.model-list-toolbar input[type="file"]')
      .setInputFiles(exportedProfilePath);
    await expect(
      personalModels.getByText(
        /Import checks passed and (a new local voice model was created|the display-name conflict was resolved)\./i,
      ),
    ).toBeVisible({ timeout: 10_000 });

    const profileRows = personalModels
      .locator('.model-list-row')
      .filter({ hasText: 'Local enrollment profile' });
    await expect(profileRows).toHaveCount(2);

    const inactiveEnableButton = profileRows
      .locator('button:has-text("Use model"):not(:disabled)')
      .first();
    await inactiveEnableButton.click();
    await expect(
      personalModels.getByText(
        'Local voice model state was refreshed. Continue with the next model task.',
      ),
    ).toBeVisible({ timeout: 10_000 });
    await expect(personalModels.locator('.model-list-row .status-chip.success')).toHaveCount(1);

    const activeRow = personalModels
      .locator('.model-list-row')
      .filter({ hasText: 'Active' })
      .first();
    await activeRow.getByRole('button', { name: 'More' }).click();
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('menuitem', { name: 'Roll back…' }).click();
    await expect(
      personalModels.getByText(
        'Local voice model state was refreshed. Continue with the next model task.',
      ),
    ).toBeVisible({ timeout: 10_000 });
    await expect(personalModels.locator('.model-list-row .status-chip.success')).toHaveCount(1);

    const deletableRow = personalModels
      .locator('.model-list-row')
      .filter({ hasText: 'Local enrollment profile' })
      .first();
    await deletableRow.getByRole('button', { name: 'More' }).click();
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('menuitem', { name: /Delete Local enrollment profile/ }).click();
    await expect(
      personalModels.getByText(
        'Stored recordings, training data, model files, and local pointers were deleted. Use the generic model or create another voice model.',
      ),
    ).toBeVisible({ timeout: 10_000 });
    await expect(personalModels).toContainText('Models privacy: aggregate counts only');
  });
});

async function saveOneAcceptedTakeAndExport(page: Page, profileStore: Locator): Promise<string> {
  await page.getByRole('button', { name: /start microphone check/i }).click();
  const recorder = page.getByLabel('Enrollment recorder', { exact: true });
  await recorder.getByRole('button', { name: /start enrollment take/i }).click();
  await expect(recorder).toContainText('recording');
  await expect
    .poll(async () => readMetric(recorder, 'Take samples'), { timeout: 10_000 })
    .toBeGreaterThan(0);
  await recorder.getByRole('button', { name: /stop and analyze take/i }).click();
  await expect(page.getByLabel('Enrollment quality report')).toContainText('Quality report', {
    timeout: 10_000,
  });
  const acceptAndSave = recorder.getByRole('button', { name: /manually accept and save take/i });
  await expect(acceptAndSave).toBeEnabled({ timeout: 10_000 });
  await acceptAndSave.click();
  await expect(profileStore).toContainText(/Accepted take saved/i, { timeout: 10_000 });
  await profileStore.getByRole('button', { name: /enable local profile/i }).click();
  await expect(profileStore).toContainText(/Profile enabled locally/i, { timeout: 10_000 });

  const downloadPromise = page.waitForEvent('download');
  await profileStore.getByRole('button', { name: /export sensitive profile package/i }).click();
  const download = await downloadPromise;
  await expect(profileStore).toContainText(/Profile export downloaded locally/i, {
    timeout: 10_000,
  });
  return requireDownloadPath(download);
}

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
  if (labelIndex < 0) return 0;
  return Number(lines[labelIndex + 1] ?? 0);
}

async function assertNoPrivateArtifactLeak(locator: Locator): Promise<void> {
  await expect(locator).not.toContainText(/raw audio|transcript text|feature tensor/i);
  await expect(locator).not.toContainText(/checkpoint bytes|adapter weights|private vocabulary/i);
}
