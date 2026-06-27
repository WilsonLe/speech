import { readFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockTinyBaseModelInstall, seedInstalledBaseModel } from './model-setup-fixture';

test('shows in-place model setup and installs a verified model before dictation', async ({
  page,
}) => {
  await mockTinyBaseModelInstall(page);
  await page.goto('/');

  const setup = page.getByRole('region', { name: /speech model required/i });
  await expect(setup).toBeVisible({ timeout: 10_000 });
  await expect(setup.locator('.dictate-setup-card__summary')).toContainText(
    /Version 2025-07-24-e827965 · \d+ B download/,
  );
  await expect(setup.getByRole('button', { name: 'Install model', exact: true })).toBeEnabled({
    timeout: 10_000,
  });
  await expect(setup.locator('.push-to-talk-button')).toHaveCount(0);

  await setup.getByText('Model details', { exact: true }).click();
  await expect(setup.getByLabel('Required speech model details')).toContainText('Apache-2.0');
  await expect(setup.getByLabel('Model provenance notes')).toContainText('No model weights');

  await setup.getByRole('button', { name: 'Install model', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Model setup progress' })).toContainText(
    /Downloading model|Verifying model|Saving download|Activating model|Removing partial download/,
    { timeout: 10_000 },
  );
  const transcript = page.getByRole('region', { name: /^dictate$/i });
  await expect(transcript.locator('.push-to-talk-button')).toBeVisible({ timeout: 10_000 });
});

test('captures while the hold-to-talk control is pressed', async ({ page }) => {
  await seedInstalledBaseModel(page);

  const transcript = page.getByRole('region', { name: /^dictate$/i });
  const pushToTalk = transcript.locator('.push-to-talk-button');
  const provisional = transcript.getByLabel('Provisional transcript suffix');

  await transcript.getByText('Dictation details', { exact: true }).click();
  const metrics = transcript.getByLabel('Transcript latency and capture status');

  await pressButton(page, pushToTalk);
  await expect(pushToTalk).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
  await expect(provisional).toContainText('Listening…');
  await expect(transcript.getByRole('button', { name: 'Copy' })).toHaveCount(0);
  await expect
    .poll(async () => readMetric(metrics, 'Chunks'), { timeout: 10_000 })
    .toBeGreaterThan(0);

  await page.mouse.up();
  await expect(pushToTalk).toHaveText(/hold to speak/i, { timeout: 10_000 });
  await expect(pushToTalk).toHaveAttribute('aria-pressed', 'false');
});

test('uses Space as a page-scoped push-to-talk shortcut without scrolling', async ({ page }) => {
  await seedInstalledBaseModel(page);
  await page.evaluate(() => window.scrollTo(0, 0));

  const transcript = page.getByRole('region', { name: /^dictate$/i });
  const pushToTalk = transcript.locator('.push-to-talk-button');
  const provisional = transcript.getByLabel('Provisional transcript suffix');

  await page.keyboard.down('Space');
  await expect(pushToTalk).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
  await expect(provisional).toContainText('Listening…');
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  await page.keyboard.up('Space');
  await expect(pushToTalk).toHaveText(/hold to speak/i, { timeout: 10_000 });
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('edits, copies, downloads, and clears committed transcript text locally', async ({
  context,
  page,
}) => {
  await seedInstalledBaseModel(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: new URL(page.url()).origin,
  });

  const transcript = page.getByRole('region', { name: /^dictate$/i });
  const output = transcript.getByRole('textbox', { name: 'Transcript' });
  await expect(transcript.getByRole('button', { name: 'Copy' })).toHaveCount(0);
  await output.fill('Xin chào local-first speech.');

  await expect(transcript.getByRole('button', { name: 'Copy' })).toBeEnabled();
  await transcript.getByRole('button', { name: 'Copy' }).click();
  await expect(transcript.getByText('Copied.', { exact: true })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe('Xin chào local-first speech.');

  await transcript.getByText('Dictation details', { exact: true }).click();
  const languageDiagnostics = transcript.getByLabel('Language-span diagnostics');
  await expect(languageDiagnostics.getByText('No spans yet', { exact: true })).toBeVisible();

  await transcript.locator('#language-mode-select').selectOption('mixed');
  await expect(languageDiagnostics.getByText('Mixed', { exact: true })).toHaveCount(2);
  await transcript.getByLabel(/Enable final formatting/i).uncheck();
  await transcript.getByLabel(/Enable spoken commands/i).check();
  await transcript.getByLabel(/Include timing in downloaded text/i).check();

  await transcript.getByRole('button', { name: 'Transcript actions' }).click();
  const actions = page.getByRole('menu', { name: 'Transcript actions' });
  const downloadPromise = page.waitForEvent('download');
  await actions.getByRole('menuitem', { name: /Download text/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^speech-transcript-.*\.txt$/);
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const downloadedText = await readFile(downloadPath!, 'utf8');
  expect(downloadedText).toContain('Xin chào local-first speech.');
  expect(downloadedText).toContain('Language mode: Mixed');
  expect(downloadedText).toContain('Effective language mode: mixed');
  expect(downloadedText).toContain('Language spans: none');
  expect(downloadedText).toContain('Formatting: disabled');
  expect(downloadedText).toContain('Spoken commands: enabled');

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('Clear transcript?');
    await dialog.accept();
  });
  await transcript.getByRole('button', { name: 'Transcript actions' }).click();
  await page
    .getByRole('menu', { name: 'Transcript actions' })
    .getByRole('menuitem', { name: 'Clear transcript' })
    .click();
  await expect(output).toHaveValue('');
  await expect(transcript.getByRole('button', { name: 'Copy' })).toHaveCount(0);
});

async function pressButton(page: Page, button: Locator): Promise<void> {
  await button.scrollIntoViewIfNeeded();
  const box = await button.boundingBox();
  if (!box) {
    throw new Error('Hold-to-talk button is not visible.');
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
}

async function readMetric(metrics: Locator, label: string): Promise<number> {
  const lines = (await metrics.innerText()).split(/\n+/).map((line) => line.trim());
  const expectedLabel = label.toLocaleLowerCase();
  const labelIndex = lines.findIndex((line) => line.toLocaleLowerCase() === expectedLabel);
  if (labelIndex < 0) {
    return 0;
  }

  return Number(lines[labelIndex + 1] ?? 0);
}
