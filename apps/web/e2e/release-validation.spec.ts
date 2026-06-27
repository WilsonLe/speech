import { readFile } from 'node:fs/promises';
import {
  createDictatePerformanceParityReport,
  type DictatePerformanceParityMeasurementInputV1,
} from '@speech/benchmark';
import { expect, test, type Download, type Locator, type Page } from '@playwright/test';
import { seedInstalledBaseModel } from './model-setup-fixture';

const requiredBenchmarkMetrics = [
  'firstPartialLatencyMs',
  'stableTokenLatencyMs',
  'finalizationLatencyMs',
  'encoderChunkMs',
  'decoderChunkMs',
  'realTimeFactor',
  'customTermRecall',
  'customTermFalseInsertionRate',
  'queueDepthFrames',
  'audioOverruns',
];

test('release UI exposes named controls, labelled sections, and keyboard focus', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  const accessibility = await page.evaluate(() => {
    function textFromIds(ids: string | null): string {
      return (ids ?? '')
        .split(/\s+/)
        .filter(Boolean)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
        .join(' ')
        .trim();
    }

    function elementLabel(element: Element): string {
      const ariaLabel = element.getAttribute('aria-label')?.trim();
      if (ariaLabel) return ariaLabel;
      const ariaLabelledBy = textFromIds(element.getAttribute('aria-labelledby'));
      if (ariaLabelledBy) return ariaLabelledBy;
      if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement
      ) {
        const labels = [...element.labels]
          .map((label) => label.textContent?.trim() ?? '')
          .join(' ');
        if (labels.trim()) return labels.trim();
      }
      return element.textContent?.trim() ?? '';
    }

    const interactiveSelector = [
      'button:not([aria-hidden="true"])',
      'a[href]:not([aria-hidden="true"])',
      'input:not([type="hidden"]):not([aria-hidden="true"])',
      'select:not([aria-hidden="true"])',
      'textarea:not([aria-hidden="true"])',
    ].join(',');

    const unnamedControls = [...document.querySelectorAll(interactiveSelector)]
      .filter((element) => elementLabel(element).length === 0)
      .map((element) => element.outerHTML.slice(0, 160));

    const unlabeledSections = [...document.querySelectorAll('main section')]
      .filter((section) => {
        const ariaLabel = section.getAttribute('aria-label')?.trim();
        const ariaLabelledBy = textFromIds(section.getAttribute('aria-labelledby'));
        return !ariaLabel && !ariaLabelledBy;
      })
      .map((section) => section.outerHTML.slice(0, 160));

    const unnamedProgressbars = [...document.querySelectorAll('[role="progressbar"]')]
      .filter((element) => elementLabel(element).length === 0)
      .map((element) => element.outerHTML.slice(0, 160));

    const ids = [...document.querySelectorAll<HTMLElement>('[id]')].map((element) => element.id);
    const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);

    return { unnamedControls, unnamedProgressbars, unlabeledSections, duplicateIds };
  });

  expect(accessibility.unnamedControls).toEqual([]);
  expect(accessibility.unnamedProgressbars).toEqual([]);
  expect(accessibility.unlabeledSections).toEqual([]);
  expect(accessibility.duplicateIds).toEqual([]);

  const trainingProgress = page.getByLabel('Browser training named-phase progress');
  await expect(
    trainingProgress.getByRole('progressbar', { name: 'Browser training overall progress' }),
  ).toHaveAttribute('aria-valuetext', '0%');
  await expect(trainingProgress.locator('[aria-label^="Step 1: Prepare worker"]')).toBeVisible();
  await expect(trainingProgress.getByText('Pending', { exact: true }).first()).toBeVisible();

  await page.setViewportSize({ width: 320, height: 720 });
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
  const bottomNav = page.locator('.app-bottom-nav');
  await expect(bottomNav).toBeVisible();
  await expect(bottomNav).toContainText('Dictate');
  await expect(bottomNav).toContainText('Vocabulary');
  await expect(bottomNav).toContainText('Models');

  const focusedControls: string[] = [];
  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press('Tab');
    focusedControls.push(await activeElementName(page));
  }
  expect(focusedControls.filter(Boolean).length).toBeGreaterThanOrEqual(5);
  expect(focusedControls).toContain('Skip to main content');
  expect(focusedControls).toContain('Speech');
  expect(focusedControls).toContain('Dictate');
  expect(focusedControls).toContain('Vocabulary');
  expect(focusedControls).toContain('Models');
});

