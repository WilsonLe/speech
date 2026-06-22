import { expect, test, type Page } from '@playwright/test';

test('loads the model catalog and inspects manifest metadata in the lifecycle worker', async ({
  page,
}) => {
  await page.goto('/');

  const panel = page.getByRole('region', { name: /offline readiness and model lifecycle/i });
  await expect(panel.getByText(/VietASR Iteration 3 Vietnamese INT8 candidate/i)).toBeVisible({
    timeout: 10_000,
  });
  await expect(panel.getByText(/not installed/i)).toBeVisible();

  await panel.getByRole('button', { name: /inspect manifest/i }).click();
  await expect(panel.getByText(/5 files/i)).toBeVisible({ timeout: 10_000 });
  await expect(panel.getByText('verified', { exact: true })).toBeVisible();
});

test('reloads the precached app shell while offline', async ({ context, page }) => {
  await page.goto('/');
  await waitForServiceWorkerControl(page);

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('heading', { name: /local-first bilingual dictation/i }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /offline readiness and model lifecycle/i }),
  ).toBeVisible();

  await context.setOffline(false);
});

test('updates the offline indicator when the browser goes offline', async ({ context, page }) => {
  await page.goto('/');
  const panel = page.getByRole('region', { name: /offline readiness and model lifecycle/i });
  const networkStatus = panel.locator('.status-pill').filter({ hasText: /Network/ });
  await expect(networkStatus.getByText('Online', { exact: true })).toBeVisible();

  await context.setOffline(true);
  await expect(networkStatus.getByText('Offline', { exact: true })).toBeVisible({
    timeout: 10_000,
  });

  await context.setOffline(false);
  await expect(networkStatus.getByText('Online', { exact: true })).toBeVisible({ timeout: 10_000 });
});

async function waitForServiceWorkerControl(page: Page): Promise<void> {
  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return;
    await navigator.serviceWorker.ready;
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}
