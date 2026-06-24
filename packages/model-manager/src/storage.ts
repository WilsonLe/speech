export type ModelStorageBackendKind = 'opfs' | 'cache' | 'memory';
export type BinaryModelFile = ArrayBuffer | ArrayBufferView;

export interface ModelStorageLocator {
  readonly modelId: string;
  readonly version: string;
  readonly fileKey: string;
}

export interface StoredModelFileRecord extends ModelStorageLocator {
  readonly sizeBytes: number;
}

export interface ModelStorageBackend {
  readonly kind: ModelStorageBackendKind;
  putFile(locator: ModelStorageLocator, bytes: BinaryModelFile): Promise<StoredModelFileRecord>;
  getFile(locator: ModelStorageLocator): Promise<ArrayBuffer | undefined>;
  hasFile(locator: ModelStorageLocator): Promise<boolean>;
  deleteFile(locator: ModelStorageLocator): Promise<boolean>;
  listFiles(
    filter?: Partial<Pick<ModelStorageLocator, 'modelId' | 'version'>>,
  ): Promise<StoredModelFileRecord[]>;
  clearVersion(modelId: string, version: string): Promise<void>;
}

export interface CacheStorageLike {
  readonly open: (cacheName: string) => Promise<CacheLike>;
}

export interface CacheLike {
  readonly put: (request: Request, response: Response) => Promise<void>;
  readonly match: (request: Request) => Promise<Response | undefined>;
  readonly delete: (request: Request) => Promise<boolean>;
  readonly keys: () => Promise<readonly Request[]>;
}

export interface StorageManagerWithOpfs {
  readonly getDirectory?: () => Promise<OpfsDirectoryHandleLike>;
}

export interface OpfsDirectoryHandleLike {
  readonly getDirectoryHandle: (
    name: string,
    options?: { readonly create?: boolean },
  ) => Promise<OpfsDirectoryHandleLike>;
  readonly getFileHandle: (
    name: string,
    options?: { readonly create?: boolean },
  ) => Promise<OpfsFileHandleLike>;
  readonly removeEntry: (name: string, options?: { readonly recursive?: boolean }) => Promise<void>;
  readonly entries?: () => AsyncIterableIterator<[string, OpfsHandleLike]>;
  readonly [Symbol.asyncIterator]?: () => AsyncIterableIterator<[string, OpfsHandleLike]>;
}

export interface OpfsFileHandleLike {
  readonly getFile: () => Promise<Blob>;
  readonly createWritable: () => Promise<OpfsWritableFileStreamLike>;
}

export interface OpfsWritableFileStreamLike {
  readonly write: (data: BlobPart) => Promise<void>;
  readonly close: () => Promise<void>;
}

type OpfsHandleLike = OpfsDirectoryHandleLike | OpfsFileHandleLike;

const storagePrefix = '__speech-model-storage';
const cacheStorageOrigin = 'https://speech.local';
const defaultCacheName = 'speech-model-files-v1';

export class InMemoryModelStorageBackend implements ModelStorageBackend {
  readonly kind = 'memory' as const;

  private readonly files = new Map<string, ArrayBuffer>();

  async putFile(
    locator: ModelStorageLocator,
    bytes: BinaryModelFile,
  ): Promise<StoredModelFileRecord> {
    const normalizedLocator = normalizeLocator(locator);
    const copy = toOwnedArrayBuffer(bytes);
    this.files.set(storageKey(normalizedLocator), copy);
    return { ...normalizedLocator, sizeBytes: copy.byteLength };
  }

  async getFile(locator: ModelStorageLocator): Promise<ArrayBuffer | undefined> {
    const bytes = this.files.get(storageKey(normalizeLocator(locator)));
    return bytes?.slice(0);
  }

  async hasFile(locator: ModelStorageLocator): Promise<boolean> {
    return this.files.has(storageKey(normalizeLocator(locator)));
  }

  async deleteFile(locator: ModelStorageLocator): Promise<boolean> {
    return this.files.delete(storageKey(normalizeLocator(locator)));
  }

  async listFiles(
    filter: Partial<Pick<ModelStorageLocator, 'modelId' | 'version'>> = {},
  ): Promise<StoredModelFileRecord[]> {
    const records: StoredModelFileRecord[] = [];
    for (const [key, bytes] of this.files.entries()) {
      const locator = parseStorageKey(key);
      if (matchesFilter(locator, filter)) {
        records.push({ ...locator, sizeBytes: bytes.byteLength });
      }
    }
    return sortRecords(records);
  }

