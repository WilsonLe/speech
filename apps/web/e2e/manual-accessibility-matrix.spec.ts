import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { seedInstalledBaseModel } from './model-setup-fixture';

type MatrixRoute =
  | '/'
  | '/vocabulary'
  | '/models'
  | '/models/new'
  | '/models/local-enrollment-profile/train'
  | '/models/local-enrollment-profile/results'
  | '/models/import'
  | '/models/local-enrollment-profile/export'
  | '/settings'
  | '/settings/audio'
  | '/settings/storage'
  | '/settings/privacy'
  | '/settings/shortcuts'
  | '/settings/diagnostics'
  | '/about';

interface ManualAccessibilityMatrixV1 {
  readonly routeFixtures: readonly MatrixRoute[];
}

const matrix = await loadManualAccessibilityMatrix();
const routeFixtures = matrix.routeFixtures;

const routeHeadings: Readonly<Record<MatrixRoute, RegExp>> = {
  '/': /^Dictate$/,
  '/vocabulary': /^Vocabulary sets$/,
  '/models': /^Voice models$/,
  '/models/new': /^Name this voice model$/,
  '/models/local-enrollment-profile/train': /^(Training readiness|Continue recording)$/,
  '/models/local-enrollment-profile/results': /^(Candidate result|Results not ready)$/,
  '/models/import': /^Import a voice model$/,
  '/models/local-enrollment-profile/export': /^Export /,
  '/settings': /^Settings$/,
  '/settings/audio': /^Audio$/,
  '/settings/storage': /^Storage$/,
  '/settings/privacy': /^Privacy$/,
  '/settings/shortcuts': /^Keyboard shortcuts$/,
  '/settings/diagnostics': /^Diagnostics$/,
  '/about': /^About$/,
};

test.describe('manual accessibility matrix evidence', () => {
  test.beforeEach(async ({ page }) => {
    await seedInstalledBaseModel(page);
  });

  test('required routes have zero critical or serious axe-core violations', async ({ page }) => {
    test.setTimeout(90_000);
    const seriousViolations: Array<{
      route: string;
      id: string;
      impact: string | null;
      nodes: number;
    }> = [];

    for (const route of routeFixtures) {
      await openMatrixRoute(page, route);
      const results = await new AxeBuilder({ page }).include('main').analyze();
      const routeViolations = results.violations
        .filter((violation) => violation.impact === 'critical' || violation.impact === 'serious')
        .map((violation) => ({
          route,
          id: violation.id,
          impact: violation.impact,
          nodes: violation.nodes.length,
        }));
      seriousViolations.push(...routeViolations);
    }

    expect(seriousViolations).toEqual([]);
  });

  test('forced colours and 200% text scaling keep required routes operable without obscured focus', async ({
    page,
  }) => {
    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });

    for (const route of routeFixtures) {
      await openMatrixRoute(page, route);
      await page.addStyleTag({ content: ':root { font-size: 200% !important; }' });
      await page.setViewportSize({ width: 640, height: 720 });

      const overflow = await hasHorizontalOverflow(page);
      expect(overflow, `${route} should not overflow horizontally at 200% text scale`).toBe(false);

      await assertNoKeyboardTrapOrObscuredFocus(page, route);
    }
  });

  test('required primary actions are keyboard reachable and not hover-only', async ({ page }) => {
    const requiredActions: ReadonlyArray<{ route: MatrixRoute; name: RegExp }> = [
      { route: '/', name: /Hold to speak|Install model/i },
      { route: '/vocabulary', name: /^New set$/i },
      { route: '/models', name: /^New$/i },
      { route: '/models/new', name: /^Which speech should it learn\?$/i },
      { route: '/models/import', name: /Choose file/i },
      { route: '/settings/storage', name: /Delete training data/i },
      { route: '/settings/privacy', name: /Open delete local speech data/i },
      { route: '/settings/diagnostics', name: /Copy diagnostics/i },
    ];

    for (const action of requiredActions) {
      await openMatrixRoute(page, action.route);
      const control = page
        .getByRole('button', { name: action.name })
        .or(page.getByRole('link', { name: action.name }))
        .or(page.getByLabel(action.name))
        .first();
      await expect(control, `${action.route} primary action ${action.name}`).toBeVisible();
      await expect(control).toBeEnabled();
      await expectReachableByTab(page, control, `${action.route} primary action ${action.name}`);
    }
  });

  test('live regions are restrained and never wrap transcript or full-route content', async ({
    page,
  }) => {
    await openMatrixRoute(page, '/');

    const liveRegionSummary = await page.evaluate(() => {
      return [...document.querySelectorAll<HTMLElement>('[aria-live]')].map((region) => ({
        ariaLive: region.getAttribute('aria-live'),
        text: (region.innerText || region.textContent || '').replace(/\s+/g, ' ').trim(),
        containsTranscript: Boolean(region.closest('[aria-label="Transcript text"]')),
        interactiveCount: region.querySelectorAll('button,a,input,select,textarea').length,
      }));
    });

    expect(liveRegionSummary.length).toBeGreaterThan(0);
    for (const region of liveRegionSummary) {
      expect(region.containsTranscript).toBe(false);
      expect(region.interactiveCount).toBe(0);
      expect(region.text.length).toBeLessThanOrEqual(180);
    }
  });
});

async function loadManualAccessibilityMatrix(): Promise<ManualAccessibilityMatrixV1> {
  const url = new URL(
    '../../../docs/planning/v0.6.0-manual-accessibility-matrix.json',
    import.meta.url,
  );
  return JSON.parse(await readFile(url, 'utf8')) as ManualAccessibilityMatrixV1;
}

async function openMatrixRoute(page: Page, route: MatrixRoute): Promise<void> {
  await page.goto(route);
  await expect(page.getByRole('heading', { name: routeHeadings[route] }).first()).toBeVisible({
    timeout: 15_000,
  });
}

async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
}

async function assertNoKeyboardTrapOrObscuredFocus(page: Page, route: string): Promise<void> {
  const visited = new Set<string>();
  for (let index = 0; index < 24; index += 1) {
    await page.keyboard.press('Tab');
    const snapshot = await page.evaluate(() => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) {
        return { key: '', name: '', obscured: false };
      }
      active.scrollIntoView({ block: 'center', inline: 'nearest' });
      const rect = active.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const topElement = document.elementFromPoint(centerX, centerY);
      const obscured = Boolean(
        topElement &&
        topElement !== active &&
        !active.contains(topElement) &&
        !topElement.contains(active),
      );
      const name =
        active.getAttribute('aria-label') ||
        active.textContent?.replace(/\s+/g, ' ').trim() ||
        active.getAttribute('name') ||
        active.getAttribute('id') ||
        '';
      const key = `${active.tagName}:${active.getAttribute('href') ?? ''}:${name}`;
      return { key, name, obscured };
    });

    if (snapshot.key) {
      visited.add(snapshot.key);
    }
    expect(snapshot.obscured, `${route} focused element is obscured: ${snapshot.name}`).toBe(false);
  }

  expect(visited.size, `${route} should expose multiple keyboard stops`).toBeGreaterThan(3);
}

async function expectReachableByTab(page: Page, locator: Locator, label: string): Promise<void> {
  for (let index = 0; index < 40; index += 1) {
    await page.keyboard.press('Tab');
    const isFocused = await locator
      .evaluate((element) => element === document.activeElement)
      .catch(() => false);
    if (isFocused) return;
  }
  throw new Error(`${label} did not receive focus within 40 Tab presses`);
}