test('active push-to-talk stress cycles do not make network requests or surface errors', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const activeRequests: string[] = [];
  let recordingActiveRequests = false;

  page.on('console', (message) => {
    if (recordingActiveRequests && message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    if (recordingActiveRequests) {
      pageErrors.push(error.message);
    }
  });
  page.on('request', (request) => {
    if (recordingActiveRequests && ['fetch', 'xhr', 'websocket'].includes(request.resourceType())) {
      activeRequests.push(`${request.method()} ${request.url()}`);
    }
  });

  await seedInstalledBaseModel(page);
  await page.waitForLoadState('networkidle');
  await expect(page.getByLabel('Offline and update status')).toContainText('1 installed', {
    timeout: 10_000,
  });
  await page.getByText('Model lifecycle details', { exact: true }).click();
  await expect(page.getByText(/VietASR Iteration 3 Vietnamese INT8 candidate/i)).toBeVisible({
    timeout: 10_000,
  });
  await page.waitForLoadState('networkidle');

  const transcript = page.getByRole('region', { name: /^dictate$/i });
  const pushToTalk = transcript.locator('.push-to-talk-button');
  await transcript.getByText('Dictation details', { exact: true }).click();
  const metrics = transcript.getByLabel('Transcript latency and capture status');

  recordingActiveRequests = true;
  let previousChunks = 0;
  for (let index = 0; index < 6; index += 1) {
    await page.keyboard.down('Space');
    await expect(pushToTalk).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
    await expect
      .poll(async () => readMetric(metrics, 'Chunks'), { timeout: 10_000 })
      .toBeGreaterThan(previousChunks);
    previousChunks = await readMetric(metrics, 'Chunks');
    await page.keyboard.up('Space');
    await expect(pushToTalk).toHaveAttribute('aria-pressed', 'false', { timeout: 10_000 });
  }
  recordingActiveRequests = false;

  expect(activeRequests).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('Dictate performance parity smoke records aggregate UI and ASR-limitation evidence', async ({
  page,
}) => {
  await installPerformanceObservers(page);
  await seedInstalledBaseModel(page);
  await page.waitForLoadState('networkidle');

  const transcript = page.getByRole('region', { name: /^dictate$/i });
  const pushToTalk = transcript.locator('.push-to-talk-button');
  await expect(pushToTalk).toBeVisible({ timeout: 10_000 });
  const interactionReadyMs = await page.evaluate(() => performance.now());
  const assetBytes = await collectInitialAssetBytes(page);
  expect(assetBytes.jsBytes).toBeGreaterThan(0);
  expect(assetBytes.cssBytes).toBeGreaterThan(0);

  await resetPerformanceSamples(page);
  const routeStartMs = await page.evaluate(() => performance.now());
  const primaryNavigation = page.getByRole('navigation', { name: 'Primary destinations' });
  await primaryNavigation.getByRole('link', { name: 'Vocabulary' }).click();
  await expect(page.getByRole('heading', { name: 'Vocabulary' })).toBeFocused();
  const routeTransitionMs = (await page.evaluate(() => performance.now())) - routeStartMs;
  await primaryNavigation.getByRole('link', { name: 'Dictate' }).click();
  await expect(page.getByRole('heading', { name: 'Dictate' })).toBeFocused();

  await transcript.getByText('Dictation details', { exact: true }).click();
  const metrics = transcript.getByLabel('Transcript latency and capture status');

  const recordingStartMs = await page.evaluate(() => performance.now());
  await page.keyboard.down('Space');
  await expect(pushToTalk).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
  const recordingUiResponseMs = (await page.evaluate(() => performance.now())) - recordingStartMs;
  await expect
    .poll(async () => readMetric(metrics, 'Chunks'), { timeout: 10_000 })
    .toBeGreaterThan(0);
  await page.keyboard.up('Space');
  await expect(pushToTalk).toHaveAttribute('aria-pressed', 'false', { timeout: 10_000 });

  const performanceSamples = await collectPerformanceSamples(page);
  const measurements: readonly DictatePerformanceParityMeasurementInputV1[] = [
    { name: 'initialDictateJsBytes', value: assetBytes.jsBytes, source: 'browser-smoke' },
    { name: 'initialDictateCssBytes', value: assetBytes.cssBytes, source: 'browser-smoke' },
    { name: 'initialDictateJsGzipIncreaseBytes', value: null, source: 'not-measured' },
    { name: 'interactionReadyMs', value: interactionReadyMs, source: 'browser-smoke' },
    { name: 'routeTransitionMs', value: routeTransitionMs, source: 'browser-smoke' },
    {
      name: 'mainThreadLongTaskCount',
      value: performanceSamples.longTaskCount,
      source: 'browser-smoke',
    },
    {
      name: 'mainThreadLongTaskMaxMs',
      value: performanceSamples.longTaskMaxMs,
      source: 'browser-smoke',
    },
    { name: 'cumulativeLayoutShift', value: performanceSamples.cls, source: 'browser-smoke' },
    { name: 'recordingUiResponseMs', value: recordingUiResponseMs, source: 'browser-smoke' },
    {
      name: 'firstPartialLatencyMs',
      value: await readOptionalMetric(metrics, 'First partial'),
      source: 'browser-smoke',
    },
    { name: 'stableWordLatencyMs', value: null, source: 'not-measured' },
    {
      name: 'finalizationLatencyMs',
      value: await readOptionalMetric(metrics, 'Finalization'),
      source: 'browser-smoke',
    },
    { name: 'asrLatencyRegressionPercent', value: null, source: 'not-measured' },
  ];
  const report = createDictatePerformanceParityReport({
    generatedAt: '2026-06-27T00:00:00.000Z',
    benchmarkId: 'ci-dictate-performance-smoke',
    evidenceLabel: 'CI Dictate browser smoke',
    baseline: {
      release: 'v0.5.0',
      commit: '8e72dd120e41e69cc52458804fa8b8804e74b9bc',
      hasInitialBundleBaseline: false,
      hasAsrLatencyBaseline: false,
      notes: [
        'Browser smoke validates instrumentation only; no v0.5 reference-hardware baseline included.',
      ],
    },
    measurements,
    warnings: [
      'Fake microphone capture does not provide real first-partial or stable-word ASR evidence.',
    ],
  });

  expect(routeTransitionMs).toBeLessThan(1_000);
  expect(recordingUiResponseMs).toBeLessThan(1_000);
  expect(performanceSamples.longTaskMaxMs).toBeLessThan(500);

  expect(report.reportType).toBe('dictate-performance-parity');
  expect(report.privacy).toMatchObject({
    aggregateOnly: true,
    containsAudio: false,
    containsTranscriptText: false,
    networkUpload: false,
  });
  expect(report.status).toBe('insufficient-evidence');
  expect(report.gate.checks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'initial-js-css-observed', status: 'passed' }),
      expect.objectContaining({ name: 'interaction-readiness', status: 'insufficient-evidence' }),
      expect.objectContaining({ name: 'route-transition', status: 'insufficient-evidence' }),
      expect.objectContaining({ name: 'main-thread-long-tasks', status: 'insufficient-evidence' }),
      expect.objectContaining({ name: 'layout-stability', status: 'insufficient-evidence' }),
      expect.objectContaining({ name: 'recording-ui-response', status: 'insufficient-evidence' }),
      expect.objectContaining({ name: 'first-partial-observed', status: 'insufficient-evidence' }),
      expect.objectContaining({ name: 'asr-latency-regression', status: 'insufficient-evidence' }),
    ]),
  );
});

