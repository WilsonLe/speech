import { expect, test } from '@playwright/test';

test('renders the foundation PWA shell', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/speech/);
  await expect(
    page.getByRole('heading', { name: /local-first bilingual dictation/i }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /model install placeholder/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /hold to talk/i })).toBeVisible();
});
