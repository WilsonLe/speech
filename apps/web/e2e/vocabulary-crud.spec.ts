import { expect, test, type Download } from '@playwright/test';

async function readDownloadText(download: Download): Promise<string> {
  const path = await download.path();
  if (path === null) throw new Error('Download path was not available.');
  return await import('node:fs/promises').then((fs) => fs.readFile(path, 'utf8'));
}

test('manages local vocabulary entries and imports/exports JSON and CSV', async ({ page }) => {
  await page.goto('/');

  const panel = page.getByRole('region', { name: /local vocabulary sets/i });
  await expect(panel.getByText(/local vocabulary store/i)).toBeVisible();

  await page.locator('#vocabulary-phrase').fill('Pangea Chat');
  await page.locator('#vocabulary-display-form').fill('Pangea Chat');
  await page.locator('#vocabulary-language').selectOption('mixed');
  await page.locator('#vocabulary-aliases').fill('pangea dashboard');
  await page.locator('#vocabulary-weight').fill('7');
  await page.locator('#vocabulary-category').fill('Work');
  await page.locator('#vocabulary-priority').fill('10');
  await panel.getByRole('button', { name: 'Add entry' }).click();

  const entry = panel.getByRole('article', { name: /vocabulary entry pangea chat/i });
  await expect(entry).toBeVisible();
  await expect(entry).toContainText('Aliases: pangea dashboard');

  await entry.getByRole('button', { name: 'Edit' }).click();
  await page.locator('#vocabulary-display-form').fill('Pangea Chat Pro');
  await panel.getByRole('button', { name: 'Update entry' }).click();
  await expect(
    panel.getByRole('article', { name: /vocabulary entry pangea chat pro/i }),
  ).toBeVisible();
  const promptPreview = panel.getByLabel(/custom vocabulary prompt preview/i);
  await expect(promptPreview.getByText(/Pangea Chat Pro/).first()).toBeVisible();
  await expect(promptPreview.getByText(/review required before recording/i).first()).toBeVisible();

  const [jsonDownload] = await Promise.all([
    page.waitForEvent('download'),
    panel.getByRole('button', { name: 'Export JSON' }).click(),
  ]);
  const jsonText = await readDownloadText(jsonDownload);
  expect(JSON.parse(jsonText)).toMatchObject({ schemaVersion: 1 });
  expect(jsonText).toContain('Pangea Chat Pro');

  await page.locator('#vocabulary-import-format').selectOption('csv');
  await page
    .locator('#vocabulary-import-text')
    .fill(
      'id,phrase,displayForm,language,spokenAliases,weight,category,enabled,exactCase,promptPriority\nterm-wilson,Wilson,Wilson,en,,5,Contacts,true,true,1',
    );
  await panel.getByRole('button', { name: 'Import locally' }).click();
  await expect(panel.getByRole('article', { name: /vocabulary entry wilson/i })).toBeVisible();

  const [csvDownload] = await Promise.all([
    page.waitForEvent('download'),
    panel.getByRole('button', { name: 'Export selected CSV' }).click(),
  ]);
  const csvText = await readDownloadText(csvDownload);
  expect(csvText).toContain('term-wilson,Wilson,Wilson,en');

  await panel.getByRole('button', { name: 'Disable', exact: true }).first().click();
  await expect(panel.getByText(/Disabled vocabulary entry/i)).toBeVisible();
});
