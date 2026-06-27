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
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('runtime-title');

  await page.setViewportSize({ width: 360, height: 800 });
  const bottomNav = page.locator('.app-bottom-nav');
  await expect(bottomNav).toBeVisible();
  await expect(bottomNav.getByRole('link', { name: 'Dictate' })).toBeVisible();
  await expect(bottomNav.getByRole('link', { name: 'Vocabulary' })).toBeVisible();
  await expect(bottomNav.getByRole('link', { name: 'Models' })).toBeVisible();

  await expect(page.getByRole('button', { name: /hold to speak/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /local vocabulary sets/i })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /profile cards and local lifecycle/i }),
  ).toBeVisible();
  await expect(page.getByLabel('Personal Models navigation')).toContainText('Record enrollment');
  await expect(page.getByLabel('Personal model readiness summary')).toContainText('Capabilities', {
    timeout: 10_000,
  });
  await expect(page.getByLabel('Personal model capability preflight checks')).toContainText(
    'Independent capability checks',
  );
  await expect(page.getByLabel('Training companion state')).toContainText('Companion status', {
    timeout: 10_000,
  });
  await expect(page.getByLabel('Missing recording tasks')).toContainText(
    'Record accepted enrollment takes',
  );
  await expect(page.getByLabel('Activation gate summary')).toContainText('generic fallback', {
    timeout: 10_000,
  });
  await expect(page.getByLabel('Personal model profile cards')).toContainText('generic fallback', {
    timeout: 10_000,
  });
  await expect(page.getByLabel('Personal model profile lifecycle controls')).toContainText(
    'Import behavior',
  );
  await expect(page.getByLabel('Import behavior')).toHaveValue('dedupe');
  await expect(
    page.getByRole('heading', { name: /offline readiness and model lifecycle/i }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /benchmark and diagnostics export/i }),
  ).toBeVisible();
});
