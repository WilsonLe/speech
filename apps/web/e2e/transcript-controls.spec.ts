import { expect, test, type Locator, type Page } from '@playwright/test';

test('captures while the hold-to-talk control is pressed', async ({ page }) => {
  await page.goto('/');

  const transcript = page.getByRole('region', { name: /focused push-to-talk dictation/i });
  const pushToTalk = transcript.getByRole('button', { name: /hold to talk/i });
  const output = transcript.getByLabel('Transcript output');
  const metrics = transcript.getByLabel('Transcript latency and capture status');

  await pressButton(page, pushToTalk);
  await expect(pushToTalk).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
  await expect(output).toContainText('Listening…');
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
  const output = transcript.getByLabel('Transcript output');

  await page.keyboard.down('Space');
  await expect(pushToTalk).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
  await expect(output).toContainText('Listening…');
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  await page.keyboard.up('Space');
  await expect(pushToTalk).toHaveText(/hold to talk/i, { timeout: 10_000 });
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
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
