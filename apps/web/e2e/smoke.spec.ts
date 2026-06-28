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
  await expect(page.getByLabel('Model import options')).toContainText('Import behavior');
  await expect(page.getByLabel('Import behavior')).toHaveValue('dedupe');
  await expect(page.getByRole('heading', { name: /offline and updates/i })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /benchmark and diagnostics export/i }),
  ).toBeVisible();
});
