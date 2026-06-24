import {
  createDefaultModelStorageBackend,
  deleteInstalledModelRecord,
  getInstalledModelRecord,
  getManifestRequiredStorageBytes,
  installModelPack,
  parseModelCatalogV1,
  sha256ArrayBuffer,
  type InstalledModelRecord,
  type ModelCatalogEntryV1,
  type ModelCatalogV1,
  type ModelStorageBackend,
} from '@speech/model-manager';
import { parseSpeechModelManifestV2, type SpeechModelManifestV2 } from '@speech/protocol';
import type { ModelLifecycleRequest, ModelLifecycleResponse } from './model-lifecycle-client';

const catalogUrl = '/model-catalog.json';
const textDecoder = new TextDecoder();

let storagePromise: Promise<ModelStorageBackend> | null = null;
let catalogPromise: Promise<ModelCatalogV1> | null = null;
let manifestCache = new Map<string, SpeechModelManifestV2>();

self.addEventListener('message', (event: MessageEvent<ModelLifecycleRequest>) => {
  void handleRequest(event.data);
});

async function handleRequest(message: ModelLifecycleRequest): Promise<void> {
  try {
    switch (message.type) {
      case 'INIT':
        await handleInit();
        return;
      case 'INSPECT_MODEL':
        await handleInspectModel(message.modelId);
        return;
      case 'INSTALL_MODEL':
        await handleInstallModel(message.modelId);
        return;
      case 'DELETE_ACTIVE_MODEL':
        await handleDeleteActiveModel(message.modelId);
        return;
      case 'DISPOSE':
        close();
        return;
    }
  } catch (error) {
    post({ type: 'ERROR', message: errorMessage(error), recoverable: true });
  }
}

async function handleInit(): Promise<void> {
  const [storage, catalog] = await Promise.all([getStorage(), getCatalog()]);
  const installed = await getInstalledRecords(storage, catalog.models);
  post({ type: 'READY', catalog, backendKind: storage.kind, installed });
}

async function handleInspectModel(modelId: string): Promise<void> {
  const { catalogEntry, manifest, manifestBytes } = await getCatalogEntryAndManifest(modelId);
  const manifestSha256 = await sha256ArrayBuffer(manifestBytes);
  post({
    type: 'MANIFEST_READY',
    inspection: {
      modelId: manifest.id,
      version: manifest.version,
      requiredStorageBytes: getManifestRequiredStorageBytes(manifest),
      manifestSha256,
      manifestSha256MatchesCatalog: manifestSha256 === catalogEntry.manifestSha256,
      streamingReady: catalogEntry.runtime.streamingReady,
      fileCount: Object.keys(manifest.files).length,
    },
  });
}

async function handleInstallModel(modelId: string): Promise<void> {
  const storage = await getStorage();
  const catalogEntry = await getCatalogEntry(modelId);
  if (!catalogEntry.runtime.installable) {
    throw new Error(`Model ${modelId} is not marked installable in the public catalog.`);
  }
  const { manifest } = await getCatalogEntryAndManifest(modelId);
  const record = await installModelPack(manifest, {
    storage,
    requestPersistentStorage,
    acceptLicense: (candidate) => candidate.license.redistributionAllowed,
    onProgress: (progress) => post({ type: 'INSTALL_PROGRESS', progress }),
  });
  post({ type: 'INSTALL_COMPLETE', record });
}

async function handleDeleteActiveModel(modelId: string): Promise<void> {
  const storage = await getStorage();
  await deleteInstalledModelRecord(storage, modelId);
  post({ type: 'DELETE_COMPLETE', modelId });
}

async function getCatalogEntryAndManifest(modelId: string): Promise<{
  readonly catalogEntry: ModelCatalogEntryV1 & {
    readonly manifestUrl: string;
    readonly manifestSha256: string;
  };
  readonly manifest: SpeechModelManifestV2;
  readonly manifestBytes: ArrayBuffer;
}> {
  const catalogEntry = await getCatalogEntry(modelId);
  if (catalogEntry.manifestUrl === undefined || catalogEntry.manifestSha256 === undefined) {
    throw new Error(`Model ${modelId} does not provide an installable browser manifest.`);
  }
  const manifestCatalogEntry = {
    ...catalogEntry,
    manifestUrl: catalogEntry.manifestUrl,
    manifestSha256: catalogEntry.manifestSha256,
  };
  const cachedManifest = manifestCache.get(modelId);
  if (cachedManifest !== undefined) {
    const manifestBytes = await fetchManifestBytes(manifestCatalogEntry.manifestUrl);
    return { catalogEntry: manifestCatalogEntry, manifest: cachedManifest, manifestBytes };
  }

  const manifestBytes = await fetchManifestBytes(manifestCatalogEntry.manifestUrl);
  const manifest = parseSpeechModelManifestV2(
    JSON.parse(textDecoder.decode(manifestBytes)) as unknown,
  );
  manifestCache = new Map(manifestCache).set(modelId, manifest);
  return { catalogEntry: manifestCatalogEntry, manifest, manifestBytes };
}

async function getCatalogEntry(modelId: string): Promise<ModelCatalogEntryV1> {
  const catalog = await getCatalog();
  const catalogEntry = catalog.models.find((model) => model.id === modelId);
  if (catalogEntry === undefined) {
    throw new Error(`Model ${modelId} was not found in the public catalog.`);
  }
  return catalogEntry;
}

async function fetchManifestBytes(manifestUrl: string): Promise<ArrayBuffer> {
  const response = await fetch(new URL(manifestUrl, self.location.origin), { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`Fetching model manifest failed with HTTP ${response.status.toString()}.`);
  }
  return response.arrayBuffer();
}

async function getInstalledRecords(
  storage: ModelStorageBackend,
  models: readonly ModelCatalogEntryV1[],
): Promise<InstalledModelRecord[]> {
  const records: InstalledModelRecord[] = [];
  for (const model of models) {
    const record = await getInstalledModelRecord(storage, model.id);
    if (record !== undefined) {
      records.push(record);
    }
  }
  return records;
}

async function getCatalog(): Promise<ModelCatalogV1> {
  catalogPromise ??= fetch(catalogUrl, { cache: 'no-cache' })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Fetching model catalog failed with HTTP ${response.status.toString()}.`);
      }
      return response.json() as Promise<unknown>;
    })
    .then(parseModelCatalogV1);
  return catalogPromise;
}

async function getStorage(): Promise<ModelStorageBackend> {
  storagePromise ??= createDefaultModelStorageBackend();
  return storagePromise;
}

async function requestPersistentStorage(): Promise<boolean> {
  const persist = navigator.storage?.persist;
  if (typeof persist !== 'function') {
    return false;
  }
  return persist.call(navigator.storage);
}

function post(message: ModelLifecycleResponse): void {
  self.postMessage(message);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
