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
    await page.getByRole('button', { name: 'Run training check' }).click();

    const runtime = page.locator('section.runtime');
    await expect(runtime.locator('.error-message')).toContainText(
      'Training stopped before it finished. Retry or resume from recovery.',
      { timeout: 10_000 },
    );
    await expect(runtime.getByLabel('Training progress')).toContainText('Training needs attention');
    await expect(runtime.getByLabel('Training progress')).toContainText(
      'Resolve the training error, then retry or resume from recovery.',
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
    await page.getByRole('button', { name: 'Run training check' }).click();

    const runtime = page.locator('section.runtime');
    await expect(runtime.getByText('Training is running locally.', { exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      runtime
        .getByLabel('Training resource guidance')
        .getByText(/Prototype recovery uses browser-local storage/),
    ).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Pause training check' }).click();
    await expect(
      runtime.getByText('Training paused. Progress is saved on this device.', { exact: true }),
    ).toBeVisible({ timeout: 10_000 });
    await runtime
      .locator('details.training-details-disclosure', {
        has: page.locator('summary', { hasText: 'Training details' }),
      })
      .locator('summary')
      .click();
    await expect(runtime.getByLabel('Browser training recovery status')).toContainText(
      'Recovery statusnone',
    );
    await expect(page.getByRole('button', { name: 'Resume training check' })).toBeDisabled();
  });

  test('rejects hostile imports without echoing private identifiers', async ({ page }) => {
    await page.goto('/models/import');

    const importFlow = page.locator('section.import-model-flow');
    await expect(importFlow.getByRole('heading', { name: 'Import a voice model' })).toBeVisible();

    await importFlow.locator('input[type="file"][accept*=".speechmodel"]').setInputFiles({
      name: 'hostile.speechmodel',
      mimeType: 'application/vnd.wilsonle.speechmodel',
      buffer: Buffer.from('not-a-portable-model-private-profile-id-should-not-render', 'utf8'),
    });
    await expect(importFlow.locator('.error-message')).toContainText(
      'Choose a valid .speechmodel file. No model data was imported.',
      { timeout: 10_000 },
    );
    await expect(importFlow.locator('.error-message')).not.toContainText('private-profile-id');

    const hostileProfileId = 'private-profile-id-should-not-render';
    await importFlow.locator('summary').filter({ hasText: 'Legacy profile JSON import' }).click();
    await importFlow.locator('input[type="file"][accept*=".speechprofile"]').setInputFiles({
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

    const legacyImportError = page.locator(
      'section.personal-models > p.status-message.error-message',
    );
    await expect(legacyImportError).toBeVisible({ timeout: 10_000 });
    await expect(legacyImportError).not.toContainText(hostileProfileId);
    await page.goto('/models');
    await expect(page.getByLabel('Personal voice model rows')).toContainText('Generic');
  });

  test('covers profile export/import, activation, rollback, and deletion under fake media', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto('/');

    await openRecordingDetails(page);
    const profileStore = page.getByLabel('Enrollment profile storage');
    await expect(profileStore).toContainText('ready', { timeout: 10_000 });
    await deleteStoredProfileIfPresent(page, profileStore);
    const exportedProfilePath = await saveOneAcceptedTakeAndExport(page, profileStore);

    let personalModels = page.locator('section.personal-models');
    await personalModels.getByRole('button', { name: 'Refresh' }).click();
    await expect(personalModels.getByLabel('Personal voice model rows')).toContainText(
      'Local enrollment profile',
      { timeout: 10_000 },
    );
    await page.goto('/models/import');
    const importFlow = page.locator('section.import-model-flow');
    await importFlow.locator('summary').filter({ hasText: 'Legacy profile JSON import' }).click();
    await importFlow.getByLabel('Import behavior').selectOption('import-as-new');
    await importFlow
      .locator('input[type="file"][accept*=".speechprofile"]')
      .setInputFiles(exportedProfilePath);
    await expect(
      personalModels.getByText(
        /Import checks passed and (a new local voice model was created|the display-name conflict was resolved)\./i,
      ),
    ).toBeVisible({ timeout: 10_000 });

    await page.goto('/models');
    personalModels = page.locator('section.personal-models');
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
  const recorder = page.getByLabel('Enrollment recorder', { exact: true });
  await recorder.getByRole('button', { name: 'Start microphone' }).click();
  await expect(recorder.getByRole('button', { name: 'Record' })).toBeEnabled({
    timeout: 10_000,
  });
  await recorder.getByRole('button', { name: 'Record' }).click();
  await expect(recorder).toContainText('Recording');
  await expect
    .poll(async () => readMetric(page.getByLabel('Enrollment recorder metrics'), 'Take samples'), {
      timeout: 10_000,
    })
    .toBeGreaterThan(0);
  await recorder.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByLabel('Enrollment quality report')).toContainText('Quality report', {
    timeout: 10_000,
  });
  const acceptAndSave = recorder.getByRole('button', { name: 'Accept' });
  await expect(acceptAndSave).toBeEnabled({ timeout: 10_000 });
  await acceptAndSave.click();
  await expect(profileStore).toContainText(/Recording saved on this device/i, { timeout: 10_000 });
  await profileStore.getByRole('button', { name: /enable local profile/i }).click();
  await expect(profileStore).toContainText(/Voice model enabled/i, { timeout: 10_000 });

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

async function deleteStoredProfileIfPresent(page: Page, profileStore: Locator): Promise<void> {
  await openRecordingDetails(page);
  const deleteButton = profileStore.getByRole('button', {
    name: /delete stored enrollment profile/i,
  });
  if (await deleteButton.isEnabled({ timeout: 1_000 }).catch(() => false)) {
    await deleteButton.click();
    await expect(profileStore).toContainText(/deleted locally/i, { timeout: 10_000 });
  }
}

async function openRecordingDetails(page: Page): Promise<void> {
  const details = page.locator('details.enrollment-details');
  if (
    (await details.count()) > 0 &&
    !(await details.evaluate((node) => node.hasAttribute('open')))
  ) {
    await page.getByText('Recording details', { exact: true }).click();
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