  async clearVersion(modelId: string, version: string): Promise<void> {
    const normalizedModelId = normalizeSegment(modelId, 'modelId');
    const normalizedVersion = normalizeSegment(version, 'version');
    for (const key of [...this.files.keys()]) {
      const locator = parseStorageKey(key);
      if (locator.modelId === normalizedModelId && locator.version === normalizedVersion) {
        this.files.delete(key);
      }
    }
  }
}

export class CacheModelStorageBackend implements ModelStorageBackend {
  readonly kind = 'cache' as const;

  private readonly cacheName: string;
  private readonly cacheStorage: CacheStorageLike;

  constructor(cacheStorage: CacheStorageLike, options: { readonly cacheName?: string } = {}) {
    this.cacheStorage = cacheStorage;
    this.cacheName = options.cacheName ?? defaultCacheName;
  }

  async putFile(
    locator: ModelStorageLocator,
    bytes: BinaryModelFile,
  ): Promise<StoredModelFileRecord> {
    const normalizedLocator = normalizeLocator(locator);
    const body = toOwnedArrayBuffer(bytes);
    const cache = await this.openCache();
    await cache.put(
      requestForLocator(normalizedLocator),
      new Response(body.slice(0), {
        headers: {
          'content-type': 'application/octet-stream',
          'x-speech-size-bytes': String(body.byteLength),
        },
      }),
    );
    return { ...normalizedLocator, sizeBytes: body.byteLength };
  }

  async getFile(locator: ModelStorageLocator): Promise<ArrayBuffer | undefined> {
    const cache = await this.openCache();
    const response = await cache.match(requestForLocator(normalizeLocator(locator)));
    if (response === undefined) {
      return undefined;
    }
    return response.arrayBuffer();
  }

  async hasFile(locator: ModelStorageLocator): Promise<boolean> {
    const cache = await this.openCache();
    return (await cache.match(requestForLocator(normalizeLocator(locator)))) !== undefined;
  }

  async deleteFile(locator: ModelStorageLocator): Promise<boolean> {
    const cache = await this.openCache();
    return cache.delete(requestForLocator(normalizeLocator(locator)));
  }

  async listFiles(
    filter: Partial<Pick<ModelStorageLocator, 'modelId' | 'version'>> = {},
  ): Promise<StoredModelFileRecord[]> {
    const cache = await this.openCache();
    const records: StoredModelFileRecord[] = [];
    for (const request of await cache.keys()) {
      const locator = parseLocatorRequest(request);
      if (locator === undefined || !matchesFilter(locator, filter)) {
        continue;
      }
      const response = await cache.match(request);
      const sizeBytes = response === undefined ? 0 : await responseSize(response);
      records.push({ ...locator, sizeBytes });
    }
    return sortRecords(records);
  }

  async clearVersion(modelId: string, version: string): Promise<void> {
    const normalizedModelId = normalizeSegment(modelId, 'modelId');
    const normalizedVersion = normalizeSegment(version, 'version');
    const cache = await this.openCache();
    for (const request of await cache.keys()) {
      const locator = parseLocatorRequest(request);
      if (locator?.modelId === normalizedModelId && locator.version === normalizedVersion) {
        await cache.delete(request);
      }
    }
  }

  private async openCache(): Promise<CacheLike> {
    return this.cacheStorage.open(this.cacheName);
  }
}

export class OpfsModelStorageBackend implements ModelStorageBackend {
  readonly kind = 'opfs' as const;

  private readonly root: OpfsDirectoryHandleLike;

  constructor(root: OpfsDirectoryHandleLike) {
    this.root = root;
  }

  static async create(storageManager: StorageManagerWithOpfs): Promise<OpfsModelStorageBackend> {
    if (typeof storageManager.getDirectory !== 'function') {
      throw new Error('OPFS is not available in this browser context.');
    }
    return new OpfsModelStorageBackend(await storageManager.getDirectory());
  }

  async putFile(
    locator: ModelStorageLocator,
    bytes: BinaryModelFile,
  ): Promise<StoredModelFileRecord> {
    const normalizedLocator = normalizeLocator(locator);
    const body = toOwnedArrayBuffer(bytes);
    const directory = await this.versionDirectory(
      normalizedLocator.modelId,
      normalizedLocator.version,
      true,
    );
    const fileHandle = await directory.getFileHandle(
      fileNameForFileKey(normalizedLocator.fileKey),
      {
        create: true,
      },
    );
    const writable = await fileHandle.createWritable();
    try {
      await writable.write(body.slice(0));
    } finally {
      await writable.close();
    }
    return { ...normalizedLocator, sizeBytes: body.byteLength };
  }

