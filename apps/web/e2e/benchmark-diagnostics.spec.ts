import { readFile } from 'node:fs/promises';
import { expect, test, type Download } from '@playwright/test';

test('runs the synthetic benchmark and downloads local JSON reports', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: /run synthetic benchmark/i }).click();
  await expect(page.getByText(/benchmark complete/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel(/benchmark summary metrics/i)).toContainText(
    /First partial latency/i,
  );
  await expect(page.getByLabel(/benchmark summary metrics/i)).toContainText(/Custom-term recall/i);
  await expect(page.getByLabel(/custom-term benchmark results/i)).toContainText(/2\/3 \(66\.7%\)/);
  await expect(page.getByLabel(/benchmark metadata/i)).toContainText(
    /No audio, transcript, or network upload/i,
  );

  const benchmarkDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: /download benchmark json/i }).click();
  const benchmark = await benchmarkDownload;
  expect(benchmark.suggestedFilename()).toMatch(/^speech-benchmark-.*\.json$/);
  const benchmarkJson = await readDownloadedJson(benchmark);
  expect(benchmarkJson).toMatchObject({
    schemaVersion: 1,
    reportType: 'speech-benchmark',
    privacy: { containsAudio: false, containsTranscript: false, networkUpload: false },
    customTermEvaluation: {
      reportType: 'custom-term-benchmark',
      synthetic: true,
      recall: { numerator: 2, denominator: 3 },
      falseInsertion: { numerator: 1, denominator: 3 },
    },
  });

  const diagnosticsDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: /download diagnostics bundle/i }).click();
  const diagnostics = await diagnosticsDownload;
  expect(diagnostics.suggestedFilename()).toMatch(/^speech-diagnostics-.*\.json$/);
  const diagnosticsJson = await readDownloadedJson(diagnostics);
  expect(diagnosticsJson).toMatchObject({
    schemaVersion: 1,
    reportType: 'speech-diagnostics-export',
    privacy: { containsAudio: false, containsTranscript: false, networkUpload: false },
    benchmark: { reportType: 'speech-benchmark' },
    personalModelReleaseBenchmark: {
      reportType: 'personal-model-release-benchmark',
      status: 'insufficient-evidence',
      privacy: {
        aggregateOnly: true,
        containsAudio: false,
        containsTranscriptText: false,
        containsFeatureTensors: false,
        containsCheckpoints: false,
        containsAdapterWeights: false,
        networkUpload: false,
      },
    },
  });
  await expect(page.getByText(/diagnostics bundle downloaded/i)).toBeVisible({ timeout: 15_000 });
});

async function readDownloadedJson(download: Download): Promise<unknown> {
  const path = await download.path();
  if (!path) {
    throw new Error('Downloaded JSON path was unavailable.');
  }
  return JSON.parse(await readFile(path, 'utf8'));
}