test('benchmark export covers MVP timing, queue, RTF, and privacy metrics', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /run synthetic benchmark/i }).click();
  await expect(page.getByText(/benchmark complete/i)).toBeVisible({ timeout: 15_000 });

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /download benchmark json/i }).click();
  const report = (await readDownloadedJson(await downloadPromise)) as BenchmarkReportLike;

  expect(report).toMatchObject({
    schemaVersion: 1,
    reportType: 'speech-benchmark',
    privacy: { containsAudio: false, containsTranscript: false, networkUpload: false },
  });
  expect(report.traces.length).toBeGreaterThanOrEqual(24);
  expect(report.configuration.syntheticAudioMs).toBeGreaterThan(0);
  expect(report.warnings.join(' ')).toMatch(/reference hardware/i);
  expect(report.customTermEvaluation).toMatchObject({
    reportType: 'custom-term-benchmark',
    synthetic: true,
    recall: { numerator: 2, denominator: 3 },
    falseInsertion: { numerator: 1, denominator: 3 },
  });

  const summaryNames = report.summaries.map((summary) => summary.name);
  expect(summaryNames).toEqual(expect.arrayContaining(requiredBenchmarkMetrics));
  const rtf = report.summaries.find((summary) => summary.name === 'realTimeFactor');
  expect(rtf?.median).toBeGreaterThanOrEqual(0);
  expect(rtf?.unit).toBe('ratio');
});

interface BenchmarkReportLike {
  readonly schemaVersion: number;
  readonly reportType: string;
  readonly privacy: {
    readonly containsAudio: boolean;
    readonly containsTranscript: boolean;
    readonly networkUpload: boolean;
  };
  readonly configuration: { readonly syntheticAudioMs: number };
  readonly customTermEvaluation?: {
    readonly reportType: string;
    readonly synthetic: boolean;
    readonly recall: { readonly numerator: number; readonly denominator: number };
    readonly falseInsertion: { readonly numerator: number; readonly denominator: number };
  };
  readonly warnings: readonly string[];
  readonly traces: readonly unknown[];
  readonly summaries: ReadonlyArray<{
    readonly name: string;
    readonly unit: string;
    readonly median: number;
  }>;
}

