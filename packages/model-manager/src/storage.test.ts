import { describe, expect, it } from 'vitest';
import {
  CacheModelStorageBackend,
  InMemoryModelStorageBackend,
  OpfsModelStorageBackend,
  createDefaultModelStorageBackend,
  type CacheLike,
  type CacheStorageLike,
  type ModelStorageBackend,
  type ModelStorageLocator,
  type OpfsDirectoryHandleLike,
  type OpfsFileHandleLike,
  type OpfsWritableFileStreamLike,
} from './storage';

const encoder: ModelStorageLocator = {
  modelId: 'local-dev-mock',
  version: '0.0.0',
  fileKey: 'encoder',
};
const predictor: ModelStorageLocator = {
  modelId: 'local-dev-mock',
  version: '0.0.0',
  fileKey: 'predictor',
};
const nextVersion: ModelStorageLocator = {
  modelId: 'local-dev-mock',
  version: '0.0.1',
  fileKey: 'encoder',
};

describe('model storage backends', () => {
  it('stores defensive copies and lists memory-backed files by version', async () => {
    const storage = new InMemoryModelStorageBackend();
    const bytes = new Uint8Array([1, 2, 3, 4]);

    await storage.putFile(encoder, bytes);
    bytes[0] = 9;
    await storage.putFile(predictor, new Uint8Array([5, 6]));
    await storage.putFile(nextVersion, new Uint8Array([7]));

    const stored = await storage.getFile(encoder);
    expect(Array.from(new Uint8Array(stored ?? new ArrayBuffer(0)))).toEqual([1, 2, 3, 4]);
    expect(await storage.hasFile(encoder)).toBe(true);
    expect(await storage.listFiles({ modelId: 'local-dev-mock', version: '0.0.0' })).toEqual([
      { ...encoder, sizeBytes: 4 },
      { ...predictor, sizeBytes: 2 },
    ]);

    await storage.clearVersion('local-dev-mock', '0.0.0');
    expect(await storage.hasFile(encoder)).toBe(false);
    expect(await storage.listFiles({ modelId: 'local-dev-mock' })).toEqual([
      { ...nextVersion, sizeBytes: 1 },
    ]);
  });

  it('stores files in Cache Storage-compatible requests', async () => {
    const fakeCacheStorage = new FakeCacheStorage();
    const storage = new CacheModelStorageBackend(fakeCacheStorage, { cacheName: 'test-models' });

    await storage.putFile(encoder, new Uint8Array([10, 20, 30]));

    expect(fakeCacheStorage.openedNames).toEqual(['test-models']);
    expect(await readBytes(storage, encoder)).toEqual([10, 20, 30]);
    expect(await storage.listFiles()).toEqual([{ ...encoder, sizeBytes: 3 }]);
    expect(await storage.deleteFile(encoder)).toBe(true);
    expect(await storage.getFile(encoder)).toBeUndefined();
  });

  it('clears only the requested cache-backed model version', async () => {
    const storage = new CacheModelStorageBackend(new FakeCacheStorage());
    await storage.putFile(encoder, new Uint8Array([1]));
    await storage.putFile(predictor, new Uint8Array([2]));
    await storage.putFile(nextVersion, new Uint8Array([3]));

    await storage.clearVersion('local-dev-mock', '0.0.0');

    expect(await storage.hasFile(encoder)).toBe(false);
    expect(await storage.hasFile(predictor)).toBe(false);
    expect(await storage.hasFile(nextVersion)).toBe(true);
  });

  it('stores files in OPFS-compatible directory handles', async () => {
    const storage = new OpfsModelStorageBackend(new FakeOpfsDirectory());
    await storage.putFile(encoder, new Uint8Array([8, 9]));
    await storage.putFile(nextVersion, new Uint8Array([10]));

    expect(await readBytes(storage, encoder)).toEqual([8, 9]);
    expect(await storage.listFiles({ modelId: 'local-dev-mock' })).toEqual([
      { ...encoder, sizeBytes: 2 },
      { ...nextVersion, sizeBytes: 1 },
    ]);

    await storage.clearVersion('local-dev-mock', '0.0.0');
    expect(await storage.getFile(encoder)).toBeUndefined();
    expect(await storage.hasFile(nextVersion)).toBe(true);
  });

  it('falls back from OPFS to Cache Storage to memory in default backend selection', async () => {
    const cacheStorage = new FakeCacheStorage();
    const cacheBackend = await createDefaultModelStorageBackend({
      storageManager: null,
      cacheStorage,
    });
    const memoryBackend = await createDefaultModelStorageBackend({
      storageManager: null,
      cacheStorage: null,
    });

    expect(cacheBackend.kind).toBe('cache');
    expect(memoryBackend.kind).toBe('memory');
  });

  it('rejects unsafe path segments before storage', async () => {
    const storage = new InMemoryModelStorageBackend();

    await expect(
      storage.putFile({ ...encoder, fileKey: '../encoder' }, new Uint8Array([1])),
    ).rejects.toThrow(/fileKey/);
    await expect(
      storage.putFile({ ...encoder, fileKey: '..' }, new Uint8Array([1])),
    ).rejects.toThrow(/fileKey/);
    await expect(
      storage.putFile({ ...encoder, version: '0\\0' }, new Uint8Array([1])),
    ).rejects.toThrow(/version/);
  });
});

