import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSpeechModelManifestV2 } from '@speech/protocol';
import { describe, expect, it } from 'vitest';
import { parseModelCatalogV1, validateModelCatalogV1 } from './catalog';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const publicRoot = resolve(repoRoot, 'apps/web/public');
const catalogPath = resolve(publicRoot, 'model-catalog.json');

describe('model catalog v1', () => {
  it('validates the public model catalog and referenced same-origin manifests', async () => {
    const catalogText = await readFile(catalogPath, 'utf8');
    const catalog = parseModelCatalogV1(JSON.parse(catalogText));

    expect(catalog.models).toHaveLength(1);
    const [entry] = catalog.models;
    if (entry === undefined) throw new Error('Expected at least one catalog entry.');
    expect(entry.id).toBe('vietasr-iter3-int8');
    expect(entry.runtime.status).toBe('candidate');
    expect(entry.runtime.streamingReady).toBe(false);

    const manifestPath = resolveCatalogUrl(entry.manifestUrl);
    const manifestBytes = await readFile(manifestPath);
    expect(createHash('sha256').update(manifestBytes).digest('hex')).toBe(entry.manifestSha256);

    const manifest = parseSpeechModelManifestV2(JSON.parse(manifestBytes.toString('utf8')));
    expect(manifest.id).toBe(entry.id);
    expect(manifest.version).toBe(entry.version);
    expect(manifest.displayName).toBe(entry.displayName);
    expect(manifest.languages).toEqual(entry.languages);
    expect(manifest.license.spdx).toBe(entry.license.spdx);
    expect(manifest.license.redistributionAllowed).toBe(entry.license.redistributionAllowed);
    expect(manifest.graphs.encoder.stateRelationships).toBeUndefined();
  });

  it('reports invalid catalog entries', () => {
    const result = validateModelCatalogV1({
      schemaVersion: 1,
      models: [
        {
          id: 'bad id',
          version: '',
          displayName: 'Broken',
          languages: ['klingon'],
          manifestUrl: '',
          manifestSha256: 'not-a-sha',
          license: { name: '', redistributionAllowed: 'yes' },
          runtime: { status: 'unknown', installable: 'yes', streamingReady: 'no', notes: [] },
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('models[0].id has invalid format');
    expect(result.errors).toContain('models[0].version must be a non-empty string');
    expect(result.errors).toContain('models[0].languages[0] has unsupported value');
    expect(result.errors).toContain('models[0].manifestUrl must be a non-empty string');
    expect(result.errors).toContain('models[0].manifestSha256 has invalid format');
    expect(result.errors).toContain('models[0].license.name must be a non-empty string');
    expect(result.errors).toContain('models[0].license.redistributionAllowed must be boolean');
    expect(result.errors).toContain('models[0].runtime.status has unsupported value');
    expect(result.errors).toContain('models[0].runtime.installable must be boolean');
    expect(result.errors).toContain('models[0].runtime.streamingReady must be boolean');
    expect(result.errors).toContain('models[0].runtime.notes must be a non-empty array');
  });

  it('rejects duplicate model ids', () => {
    const result = validateModelCatalogV1({
      schemaVersion: 1,
      models: [minimalEntry('duplicate'), minimalEntry('duplicate')],
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('models[1].id must be unique');
  });
});

function resolveCatalogUrl(manifestUrl: string): string {
  if (!manifestUrl.startsWith('/'))
    throw new Error(`Expected same-origin manifest URL: ${manifestUrl}`);
  return resolve(publicRoot, manifestUrl.slice(1));
}

function minimalEntry(id: string) {
  return {
    id,
    version: '1.0.0',
    displayName: 'Test Model',
    languages: ['vi'],
    manifestUrl: '/model-packs/test/manifest.json',
    manifestSha256: '0'.repeat(64),
    license: { name: 'Test License', redistributionAllowed: true },
    runtime: {
      status: 'candidate',
      installable: false,
      streamingReady: false,
      notes: ['test only'],
    },
  };
}
