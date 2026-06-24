import { readFile } from 'node:fs/promises';
import { expect, test, type Download, type Locator, type Page } from '@playwright/test';

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

    const ids = [...document.querySelectorAll<HTMLElement>('[id]')].map((element) => element.id);
    const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);

    return { unnamedControls, unlabeledSections, duplicateIds };
  });

  expect(accessibility.unnamedControls).toEqual([]);
  expect(accessibility.unlabeledSections).toEqual([]);
  expect(accessibility.duplicateIds).toEqual([]);

  const focusedControls: string[] = [];
  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press('Tab');
    focusedControls.push(await activeElementName(page));
  }
  expect(focusedControls.filter(Boolean).length).toBeGreaterThanOrEqual(5);
  expect(focusedControls).toContain('Manage offline model');
  expect(focusedControls).toContain('Run benchmark');
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

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.getByLabel('Offline app shell status')).toContainText('opfs', {
    timeout: 10_000,
  });
  await expect(page.getByText(/VietASR Iteration 3 Vietnamese INT8 candidate/i)).toBeVisible({
    timeout: 10_000,
  });
  await page.waitForLoadState('networkidle');

  const transcript = page.getByRole('region', { name: /focused push-to-talk dictation/i });
  const pushToTalk = transcript.getByRole('button', { name: /hold to talk/i });
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

async function readMetric(metrics: Locator, label: string): Promise<number> {
  const lines = (await metrics.innerText()).split(/\n+/).map((line) => line.trim());
  const expectedLabel = label.toLocaleLowerCase();
  const labelIndex = lines.findIndex((line) => line.toLocaleLowerCase() === expectedLabel);
  if (labelIndex < 0) {
    return 0;
  }

  return Number(lines[labelIndex + 1] ?? 0);
}

async function readDownloadedJson(download: Download): Promise<unknown> {
  const path = await download.path();
  if (!path) {
    throw new Error('Downloaded JSON path was unavailable.');
  }
  return JSON.parse(await readFile(path, 'utf8'));
}
