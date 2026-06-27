import { expect, test } from '@playwright/test';
import { seedInstalledBaseModel } from './model-setup-fixture';

test('creates a focused voice-model draft and starts enrollment', async ({ page }) => {
  await seedInstalledBaseModel(page);
  await page.goto('/models');

  const models = page.locator('section.personal-models');
  await models.getByRole('link', { name: 'New', exact: true }).click();
  await expect(page).toHaveURL(/\/models\/new$/);
  await expect(page.getByRole('heading', { name: 'Name this voice model' })).toBeFocused();
  await expect(page.getByText('Step 1 of 5')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Name this voice model' })).toBeVisible();

  await page.getByRole('textbox', { name: 'Name this voice model' }).fill('Office microphone');
  await page.keyboard.press('Tab');
  await page.getByRole('button', { name: 'Continue' }).press('Enter');

  await expect(page.getByRole('heading', { name: 'Which speech should it learn?' })).toBeVisible();
  await page.getByLabel('Vietnamese and English').check();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(
    page.getByRole('heading', { name: 'Include mixed Vietnamese and English?' }),
  ).toBeVisible();
  await page.getByLabel('Include mixed speech').check();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Choose a recording plan' })).toBeVisible();
  await page.getByLabel('Recommended').check();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Review and start recording' })).toBeVisible();
  const review = page.getByLabel('New voice model review');
  await expect(review).toContainText('Office microphone');
  await expect(review).toContainText('Vietnamese and English speech');
  await expect(review).toContainText('Include mixed Vietnamese and English');
  await expect(review).toContainText('Recommended recording plan');
  await expect(review).toContainText('Progress is saved on this device');
  await expect(page.getByText('How voice models work')).toBeVisible();
  await expect(page.getByText('adapts the shared speech model')).toBeHidden();
  await page.getByText('How voice models work').click();
  await expect(page.getByText('adapts the shared speech model')).toBeVisible();

  await page.getByRole('link', { name: 'Start recording' }).click();
  await expect(page).toHaveURL(
    /\/models\/local-enrollment-profile\/enroll\?returnTo=%2Fmodels%2Fnew$/,
  );
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('microphone-title');
  await expect(page.getByRole('heading', { name: 'Permission and capture check' })).toBeVisible();
  await expect(page.getByLabel('Prompt language')).toHaveValue('mixed');
});
