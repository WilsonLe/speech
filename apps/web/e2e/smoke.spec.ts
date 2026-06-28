import { expect, test } from '@playwright/test';

test('renders the task-first PWA shell', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/speech/);
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeAttached();
  await expect(page.getByRole('banner').getByRole('link', { name: 'Speech' })).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Primary destinations' }).first(),
  ).toContainText('Dictate');
  await expect(
    page.getByRole('navigation', { name: 'Primary destinations' }).first(),
  ).toContainText('Vocabulary');
  await expect(
    page.getByRole('navigation', { name: 'Primary destinations' }).first(),
  ).toContainText('Models');
  const localStatus = page.getByRole('button', { name: /local status:/i });
  await expect(localStatus).toContainText('Local');
  await localStatus.click();
  await expect(page.getByRole('group', { name: 'Local status details' })).toContainText(
    'Model downloads',
  );
  await expect(page.getByRole('group', { name: 'Local status details' })).toContainText(
    'Audio, vocabulary, and personal models stay in this browser.',
  );
  await page.keyboard.press('Escape');
  await expect(page.getByRole('group', { name: 'Local status details' })).toBeHidden();

  const appMenu = page.getByRole('button', { name: 'Menu' });
  await appMenu.click();
  const applicationMenu = page.getByRole('menu', { name: 'Application menu' });
  await expect(applicationMenu).toContainText('Settings');
  await expect(applicationMenu.getByRole('menuitem', { name: 'Settings' })).toHaveAttribute(
    'href',
    '/settings',
  );
  await expect(applicationMenu).toContainText('Storage');
  await expect(applicationMenu).toContainText('Privacy');
  await expect(applicationMenu).toContainText('Keyboard shortcuts');
  await expect(applicationMenu).toContainText('Diagnostics');
  await expect(applicationMenu).toContainText('About');
  await applicationMenu.getByRole('menuitem', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('settings-title');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Audio' })).toHaveAttribute(
    'href',
    '/settings/audio',
  );
  await expect(page.getByRole('link', { name: 'Open Storage' })).toHaveAttribute(
    'href',
    '/settings/storage',
  );
  await page.getByRole('link', { name: 'Open Storage' }).click();
  await expect(page).toHaveURL(/\/settings\/storage$/);
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('storage-title');
  await expect(page.getByRole('heading', { name: 'Storage' })).toBeVisible();
  await expect(page.getByLabel('Storage summary')).toContainText('Speech model downloads');
  await expect(page.getByLabel('Storage summary')).toContainText('Voice models');
  await expect(page.getByLabel('Storage summary')).toContainText('Recordings and training work');
  await page.getByRole('button', { name: 'Delete training data' }).click();
  await expect(page.getByRole('heading', { name: 'Delete training data?' })).toBeVisible();
  await expect(page.getByLabel('Removes')).toContainText('Training job work files');
  await expect(page.getByLabel('Retains')).toContainText('Voice models');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { name: 'Storage' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete all local speech data' }).click();
  await expect(page.getByRole('heading', { name: 'Delete all local speech data?' })).toBeVisible();
  await expect(page.getByLabel('Removes')).toContainText('Speech model downloads');
  await expect(page.getByLabel('Retains')).toContainText('UI preferences');
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.goto('/settings');
  await page.getByRole('link', { name: 'Open Audio' }).click();
  await expect(page).toHaveURL(/\/settings\/audio$/);
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.id))
    .toBe('audio-settings-title');
  await expect(page.getByRole('heading', { name: 'Audio' })).toBeVisible();
  await expect(page.getByText('Recording interaction mode')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start input test' })).toBeVisible();
  await expect(page.getByText('Advanced audio diagnostics')).toBeVisible();

  await appMenu.click();
  await applicationMenu.getByRole('menuitem', { name: 'Diagnostics' }).click();
  await expect(page).toHaveURL(/\/settings\/diagnostics$/);
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.id))
    .toBe('diagnostics-title');

  const primaryNav = page.getByRole('navigation', { name: 'Primary destinations' }).first();
  await primaryNav.getByRole('link', { name: 'Vocabulary' }).click();
  await expect(page).toHaveURL(/\/vocabulary$/);
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('vocabulary-title');
  await primaryNav.getByRole('link', { name: 'Models' }).click();
  await expect(page).toHaveURL(/\/models$/);
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.id))
    .toBe('personal-models-title');
  await page.getByRole('link', { name: 'Skip to main content' }).focus();
  await page.keyboard.press('Enter');
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.id))
    .toBe('personal-models-title');

  await page.goto('/?profileId=office&jobId=job-2&returnTo=https://example.com#runtime-title');
  await expect(page).toHaveURL(/\/models\/office\/train\?jobId=job-2$/);
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.id))
    .toBe('training-readiness-title');
  const readinessScreen = page.getByRole('region', { name: 'Continue recording' });
  await expect(readinessScreen).toContainText('Training readiness');
  await expect(readinessScreen.getByLabel('Training readiness summary')).toContainText(
    'Required free storage',
  );
  await expect(readinessScreen.getByLabel('Training readiness summary')).toContainText(
    'Browser support',
  );

  await page.setViewportSize({ width: 360, height: 800 });
  const bottomNav = page.locator('.app-bottom-nav');
  await expect(bottomNav).toBeVisible();
  await expect(bottomNav.getByRole('link', { name: 'Dictate' })).toBeVisible();
  await expect(bottomNav.getByRole('link', { name: 'Vocabulary' })).toBeVisible();
  await expect(bottomNav.getByRole('link', { name: 'Models' })).toBeVisible();

  await bottomNav.getByRole('link', { name: 'Models' }).click();
  await expect(page).toHaveURL(/\/models$/);
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.id))
    .toBe('personal-models-title');

  const setup = page.getByRole('region', { name: /speech model required/i });
  await expect(setup).toBeVisible({ timeout: 10_000 });
  await expect(setup.getByRole('button', { name: 'Install model', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /hold to speak/i })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Vocabulary sets' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Voice models' })).toBeVisible();
  await expect(page.getByLabel('Personal Models navigation')).toContainText('Record enrollment');
  const modelDetail = page.locator('section.model-detail-panel');
  await expect(modelDetail).toContainText('Recording coverage', { timeout: 10_000 });
  await expect(modelDetail).toContainText('Quality results');
  await expect(modelDetail).toContainText('Compatibility');
  await expect(modelDetail).toContainText('Storage');
  await expect(modelDetail).toContainText('Technical details');
  await modelDetail.getByRole('button', { name: 'Compatibility' }).click();
  await expect(modelDetail.getByLabel('Compatibility checks')).toContainText('Secure context');
  await expect(modelDetail.getByLabel('Compatibility checks')).toContainText('Persistent storage');
  await modelDetail.getByRole('button', { name: 'Recording coverage' }).click();
  await expect(modelDetail.getByLabel('Recording coverage tasks')).toContainText(
    'Record accepted enrollment takes',
  );
  await expect(page.getByLabel('Personal voice model rows')).toContainText('Generic', {
    timeout: 10_000,
  });
  await expect(page.getByRole('link', { name: 'Import' })).toHaveAttribute(
    'href',
    '/models/import',
  );
  await page.getByRole('link', { name: 'Import' }).click();
  await expect(page).toHaveURL(/\/models\/import$/);
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.id))
    .toBe('model-import-title');
  const importFlow = page.locator('section.import-model-flow');
  await expect(importFlow).toContainText('Choose .speechmodel file');
  await expect(importFlow).toContainText('Unlock when needed');
  await expect(importFlow).toContainText('Validate locally');
  await expect(importFlow).toContainText('Legacy profile JSON import');
  await page.goto('/models/local-enrollment-profile/export');
  await expect(page).toHaveURL(/\/models\/local-enrollment-profile\/export$/);
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.id))
    .toBe('model-export-title');
  const exportFlow = page.locator('section.export-model-flow');
  await expect(exportFlow).toContainText('Choose contents');
  await expect(exportFlow).toContainText('Protect file');
  await expect(exportFlow).toContainText('Recordings and training checkpoints are not included.');
  await expect(exportFlow).toContainText('Legacy profile export');
  await page.goto('/models/local-enrollment-profile/results');
  await expect(page).toHaveURL(/\/models\/local-enrollment-profile\/results$/);
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.id))
    .toBe('model-results-title');
  const resultScreen = page.locator('section.model-results-screen');
  await expect(resultScreen.getByRole('heading', { name: 'Results not ready' })).toBeVisible();
  await resultScreen.locator('summary').filter({ hasText: 'Results' }).click();
  await expect(resultScreen).toContainText('Personal speech');
  await expect(resultScreen).toContainText('General speech');
  await expect(resultScreen.getByLabel('Quality checks')).toContainText('Required checks');
  await expect(page.getByRole('heading', { name: /offline and updates/i })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /benchmark and diagnostics export/i }),
  ).toBeVisible();
});
