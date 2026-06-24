import { expect, test } from '@playwright/test';

test('renders the foundation PWA shell', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/speech/);
  await expect(
    page.getByRole('heading', { name: /local-first bilingual dictation/i }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /manage offline model/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /run benchmark/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /hold to talk/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /local vocabulary sets/i })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /offline readiness and model lifecycle/i }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /benchmark and diagnostics export/i }),
  ).toBeVisible();
});