  async getFile(locator: ModelStorageLocator): Promise<ArrayBuffer | undefined> {
    try {
      const normalizedLocator = normalizeLocator(locator);
      const directory = await this.versionDirectory(
        normalizedLocator.modelId,
        normalizedLocator.version,
        false,
      );
      const fileHandle = await directory.getFileHandle(
        fileNameForFileKey(normalizedLocator.fileKey),
      );
      return fileHandle.getFile().then((file) => file.arrayBuffer());
    } catch (error) {
      if (isNotFoundError(error)) {
        return undefined;
      }
      throw error;
    }
  }

  async hasFile(locator: ModelStorageLocator): Promise<boolean> {
    return (await this.getFile(locator)) !== undefined;
  }

  async deleteFile(locator: ModelStorageLocator): Promise<boolean> {
    try {
      const normalizedLocator = normalizeLocator(locator);
      const directory = await this.versionDirectory(
        normalizedLocator.modelId,
        normalizedLocator.version,
        false,
      );
      await directory.removeEntry(fileNameForFileKey(normalizedLocator.fileKey));
      return true;
    } catch (error) {
      if (isNotFoundError(error)) {
        return false;
      }
      throw error;
    }
  }

  async listFiles(
    filter: Partial<Pick<ModelStorageLocator, 'modelId' | 'version'>> = {},
  ): Promise<StoredModelFileRecord[]> {
    const records: StoredModelFileRecord[] = [];
    const modelsDirectory = await this.modelsDirectory(false);
    if (modelsDirectory === undefined) {
      return records;
    }

    for await (const [modelSegment, modelHandle] of iterateDirectory(modelsDirectory)) {
      if (!isDirectoryHandle(modelHandle)) continue;
      const modelId = decodeSegment(modelSegment);
      if (filter.modelId !== undefined && modelId !== normalizeSegment(filter.modelId, 'modelId')) {
        continue;
      }
      for await (const [versionSegment, versionHandle] of iterateDirectory(modelHandle)) {
        if (!isDirectoryHandle(versionHandle)) continue;
        const version = decodeSegment(versionSegment);
        if (
          filter.version !== undefined &&
          version !== normalizeSegment(filter.version, 'version')
        ) {
          continue;
        }
        for await (const [fileName, fileHandle] of iterateDirectory(versionHandle)) {
          if (!isFileHandle(fileHandle) || !fileName.endsWith('.bin')) continue;
          const fileKey = decodeSegment(fileName.slice(0, -4));
          const file = await fileHandle.getFile();
          records.push({ modelId, version, fileKey, sizeBytes: file.size });
        }
      }
    }
    return sortRecords(records);
  }

  async clearVersion(modelId: string, version: string): Promise<void> {
    try {
      const modelDirectory = await this.modelDirectory(normalizeSegment(modelId, 'modelId'), false);
      if (modelDirectory !== undefined) {
        await modelDirectory.removeEntry(encodeSegment(normalizeSegment(version, 'version')), {
          recursive: true,
        });
      }
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }
  }

  private async versionDirectory(
    modelId: string,
    version: string,
    create: boolean,
  ): Promise<OpfsDirectoryHandleLike> {
    const modelDirectory = await this.modelDirectory(modelId, create);
    if (modelDirectory === undefined) {
      throw notFoundError();
    }
    return modelDirectory.getDirectoryHandle(encodeSegment(version), { create });
  }

  private async modelDirectory(
    modelId: string,
    create: boolean,
  ): Promise<OpfsDirectoryHandleLike | undefined> {
    const modelsDirectory = await this.modelsDirectory(create);
    if (modelsDirectory === undefined) {
      return undefined;
    }
    return modelsDirectory.getDirectoryHandle(encodeSegment(modelId), { create });
  }

  private async modelsDirectory(create: boolean): Promise<OpfsDirectoryHandleLike | undefined> {
    try {
      return await this.root.getDirectoryHandle(storagePrefix, { create });
    } catch (error) {
      if (isNotFoundError(error)) {
        return undefined;
      }
      throw error;
    }
  }
}

