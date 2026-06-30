import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Page,
  type TestInfo,
} from '@playwright/test';

const execFileAsync = promisify(execFile);
const productionBaseUrl =
  process.env['SPEECH_PRODUCTION_BASE_URL'] ?? 'https://speech-amber-beta.vercel.app';
const runProductionDictation = process.env['SPEECH_PRODUCTION_DICTATION_E2E'] === '1';
const chromiumExecutablePath = process.env['PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'];
const reusableProfileDir = process.env['SPEECH_PRODUCTION_DICTATION_PROFILE_DIR'];
const sourcePhrase = process.env['SPEECH_PRODUCTION_DICTATION_TEXT'] ?? 'viet nam';

test.describe('production model install and fake-microphone dictation', () => {
  test.skip(
    !runProductionDictation,
    'Set SPEECH_PRODUCTION_DICTATION_E2E=1 to download the real production model and run the fake-microphone dictation smoke.',
  );

  test('downloads the deployed model and transcribes generated TTS microphone audio', async ({
    browserName,
  }, testInfo) => {
    void browserName;
    test.setTimeout(45 * 60_000);
    const workDir = await mkdtemp(join(tmpdir(), 'speech-production-dictation-'));
    const userDataDir = reusableProfileDir ?? join(workDir, 'chromium-profile');
    const audioPath = join(workDir, 'source-phrase.wav');
    await generateTtsWav(sourcePhrase, audioPath);

    const context = await chromium.launchPersistentContext(userDataDir, {
      ...(chromiumExecutablePath ? { executablePath: chromiumExecutablePath } : {}),
      headless: true,
      viewport: { width: 1440, height: 900 },
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        `--use-file-for-fake-audio-capture=${audioPath}`,
        '--autoplay-policy=no-user-gesture-required',
      ],
    });

    let page: Page | undefined;
    const consoleMessages: string[] = [];
    const pageErrors: string[] = [];

    try {
      page = context.pages()[0] ?? (await context.newPage());
      page.on('console', (message) => {
        const text = message.text();
        consoleMessages.push(`${message.type()}: ${text}`);
      });
      page.on('pageerror', (error) => pageErrors.push(error.message));

      await page.goto(productionBaseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await expect(
        page.getByRole('heading', { name: /Speech model required|Dictate/i }),
      ).toBeVisible({
        timeout: 60_000,
      });

      await installProductionModelIfNeeded(page, testInfo);
      await dictateWithFakeMicrophone(page);

      const transcriptText = await page
        .getByRole('region', { name: /^dictate$/i })
        .getByRole('textbox', { name: 'Transcript' })
        .inputValue();
      await testInfo.attach('production-dictation-result.json', {
        contentType: 'application/json',
        body: JSON.stringify(
          {
            sourcePhrase,
            normalizedSource: normalizeTranscript(sourcePhrase),
            transcriptText,
            normalizedTranscript: normalizeTranscript(transcriptText),
            productionBaseUrl,
            consoleMessages: consoleMessages.filter(isRelevantConsoleMessage),
            pageErrors,
          },
          null,
          2,
        ),
      });

      expect(
        consoleMessages.filter((message) =>
          /content security policy|violates.*connect-src/i.test(message),
        ),
      ).toEqual([]);
      expect(pageErrors).toEqual([]);
      expect(normalizeTranscript(transcriptText)).toContain(normalizeTranscript(sourcePhrase));
    } catch (error) {
      if (page) {
        await attachProductionFailureState(page, testInfo, consoleMessages, pageErrors);
      }
      throw error;
    } finally {
      await closeContext(context);
      await rm(workDir, { recursive: true, force: true });
    }
  });
});

async function generateTtsWav(text: string, outputPath: string): Promise<void> {
  const textFile = `${outputPath}.txt`;
  await writeFile(textFile, text, 'utf8');
  await execFileAsync('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    `flite=textfile=${escapeFilterPath(textFile)}:voice=kal`,
    '-af',
    'apad=pad_dur=1',
    '-ar',
    '48000',
    '-ac',
    '1',
    '-sample_fmt',
    's16',
    outputPath,
  ]);
}

