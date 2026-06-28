import { readFile } from 'node:fs/promises';
import {
  expect,
  test,
  type Browser,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { seedInstalledBaseModel } from './model-setup-fixture';

interface VisualMatrix {
  readonly referenceViewports: readonly VisualViewport[];
  readonly requiredStates: readonly VisualStateDefinition[];
  readonly responsiveRoutes: readonly string[];
}

interface VisualViewport {
  readonly id: string;
  readonly width: number;
  readonly height: number;
}

interface VisualStateDefinition {
  readonly id: VisualStateId;
  readonly category:
    | 'default'
    | 'loading'
    | 'recording'
    | 'error'
    | 'empty'
    | 'active'
    | 'paused'
    | 'incompatible'
    | 'completed';
  readonly route: string;
}

type VisualStateId =
  | 'default-dictate-ready'
  | 'loading-model-install'
  | 'recording-dictate'
  | 'error-import-validation'
  | 'empty-vocabulary-search'
  | 'active-model-list'
  | 'paused-training-recovery'
  | 'incompatible-export-blocker'
  | 'completed-training-check';

const visualMatrix = JSON.parse(
  await readFile(
    new URL(
      '../../../docs/planning/v0.6.0-responsive-visual-regression-suite.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as VisualMatrix;

const screenshotMinimumBytes = 2_000;

test.describe('v0.6 responsive visual regression matrix', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(180_000);

  for (const state of visualMatrix.requiredStates) {
    test(`captures ${state.category} state: ${state.id}`, async ({ browser }, testInfo) => {
      for (const viewport of visualMatrix.referenceViewports) {
        await withVisualPage(browser, testInfo, viewport, async (page) => {
          const target = await prepareVisualState(page, state.id);
          await expect(target).toBeVisible({ timeout: 15_000 });
          await target.scrollIntoViewIfNeeded();
          await assertNoDocumentHorizontalOverflow(page);
          await assertTargetIsNotCoveredByMobileNavigation(page, target);
          const screenshot = await target.screenshot({ animations: 'disabled' });
          expect(screenshot.byteLength, `${state.id} ${viewport.id} screenshot`).toBeGreaterThan(
            screenshotMinimumBytes,
          );
          await testInfo.attach(`visual-${state.id}-${viewport.id}.png`, {
            body: screenshot,
            contentType: 'image/png',
          });
        });
      }
    });
  }

  test('reflows all route shells at 320 CSS px without document-level horizontal scroll', async ({
    browser,
  }, testInfo) => {
    for (const route of visualMatrix.responsiveRoutes) {
      await withVisualPage(
        browser,
        testInfo,
        { id: 'reflow-320', width: 320, height: 800 },
        async (page) => {
          await page.goto(route);
          await waitForRouteSettled(page, route);
          await assertNoDocumentHorizontalOverflow(page, route);
        },
      );
    }
  });
});

async function withVisualPage(
  browser: Browser,
  testInfo: TestInfo,
  viewport: VisualViewport,
  run: (page: Page) => Promise<void>,
): Promise<void> {
  const baseURL = String(testInfo.project.use.baseURL ?? 'http://127.0.0.1:4173');
  const context = await browser.newContext({ baseURL, viewport });
  try {
    const page = await context.newPage();
    await run(page);
  } finally {
    await context.close();
  }
}

async function prepareVisualState(page: Page, stateId: VisualStateId): Promise<Locator> {
  switch (stateId) {
    case 'default-dictate-ready': {
      await seedInstalledBaseModel(page);
      const dictate = page.getByRole('region', { name: /^dictate$/i });
      await expect(dictate.locator('.push-to-talk-button')).toBeVisible({ timeout: 10_000 });
      return dictate;
    }
    case 'loading-model-install': {
      await clearInstalledModelStorage(page);
      await page.goto('/');
      const offlineSetup = page.locator('section.offline-model');
      await expect(offlineSetup).toContainText(/Checking local setup|Speech model/, {
        timeout: 10_000,
      });
      return offlineSetup;
    }
    case 'recording-dictate': {
      await seedInstalledBaseModel(page);
      const dictate = page.getByRole('region', { name: /^dictate$/i });
      const recordButton = dictate.locator('.push-to-talk-button');
      await recordButton.scrollIntoViewIfNeeded();
      await page.keyboard.down('Space');
      await expect(recordButton).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
      await expect(dictate.getByLabel('Provisional transcript suffix')).toContainText('Listening…');
      return dictate;
    }
    case 'error-import-validation': {
      await page.goto('/models/import');
      const importFlow = page.locator('section.import-model-flow');
      await expect(importFlow).toBeVisible({ timeout: 10_000 });
      await page.setInputFiles('input[type="file"][accept*=".speechmodel"]', {
        name: 'not-a-model.speechmodel',
        mimeType: 'application/octet-stream',
        buffer: Buffer.from('not-a-speechmodel-file'),
      });
      await expect(importFlow).toContainText(/Choose a valid .speechmodel file/i, {
        timeout: 10_000,
      });
      return importFlow;
    }
    case 'empty-vocabulary-search': {
      await page.goto('/vocabulary');
      const vocabulary = page.locator('section.panel.vocabulary');
      await vocabulary.locator('#vocabulary-set-search').fill('zzzz visual no match');
      await expect(vocabulary).toContainText('No sets match this search.');
      return vocabulary;
    }
    case 'active-model-list': {
      await page.goto('/models');
      const models = page.locator('section.panel.personal-models');
      await expect(models.getByLabel('Personal voice model rows')).toContainText('Generic', {
        timeout: 10_000,
      });
      await expect(models.locator('section.model-detail-panel')).toBeVisible({ timeout: 10_000 });
      return models;
    }
    case 'paused-training-recovery': {
      await seedTrainingRecovery(page);
      await page.goto('/');
      const runtime = page.locator('section.runtime');
      await expect(page.getByLabel('Training progress')).toContainText(/Resume training|paused/i, {
        timeout: 10_000,
      });
      return runtime;
    }
    case 'incompatible-export-blocker': {
      await page.goto('/models/local-enrollment-profile/export');
      const exportFlow = page.locator('section.export-model-flow');
      await expect(exportFlow).toContainText(/Install the matching speech model first/i, {
        timeout: 10_000,
      });
      return exportFlow;
    }
    case 'completed-training-check': {
      await page.goto('/');
      const runtime = page.locator('section.runtime');
      await page.getByRole('button', { name: 'Run training check' }).click();
      await expect(page.getByLabel('Training progress')).toContainText(/Training complete|Ready/i, {
        timeout: 20_000,
      });
      return runtime;
    }
  }
}

async function clearInstalledModelStorage(page: Page): Promise<void> {
  await page.goto('/model-catalog.json');
  await page.evaluate(async () => {
    const storageManager = navigator.storage as StorageManager & {
      getDirectory?: () => Promise<FileSystemDirectoryHandle>;
    };
    if (typeof storageManager.getDirectory === 'function') {
      const root = await storageManager.getDirectory();
      await root.removeEntry('__speech-model-storage', { recursive: true }).catch(() => undefined);
    }
    if (typeof caches !== 'undefined') {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
    }
  });
}

async function seedTrainingRecovery(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => {
    window.localStorage.setItem(
      'speech:browser-training-recovery:v1',
      JSON.stringify({
        schemaVersion: 1,
        status: 'paused',
        updatedAt: '2026-06-27T00:00:00.000Z',
        checkpoint: {
          schemaVersion: 1,
          checkpointType: 'frozen-feature-tiny-adapter-checkpoint',
          checkpointId: 'synthetic-visual-checkpoint',
          datasetId: 'synthetic-visual-dataset',
          epoch: 8,
          epochs: 20,
          loss: 0.42,
          initialLoss: 0.9,
          resumeStateChecksum: 'synthetic-visual-resume-checksum',
          resumeState: { schemaVersion: 1 },
          artifact: { checksum: 'synthetic-visual-artifact-checksum', weights: [], bias: [] },
          privacy: {
            containsRawAudio: false,
            containsTranscriptText: false,
            containsPrivateFrozenFeatureValues: false,
            containsProfileData: false,
            networkUpload: false,
            telemetry: false,
            localOnly: true,
          },
          compatibility: {
            profileId: 'synthetic-visual-profile',
            baseModelId: 'synthetic-visual-base',
          },
        },
        warnings: [
          {
            code: 'CHECKPOINT_STORAGE_VOLATILE',
            severity: 'info',
            message: 'Synthetic visual recovery checkpoint.',
          },
        ],
      }),
    );
  });
}

async function waitForRouteSettled(page: Page, route: string): Promise<void> {
  if (route === '/') {
    await expect(page.getByRole('main')).toBeVisible();
    return;
  }
  const headingByRoute: Record<string, string | RegExp> = {
    '/vocabulary': 'Vocabulary sets',
    '/models': 'Voice models',
    '/models/new': /Name this voice model|Create a voice model/,
    '/models/import': /Import a voice model|Import voice model/,
    '/models/local-enrollment-profile/export': /Export voice model|Export Local enrollment profile/,
    '/models/local-enrollment-profile/results':
      /Results not ready|Ready to use|More recordings needed/,
    '/settings': 'Settings',
    '/settings/audio': 'Audio',
    '/settings/storage': 'Storage',
    '/settings/privacy': 'Privacy',
    '/settings/shortcuts': 'Keyboard shortcuts',
    '/settings/diagnostics': 'Diagnostics',
    '/about': 'About',
  };
  const heading = headingByRoute[route];
  if (heading !== undefined) {
    await expect(
      page.getByRole('heading', { name: heading, exact: typeof heading === 'string' }),
    ).toBeVisible({
      timeout: 10_000,
    });
  }
}

async function assertNoDocumentHorizontalOverflow(page: Page, label = page.url()): Promise<void> {
  const metrics = await page.evaluate(() => {
    const documentElement = document.documentElement;
    const body = document.body;
    return {
      clientWidth: documentElement.clientWidth,
      scrollWidth: Math.max(documentElement.scrollWidth, body.scrollWidth),
    };
  });
  expect(metrics.scrollWidth, `${label} document scrollWidth`).toBeLessThanOrEqual(
    metrics.clientWidth + 2,
  );
}

async function assertTargetIsNotCoveredByMobileNavigation(
  page: Page,
  target: Locator,
): Promise<void> {
  const visible = await page
    .locator('.app-bottom-nav')
    .isVisible()
    .catch(() => false);
  if (!visible) return;
  const [targetBox, navBox] = await Promise.all([
    target.boundingBox(),
    page.locator('.app-bottom-nav').boundingBox(),
  ]);
  if (targetBox === null || navBox === null) return;
  const targetBottom = targetBox.y + targetBox.height;
  const navTop = navBox.y;
  // A long section may extend behind the fixed nav, but the focused heading/top controls must remain clear.
  expect(
    Math.min(targetBottom, targetBox.y + 220),
    'target heading/top controls clear mobile nav',
  ).toBeLessThan(navTop + 1);
}
