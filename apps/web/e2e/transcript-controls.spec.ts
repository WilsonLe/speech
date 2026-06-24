import { readFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';

test('captures while the hold-to-talk control is pressed', async ({ page }) => {
  await page.goto('/');

  const transcript = page.getByRole('region', { name: /focused push-to-talk dictation/i });
  const pushToTalk = transcript.getByRole('button', { name: /hold to talk/i });
  const provisional = transcript.getByLabel('Provisional transcript suffix');
  const metrics = transcript.getByLabel('Transcript latency and capture status');

  await pressButton(page, pushToTalk);
  await expect(pushToTalk).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
  await expect(provisional).toContainText('Listening…');
  await expect(transcript.getByRole('button', { name: 'Copy' })).toBeDisabled();
  await expect
    .poll(async () => readMetric(metrics, 'Chunks'), { timeout: 10_000 })
    .toBeGreaterThan(0);

  await page.mouse.up();
  await expect(pushToTalk).toHaveText(/hold to talk/i, { timeout: 10_000 });
  await expect(transcript.getByText(/audio capture ended|utterance finalized/i)).toBeVisible();
});

test('uses Space as a page-scoped push-to-talk shortcut without scrolling', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.scrollTo(0, 0));

  const transcript = page.getByRole('region', { name: /focused push-to-talk dictation/i });
  const pushToTalk = transcript.getByRole('button', { name: /hold to talk/i });
  const provisional = transcript.getByLabel('Provisional transcript suffix');

  await page.keyboard.down('Space');
  await expect(pushToTalk).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
  await expect(provisional).toContainText('Listening…');
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  await page.keyboard.up('Space');
  await expect(pushToTalk).toHaveText(/hold to talk/i, { timeout: 10_000 });
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('edits, copies, downloads, and clears committed transcript text locally', async ({
  context,
  page,
}) => {
  await page.goto('/');
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: new URL(page.url()).origin,
  });

  const transcript = page.getByRole('region', { name: /focused push-to-talk dictation/i });
  const output = transcript.getByLabel('Transcript output');
  await output.fill('Xin chào local-first speech.');

  await expect(transcript.getByRole('button', { name: 'Copy' })).toBeEnabled();
  await transcript.getByRole('button', { name: 'Copy' }).click();
  await expect(transcript.getByText(/copied to clipboard locally/i)).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe('Xin chào local-first speech.');

  const languageDiagnostics = transcript.getByLabel('Language-span diagnostics');
  await expect(languageDiagnostics.getByText('No spans yet', { exact: true })).toBeVisible();

  await transcript.getByLabel(/Recognition mode/i).selectOption('mixed');
  await expect(
    transcript
      .getByLabel('Transcript runtime state')
      .getByText('Mixed/code-switch', { exact: true }),
  ).toBeVisible();
  await expect(languageDiagnostics.getByText('Mixed/code-switch', { exact: true })).toHaveCount(2);
  await transcript.getByLabel(/Enable final formatting/i).uncheck();
  await transcript.getByLabel(/Enable spoken commands/i).check();
  await transcript.getByLabel(/Include local timing metadata/i).check();

  const downloadPromise = page.waitForEvent('download');
  await transcript.getByRole('button', { name: /Download \.txt/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^speech-transcript-.*\.txt$/);
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const downloadedText = await readFile(downloadPath!, 'utf8');
  expect(downloadedText).toContain('Xin chào local-first speech.');
  expect(downloadedText).toContain('Language mode: Mixed/code-switch');
  expect(downloadedText).toContain('Effective language mode: mixed');
  expect(downloadedText).toContain('Language spans: none');
  expect(downloadedText).toContain('Formatting: disabled');
  expect(downloadedText).toContain('Spoken commands: enabled');

  await transcript.getByRole('button', { name: 'Clear' }).click();
  await expect(output).toHaveValue('');
  await expect(transcript.getByRole('button', { name: 'Copy' })).toBeDisabled();
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
