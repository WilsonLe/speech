import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';

const baseManifestUrl = new URL(
  '../public/model-packs/vietasr-iter3-int8/manifest.json',
  import.meta.url,
);

export async function seedInstalledBaseModel(page: Page): Promise<void> {
  const manifest = await loadBaseManifest();
  const requiredStorageBytes = Object.values(manifest.files).reduce(
    (total, file) => total + file.sizeBytes,
    0,
  );
  await page.goto('/model-catalog.json');
  await page.evaluate(
    async ({ activeVersion, manifestJson, requiredBytes }) => {
      const storageManager = navigator.storage as StorageManager & {
        getDirectory?: () => Promise<FileSystemDirectoryHandle>;
      };
      if (typeof storageManager.getDirectory !== 'function') {
        throw new Error('OPFS is required for the installed-model E2E fixture.');
      }
      const root = await storageManager.getDirectory();
      const storage = await root.getDirectoryHandle('__speech-model-storage', { create: true });
      const registry = await storage.getDirectoryHandle('__speech-model-install-registry', {
        create: true,
      });
      const version = await registry.getDirectoryHandle('v1', { create: true });
      const handle = await version.getFileHandle('vietasr-iter3-int8.bin', { create: true });
      const writable = await handle.createWritable();
      const now = '2026-06-27T00:00:00.000Z';
      const manifest = JSON.parse(manifestJson) as { readonly id: string };
      const record = {
        schemaVersion: 1,
        modelId: manifest.id,
        activeVersion,
        manifest,
        files: [],
        requiredStorageBytes: requiredBytes,
        backendKind: 'opfs',
        installId: 'e2e-seeded-base-model',
        installedAt: now,
        activatedAt: now,
      };
      await writable.write(JSON.stringify(record, null, 2));
      await writable.close();
    },
    {
      activeVersion: manifest.version,
      manifestJson: JSON.stringify(manifest),
      requiredBytes: requiredStorageBytes,
    },
  );
  await page.goto('/');
}

export async function mockTinyBaseModelInstall(page: Page): Promise<void> {
  const manifest = await makeTinyManifest();
  const fileMap = new Map(Object.entries(manifest.__e2eFiles));
  const publicManifest = { ...manifest };
  delete (publicManifest as { __e2eFiles?: unknown }).__e2eFiles;

  await page.route('**/model-packs/vietasr-iter3-int8/manifest.json', async (route) => {
    await route.fulfill({
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(publicManifest),
    });
  });

  await page.route('**/__e2e-model-files/*', async (route) => {
    const key = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-1) ?? '');
    const bytes = fileMap.get(key);
    if (bytes === undefined) {
      await route.abort();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
    await route.fulfill({
      contentType: publicManifest.files[key]?.mediaType ?? 'application/octet-stream',
      body: Buffer.from(bytes),
    });
  });
}

async function loadBaseManifest(): Promise<BaseManifest> {
  return JSON.parse(await readFile(baseManifestUrl, 'utf8')) as BaseManifest;
}

async function makeTinyManifest(): Promise<BaseManifest & { readonly __e2eFiles: TinyFileMap }> {
  const manifest = await loadBaseManifest();
  const tinyFiles: TinyFileMap = {};
  const files: BaseManifest['files'] = {};
  for (const [fileKey, file] of Object.entries(manifest.files)) {
    const bytes = Buffer.from(`speech-e2e-${fileKey}`, 'utf8');
    tinyFiles[fileKey] = [...bytes];
    files[fileKey] = {
      ...file,
      url: `/__e2e-model-files/${encodeURIComponent(fileKey)}`,
      sha256: sha256(bytes),
      sizeBytes: bytes.byteLength,
    };
  }
  return { ...manifest, files, __e2eFiles: tinyFiles };
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

interface BaseManifest {
  readonly schemaVersion: number;
  readonly id: string;
  readonly version: string;
  readonly displayName: string;
  readonly languages: readonly string[];
  readonly files: Record<
    string,
    {
      readonly url: string;
      readonly sha256: string;
      readonly sizeBytes: number;
      readonly mediaType: string;
    }
  >;
}

type TinyFileMap = Record<string, readonly number[]>;
