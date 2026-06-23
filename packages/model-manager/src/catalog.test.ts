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

    expect(catalog.models.length).toBeGreaterThanOrEqual(2);
    const vietasr = catalog.models.find((entry) => entry.id === 'vietasr-iter3-int8');
    if (vietasr === undefined) throw new Error('Expected VietASR catalog entry.');
    expect(vietasr.runtime.status).toBe('candidate');
    expect(vietasr.runtime.streamingReady).toBe(false);
    expect(vietasr.manifestUrl).toBeDefined();
    expect(vietasr.manifestSha256).toBeDefined();

    const manifestPath = resolveCatalogUrl(vietasr.manifestUrl);
    const manifestBytes = await readFile(manifestPath);
    expect(createHash('sha256').update(manifestBytes).digest('hex')).toBe(vietasr.manifestSha256);

    const manifest = parseSpeechModelManifestV2(JSON.parse(manifestBytes.toString('utf8')));
    expect(manifest.id).toBe(vietasr.id);
    expect(manifest.version).toBe(vietasr.version);
    expect(manifest.displayName).toBe(vietasr.displayName);
    expect(manifest.languages).toEqual(vietasr.languages);
    expect(manifest.license.spdx).toBe(vietasr.license.spdx);
    expect(manifest.license.redistributionAllowed).toBe(vietasr.license.redistributionAllowed);
    expect(manifest.graphs.encoder.stateRelationships).toBeUndefined();
  });

  it('allows blocked non-installable research candidates without manifests', async () => {
    const catalogText = await readFile(catalogPath, 'utf8');
    const catalog = parseModelCatalogV1(JSON.parse(catalogText));
    const blockedCandidate = catalog.models.find(
      (entry) => entry.id === 'nvidia-parakeet-ctc-vietnamese-research',
    );

    if (blockedCandidate === undefined) throw new Error('Expected blocked research candidate.');
    expect(blockedCandidate.runtime.status).toBe('blocked');
    expect(blockedCandidate.runtime.installable).toBe(false);
    expect(blockedCandidate.runtime.streamingReady).toBe(false);
    expect(blockedCandidate.manifestUrl).toBeUndefined();
    expect(blockedCandidate.manifestSha256).toBeUndefined();
    expect(blockedCandidate.license.redistributionAllowed).toBe(false);
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

  it('requires manifest pointers for installable entries', () => {
    const result = validateModelCatalogV1({
      schemaVersion: 1,
      models: [minimalEntryWithoutManifest('missing-manifest')],
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('models[0].manifestUrl must be a non-empty string');
    expect(result.errors).toContain('models[0].manifestSha256 must be a non-empty string');
  });

  it('rejects non-blocked entries without manifest pointers', () => {
    const candidateWithoutManifest = minimalEntryWithoutManifest('candidate-without-manifest');
    candidateWithoutManifest.runtime.installable = false;

    const result = validateModelCatalogV1({
      schemaVersion: 1,
      models: [candidateWithoutManifest],
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'models[0].manifestUrl is required unless runtime.status is blocked',
    );
  });

  it('rejects blocked entries that are marked installable or streaming-ready', () => {
    const blocked = minimalEntry('bad-blocked');
    blocked.runtime.status = 'blocked';
    blocked.runtime.streamingReady = true;

    const result = validateModelCatalogV1({ schemaVersion: 1, models: [blocked] });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      'models[0].runtime.installable must be false when status is blocked',
    );
    expect(result.errors).toContain(
      'models[0].runtime.streamingReady must be false when status is blocked',
    );
  });
});

function resolveCatalogUrl(manifestUrl: string | undefined): string {
  if (manifestUrl === undefined || !manifestUrl.startsWith('/')) {
    throw new Error(`Expected same-origin manifest URL: ${String(manifestUrl)}`);
  }
  return resolve(publicRoot, manifestUrl.slice(1));
}

function minimalEntryWithoutManifest(id: string) {
  return {
    id,
    version: '1.0.0',
    displayName: 'Test Model',
    languages: ['vi'],
    license: { name: 'Test License', redistributionAllowed: true },
    runtime: {
      status: 'candidate',
      installable: true,
      streamingReady: false,
      notes: ['test only'],
    },
  };
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
      installable: true,
      streamingReady: false,
      notes: ['test only'],
    },
  };
}