async function installPerformanceObservers(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const globalWindow = window as Window & {
      __speechDictatePerformance?: {
        longTasks: number[];
        layoutShifts: number[];
        observerErrors: string[];
      };
    };
    globalWindow.__speechDictatePerformance = {
      longTasks: [],
      layoutShifts: [],
      observerErrors: [],
    };
    try {
      new PerformanceObserver((list) => {
        globalWindow.__speechDictatePerformance?.longTasks.push(
          ...list.getEntries().map((entry) => entry.duration),
        );
      }).observe({ type: 'longtask', buffered: true });
    } catch (error) {
      globalWindow.__speechDictatePerformance.observerErrors.push(String(error));
    }
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const layoutShift = entry as PerformanceEntry & {
            value?: number;
            hadRecentInput?: boolean;
          };
          if (!layoutShift.hadRecentInput && typeof layoutShift.value === 'number') {
            globalWindow.__speechDictatePerformance?.layoutShifts.push(layoutShift.value);
          }
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch (error) {
      globalWindow.__speechDictatePerformance.observerErrors.push(String(error));
    }
  });
}

async function resetPerformanceSamples(page: Page): Promise<void> {
  await page.evaluate(() => {
    const performanceState = (
      window as Window & {
        __speechDictatePerformance?: { longTasks: number[]; layoutShifts: number[] };
      }
    ).__speechDictatePerformance;
    if (performanceState) {
      performanceState.longTasks = [];
      performanceState.layoutShifts = [];
    }
  });
}

async function collectInitialAssetBytes(
  page: Page,
): Promise<{ readonly jsBytes: number; readonly cssBytes: number }> {
  return page.evaluate(() => {
    function resourceBytes(entry: PerformanceResourceTiming): number {
      return entry.encodedBodySize || entry.decodedBodySize || entry.transferSize || 0;
    }
    const assets = performance
      .getEntriesByType('resource')
      .filter(
        (entry): entry is PerformanceResourceTiming => entry instanceof PerformanceResourceTiming,
      );
    return {
      jsBytes: assets
        .filter((entry) => entry.name.includes('/assets/') && entry.name.endsWith('.js'))
        .reduce((total, entry) => total + resourceBytes(entry), 0),
      cssBytes: assets
        .filter((entry) => entry.name.includes('/assets/') && entry.name.endsWith('.css'))
        .reduce((total, entry) => total + resourceBytes(entry), 0),
    };
  });
}

async function collectPerformanceSamples(page: Page): Promise<{
  readonly longTaskCount: number;
  readonly longTaskMaxMs: number;
  readonly cls: number;
}> {
  return page.evaluate(() => {
    const performanceState = (
      window as Window & {
        __speechDictatePerformance?: { longTasks: number[]; layoutShifts: number[] };
      }
    ).__speechDictatePerformance;
    const longTasks = performanceState?.longTasks ?? [];
    const layoutShifts = performanceState?.layoutShifts ?? [];
    return {
      longTaskCount: longTasks.filter((duration) => duration > 50).length,
      longTaskMaxMs: longTasks.length === 0 ? 0 : Math.max(...longTasks),
      cls: layoutShifts.reduce((total, value) => total + value, 0),
    };
  });
}

async function activeElementName(page: Page): Promise<string> {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (!active) return '';
    const ariaLabel = active.getAttribute('aria-label')?.trim();
    if (ariaLabel) return ariaLabel;
    const labelledBy = (active.getAttribute('aria-labelledby') ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
      .join(' ')
      .trim();
    if (labelledBy) return labelledBy;
    return active.textContent?.trim() ?? '';
  });
}

async function readOptionalMetric(metrics: Locator, label: string): Promise<number | null> {
  const value = await readMetric(metrics, label);
  return Number.isFinite(value) ? value : null;
}

async function readMetric(metrics: Locator, label: string): Promise<number> {
  const lines = (await metrics.innerText()).split(/\n+/).map((line) => line.trim());
  const expectedLabel = label.toLocaleLowerCase();
  const labelIndex = lines.findIndex((line) => line.toLocaleLowerCase() === expectedLabel);
  if (labelIndex < 0) {
    return 0;
  }

  const rawValue = lines[labelIndex + 1] ?? '0';
  const match = rawValue.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : Number.NaN;
}

async function readDownloadedJson(download: Download): Promise<unknown> {
  const path = await download.path();
  if (!path) {
    throw new Error('Downloaded JSON path was unavailable.');
  }
  return JSON.parse(await readFile(path, 'utf8'));
}