function escapeFilterPath(path: string): string {
  return path.replace(/[\\':]/g, '\\$&');
}

async function installProductionModelIfNeeded(page: Page, testInfo: TestInfo): Promise<void> {
  const dictate = page.getByRole('region', { name: /^dictate$/i });
  if (
    await dictate
      .locator('.push-to-talk-button')
      .isVisible()
      .catch(() => false)
  ) {
    return;
  }

  const setup = page.getByRole('region', { name: /speech model required/i });
  await expect(setup).toBeVisible({ timeout: 60_000 });
  const installButton = setup.getByRole('button', { name: 'Install model', exact: true });

  const progressStatus = page.getByRole('status', { name: 'Model setup progress' });
  const modelRequests: string[] = [];
  const modelRequestFailures: Array<{ url: string; failure: string }> = [];
  const progressSamples: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (/huggingface\.co|cdn\.hf\.co/i.test(url)) {
      modelRequests.push(redactUrl(url));
    }
  });
  page.on('requestfailed', (request) => {
    const url = request.url();
    if (/huggingface\.co|cdn\.hf\.co/i.test(url)) {
      modelRequestFailures.push({
        url: redactUrl(url),
        failure: request.failure()?.errorText ?? 'unknown request failure',
      });
    }
  });

  await installButton.click();
  await expect(progressStatus).toContainText(
    /Downloading model|Verifying model|Saving download|Activating model|Removing partial download/,
    { timeout: 120_000 },
  );

  let installError: unknown;
  try {
    await expect
      .poll(
        async () => {
          if (
            await dictate
              .locator('.push-to-talk-button')
              .isVisible()
              .catch(() => false)
          ) {
            return 'ready';
          }
          const statusText = await progressStatus
            .textContent()
            .catch(() => 'No setup progress text.');
          if (statusText && progressSamples.at(-1) !== statusText) {
            progressSamples.push(statusText);
          }
          return statusText ?? 'Waiting for setup progress.';
        },
        {
          timeout: 30 * 60_000,
          intervals: [5_000, 10_000, 30_000, 60_000],
          message: 'Waiting for real production model install to reach the ready Dictate state.',
        },
      )
      .toBe('ready');
  } catch (error) {
    installError = error;
  } finally {
    await testInfo.attach('production-model-install-state.json', {
      contentType: 'application/json',
      body: JSON.stringify(
        {
          modelRequests,
          modelRequestFailures,
          progressSamples,
          lastProgress: progressSamples.at(-1) ?? null,
        },
        null,
        2,
      ),
    });
  }

  expect(modelRequests.some((url) => url.startsWith('https://huggingface.co/'))).toBe(true);
  if (installError) {
    throw new Error(
      `Production model install did not reach the ready Dictate state. Last progress: ${
        progressSamples.at(-1) ?? 'unknown'
      }`,
      { cause: installError },
    );
  }
}

async function dictateWithFakeMicrophone(page: Page): Promise<void> {
  const dictate = page.getByRole('region', { name: /^dictate$/i });
  const button = dictate.locator('.push-to-talk-button');
  await button.scrollIntoViewIfNeeded();

  await page.keyboard.down('Space');
  await expect(button).toHaveAttribute('aria-pressed', 'true', { timeout: 30_000 });
  await page.waitForTimeout(6_000);
  await page.keyboard.up('Space');
  await expect(button).toHaveAttribute('aria-pressed', 'false', { timeout: 30_000 });

  await expect
    .poll(
      async () =>
        normalizeTranscript(
          await dictate.getByRole('textbox', { name: 'Transcript' }).inputValue(),
        ),
      { timeout: 60_000, message: 'Waiting for dictated transcript text.' },
    )
    .not.toBe('');
}

function redactUrl(value: string): string {
  const url = new URL(value);
  url.search = '';
  url.hash = '';
  return url.toString();
}

function normalizeTranscript(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isRelevantConsoleMessage(message: string): boolean {
  return /content security policy|violates.*connect-src|model|asr|microphone|worklet|error/i.test(
    message,
  );
}

async function attachProductionFailureState(
  page: Page,
  testInfo: TestInfo,
  consoleMessages: string[],
  pageErrors: string[],
): Promise<void> {
  const visibleText = await page
    .locator('body')
    .innerText()
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      return `Unable to read page text: ${message}`;
    });
  const transcriptText = await page
    .getByRole('region', { name: /^dictate$/i })
    .getByRole('textbox', { name: 'Transcript' })
    .inputValue()
    .catch(() => '');

  await testInfo.attach('production-dictation-failure-state.json', {
    contentType: 'application/json',
    body: JSON.stringify(
      {
        productionBaseUrl,
        url: page.url(),
        sourcePhrase,
        normalizedSource: normalizeTranscript(sourcePhrase),
        transcriptText,
        normalizedTranscript: normalizeTranscript(transcriptText),
        visibleText,
        consoleMessages: consoleMessages.filter(isRelevantConsoleMessage),
        pageErrors,
      },
      null,
      2,
    ),
  });

  await testInfo.attach('production-dictation-failure-screenshot.png', {
    contentType: 'image/png',
    body: await page.screenshot({ fullPage: true }),
  });
}

async function closeContext(context: BrowserContext): Promise<void> {
  try {
    await context.close();
  } catch {
    // Ignore cleanup errors after production smoke failures; Playwright artifacts capture details.
  }
}