async function readBytes(storage: ModelStorageBackend, locator: ModelStorageLocator) {
  const bytes = await storage.getFile(locator);
  return Array.from(new Uint8Array(bytes ?? new ArrayBuffer(0)));
}

class FakeCacheStorage implements CacheStorageLike {
  readonly openedNames: string[] = [];
  private readonly cache = new FakeCache();

  async open(cacheName: string): Promise<CacheLike> {
    if (!this.openedNames.includes(cacheName)) {
      this.openedNames.push(cacheName);
    }
    return this.cache;
  }
}

class FakeCache implements CacheLike {
  private readonly responses = new Map<string, Response>();

  async put(request: Request, response: Response): Promise<void> {
    this.responses.set(request.url, response.clone());
  }

  async match(request: Request): Promise<Response | undefined> {
    return this.responses.get(request.url)?.clone();
  }

  async delete(request: Request): Promise<boolean> {
    return this.responses.delete(request.url);
  }

  async keys(): Promise<readonly Request[]> {
    return [...this.responses.keys()].map((url) => new Request(url));
  }
}

class FakeOpfsDirectory implements OpfsDirectoryHandleLike {
  private readonly directories = new Map<string, FakeOpfsDirectory>();
  private readonly files = new Map<string, FakeOpfsFile>();

  async getDirectoryHandle(
    name: string,
    options: { readonly create?: boolean } = {},
  ): Promise<OpfsDirectoryHandleLike> {
    const existing = this.directories.get(name);
    if (existing !== undefined) {
      return existing;
    }
    if (options.create !== true) {
      throw notFound();
    }
    const directory = new FakeOpfsDirectory();
    this.directories.set(name, directory);
    return directory;
  }

  async getFileHandle(
    name: string,
    options: { readonly create?: boolean } = {},
  ): Promise<OpfsFileHandleLike> {
    const existing = this.files.get(name);
    if (existing !== undefined) {
      return existing;
    }
    if (options.create !== true) {
      throw notFound();
    }
    const file = new FakeOpfsFile();
    this.files.set(name, file);
    return file;
  }

  async removeEntry(name: string): Promise<void> {
    if (this.files.delete(name) || this.directories.delete(name)) {
      return;
    }
    throw notFound();
  }

  async *entries(): AsyncIterableIterator<[string, OpfsDirectoryHandleLike | OpfsFileHandleLike]> {
    for (const entry of this.directories.entries()) {
      yield entry;
    }
    for (const entry of this.files.entries()) {
      yield entry;
    }
  }
}

class FakeOpfsFile implements OpfsFileHandleLike {
  private bytes = new ArrayBuffer(0);

  async getFile(): Promise<Blob> {
    return new Blob([this.bytes.slice(0)]);
  }

  async createWritable(): Promise<OpfsWritableFileStreamLike> {
    return new FakeOpfsWritableFileStream((bytes) => {
      this.bytes = bytes;
    });
  }
}

class FakeOpfsWritableFileStream implements OpfsWritableFileStreamLike {
  private readonly commit: (bytes: ArrayBuffer) => void;
  private bytes = new ArrayBuffer(0);

  constructor(commit: (bytes: ArrayBuffer) => void) {
    this.commit = commit;
  }

  async write(data: BlobPart): Promise<void> {
    if (data instanceof ArrayBuffer) {
      this.bytes = data.slice(0);
      return;
    }
    if (ArrayBuffer.isView(data)) {
      const output = new ArrayBuffer(data.byteLength);
      new Uint8Array(output).set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
      this.bytes = output;
      return;
    }
    if (data instanceof Blob) {
      this.bytes = await data.arrayBuffer();
      return;
    }
    this.bytes = new TextEncoder().encode(data).buffer;
  }

  async close(): Promise<void> {
    this.commit(this.bytes.slice(0));
  }
}

function notFound(): DOMException {
  return new DOMException('not found', 'NotFoundError');
}
