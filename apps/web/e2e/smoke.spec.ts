import { expect, test } from '@playwright/test';

test('renders the foundation PWA shell', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/speech/);
  await expect(
    page.getByRole('heading', { name: /local-first bilingual dictation/i }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /manage offline model/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /personal models/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /run benchmark/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /hold to talk/i })).toBeVisible();
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
  await expect(page.getByLabel('Personal model profile cards')).toContainText('generic fallback', {
    timeout: 10_000,
  });
  await expect(
    page.getByRole('heading', { name: /offline readiness and model lifecycle/i }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /benchmark and diagnostics export/i }),
  ).toBeVisible();
});