export async function createDefaultModelStorageBackend(
  options: {
    readonly storageManager?: StorageManagerWithOpfs | null;
    readonly cacheStorage?: CacheStorageLike | null;
    readonly cacheName?: string;
  } = {},
): Promise<ModelStorageBackend> {
  const storageManager =
    options.storageManager === null
      ? undefined
      : (options.storageManager ?? globalThis.navigator?.storage);
  if (storageManager !== undefined && typeof storageManager.getDirectory === 'function') {
    return OpfsModelStorageBackend.create(storageManager);
  }

  const cacheStorage =
    options.cacheStorage === null ? undefined : (options.cacheStorage ?? globalThis.caches);
  if (cacheStorage !== undefined) {
    return new CacheModelStorageBackend(
      cacheStorage,
      options.cacheName === undefined ? {} : { cacheName: options.cacheName },
    );
  }

  return new InMemoryModelStorageBackend();
}

function normalizeLocator(locator: ModelStorageLocator): ModelStorageLocator {
  return {
    modelId: normalizeSegment(locator.modelId, 'modelId'),
    version: normalizeSegment(locator.version, 'version'),
    fileKey: normalizeSegment(locator.fileKey, 'fileKey'),
  };
}

function normalizeSegment(value: string, name: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value === '.' ||
    value === '..' ||
    value.includes('/') ||
    value.includes('\\')
  ) {
    throw new Error(`${name} must be a safe non-empty path segment.`);
  }
  return value;
}

function toOwnedArrayBuffer(bytes: BinaryModelFile): ArrayBuffer {
  if (bytes instanceof ArrayBuffer) {
    return bytes.slice(0);
  }
  const view = bytes as ArrayBufferView;
  const output = new ArrayBuffer(view.byteLength);
  new Uint8Array(output).set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
  return output;
}

function storageKey(locator: ModelStorageLocator): string {
  return [locator.modelId, locator.version, locator.fileKey].map(encodeSegment).join('/');
}

function parseStorageKey(key: string): ModelStorageLocator {
  const [modelId, version, fileKey, extra] = key.split('/').map(decodeSegment);
  if (
    modelId === undefined ||
    version === undefined ||
    fileKey === undefined ||
    extra !== undefined
  ) {
    throw new Error(`Invalid model storage key: ${key}`);
  }
  return { modelId, version, fileKey };
}

function requestForLocator(locator: ModelStorageLocator): Request {
  return new Request(`${cacheStorageOrigin}/${storagePrefix}/${storageKey(locator)}`);
}

function parseLocatorRequest(request: Request): ModelStorageLocator | undefined {
  const url = new URL(request.url);
  const prefix = `/${storagePrefix}/`;
  if (!url.pathname.startsWith(prefix)) {
    return undefined;
  }
  return parseStorageKey(url.pathname.slice(prefix.length));
}

async function responseSize(response: Response): Promise<number> {
  const headerValue = response.headers.get('x-speech-size-bytes');
  if (headerValue !== null) {
    const parsed = Number.parseInt(headerValue, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return response
    .clone()
    .arrayBuffer()
    .then((bytes) => bytes.byteLength);
}

function matchesFilter(
  locator: ModelStorageLocator,
  filter: Partial<Pick<ModelStorageLocator, 'modelId' | 'version'>>,
): boolean {
  if (
    filter.modelId !== undefined &&
    locator.modelId !== normalizeSegment(filter.modelId, 'modelId')
  ) {
    return false;
  }
  if (
    filter.version !== undefined &&
    locator.version !== normalizeSegment(filter.version, 'version')
  ) {
    return false;
  }
  return true;
}

function sortRecords(records: StoredModelFileRecord[]): StoredModelFileRecord[] {
  return records.sort((left, right) => {
    const leftKey = storageKey(left);
    const rightKey = storageKey(right);
    return leftKey.localeCompare(rightKey);
  });
}

function encodeSegment(value: string): string {
  return encodeURIComponent(value);
}

function decodeSegment(value: string): string {
  return decodeURIComponent(value);
}

function fileNameForFileKey(fileKey: string): string {
  return `${encodeSegment(fileKey)}.bin`;
}

async function* iterateDirectory(
  directory: OpfsDirectoryHandleLike,
): AsyncIterableIterator<[string, OpfsHandleLike]> {
  const entries = directory.entries;
  if (typeof entries === 'function') {
    yield* entries.call(directory);
    return;
  }
  const iterator = directory[Symbol.asyncIterator];
  if (typeof iterator === 'function') {
    yield* iterator.call(directory);
  }
}

function isDirectoryHandle(value: OpfsHandleLike): value is OpfsDirectoryHandleLike {
  return 'getDirectoryHandle' in value;
}

function isFileHandle(value: OpfsHandleLike): value is OpfsFileHandleLike {
  return 'getFile' in value;
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError';
}

function notFoundError(): DOMException {
  return new DOMException('Model storage entry was not found.', 'NotFoundError');
}
