import { expect, test, type Download } from '@playwright/test';

async function readDownloadText(download: Download): Promise<string> {
  const path = await download.path();
  if (path === null) throw new Error('Download path was not available.');
  return await import('node:fs/promises').then((fs) => fs.readFile(path, 'utf8'));
}

test('manages compact vocabulary sets and preserves local import/export semantics', async ({
  page,
}) => {
  await page.goto('/');

  const panel = page.getByRole('region', { name: /vocabulary sets/i });
  await expect(panel.getByRole('heading', { name: 'Vocabulary sets' })).toBeVisible();
  await expect(panel.getByRole('button', { name: /open work/i })).toBeVisible();
  await expect(panel.getByRole('button', { name: /turn off work/i })).toBeVisible();

  await page.locator('#new-vocabulary-set-name').fill('Contacts');
  await panel.getByRole('button', { name: 'New set', exact: true }).click();
  await expect(panel.getByRole('button', { name: /open contacts/i })).toBeVisible();
  await expect(panel.getByText('Applies next recording.')).toBeVisible();

  await page.locator('#vocabulary-set-search').fill('Work');
  await expect(panel.getByRole('button', { name: /open work/i })).toBeVisible();
  await expect(panel.getByRole('button', { name: /open contacts/i })).toHaveCount(0);
  await page.locator('#vocabulary-set-search').fill('Contacts');
  await panel.getByRole('button', { name: /open contacts/i }).click();

  await page.locator('#vocabulary-phrase').fill('Pangea Chat');
  await page.locator('#vocabulary-display-form').fill('Pangea Chat');
  await page.locator('#vocabulary-language').selectOption('mixed');
  await page.locator('#vocabulary-aliases').fill('pangea dashboard');
  await page.locator('#vocabulary-weight').fill('7');
  await page.locator('#vocabulary-category').fill('Work');
  await page.locator('#vocabulary-priority').fill('10');
  await panel.getByRole('button', { name: 'Add word' }).click();

  const entry = panel.getByRole('article', { name: /vocabulary entry pangea chat/i });
  await expect(entry).toBeVisible();
  await expect(entry).toContainText('Aliases: pangea dashboard');

  await entry.getByRole('button', { name: 'Edit' }).click();
  await page.locator('#vocabulary-display-form').fill('Pangea Chat Pro');
  await panel.getByRole('button', { name: 'Update word' }).click();
  await expect(
    panel.getByRole('article', { name: /vocabulary entry pangea chat pro/i }),
  ).toBeVisible();

  await panel.getByText('Enrollment prompts').click();
  const promptPreview = panel.getByLabel(/custom vocabulary prompt preview/i);
  await expect(promptPreview.getByText(/Pangea Chat Pro/).first()).toBeVisible();

  await panel.getByRole('button', { name: 'More' }).first().click();
  await expect(panel.getByRole('menuitem', { name: 'Import or export…' })).toBeVisible();
  await panel.getByRole('menuitem', { name: 'Import or export…' }).click();
  await expect(panel.getByText('Downloads may contain sensitive names')).toBeVisible();

  const [jsonDownload] = await Promise.all([
    page.waitForEvent('download'),
    panel.getByRole('button', { name: 'Export all JSON' }).click(),
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
