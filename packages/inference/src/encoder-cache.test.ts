import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSpeechModelManifestV2, type GraphContract } from '@speech/protocol';
import { describe, expect, it } from 'vitest';
import { StreamingEncoderCacheAdapter, type EncoderSessionLike } from './encoder-cache';
import { createOrtInferenceSession, loadOnnxRuntimeWeb } from './onnx-runtime';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const manifestPath = resolve(repoRoot, 'model-packs/example-manifest/local-dev-rnnt-mock.json');
const manifestDir = dirname(manifestPath);

describe('StreamingEncoderCacheAdapter', () => {
  it('feeds initial state, carries cache outputs into the next chunk, and resets by utterance', async () => {
    const session = new FakeEncoderSession([
      { encoded: 'encoded-1', cache_out: 'cache-1' },
      { encoded: 'encoded-2', cache_out: 'cache-2' },
      { encoded: 'encoded-3', cache_out: 'cache-3' },
    ]);
    const adapter = new StreamingEncoderCacheAdapter({
      graph: statefulEncoderGraph(),
      session,
      initialStateFactory: {
        createInitialState: () => 'zero-cache',
      },
    });

    await expect(adapter.encodeChunk('features-1')).resolves.toMatchObject({
      encoded: 'encoded-1',
      state: { cache_out: 'cache-1' },
      fedStateInputs: ['cache_in'],
    });
    await expect(adapter.encodeChunk('features-2')).resolves.toMatchObject({
      encoded: 'encoded-2',
      state: { cache_out: 'cache-2' },
      fedStateInputs: ['cache_in'],
    });
    adapter.resetUtterance();
    await expect(adapter.encodeChunk('features-3')).resolves.toMatchObject({
      encoded: 'encoded-3',
      state: { cache_out: 'cache-3' },
      fedStateInputs: ['cache_in'],
    });

    expect(session.feeds).toEqual([
      { features: 'features-1', cache_in: 'zero-cache' },
      { features: 'features-2', cache_in: 'cache-1' },
      { features: 'features-3', cache_in: 'zero-cache' },
    ]);
  });

  it('omits cache feeds when no initial state exists yet', async () => {
    const session = new FakeEncoderSession([{ encoded: 'encoded', cache_out: 'cache' }]);
    const adapter = new StreamingEncoderCacheAdapter({ graph: statefulEncoderGraph(), session });

    await adapter.encodeChunk('features');

    expect(session.feeds).toEqual([{ features: 'features' }]);
  });

  it('honors relationship resetAtUtteranceBoundary flags', async () => {
    const session = new FakeEncoderSession([
      { encoded: 'encoded-1', cache_out: 'cache-1' },
      { encoded: 'encoded-2', cache_out: 'cache-2' },
    ]);
    const adapter = new StreamingEncoderCacheAdapter({
      graph: statefulEncoderGraph({ resetAtUtteranceBoundary: false }),
      session,
    });

    await adapter.encodeChunk('features-1');
    adapter.resetUtterance();
    await adapter.encodeChunk('features-2');

    expect(session.feeds).toEqual([
      { features: 'features-1' },
      { features: 'features-2', cache_in: 'cache-1' },
    ]);
  });

  it('rejects ambiguous manifest feature inputs unless explicitly named', () => {
    const graph = statefulEncoderGraph({ extraInputs: ['side_channel'] });

    expect(
      () => new StreamingEncoderCacheAdapter({ graph, session: new FakeEncoderSession([]) }),
    ).toThrow(/exactly one encoder feature input/);

    expect(
      () =>
        new StreamingEncoderCacheAdapter({
          graph,
          session: new FakeEncoderSession([]),
          featureInputName: 'features',
        }),
    ).not.toThrow();
  });

  it('fails loudly when the encoder output or cache output is missing', async () => {
    const missingEncoded = new StreamingEncoderCacheAdapter({
      graph: statefulEncoderGraph(),
      session: new FakeEncoderSession([{ cache_out: 'cache' }]),
    });
    await expect(missingEncoded.encodeChunk('features')).rejects.toThrow(/encoded/);

    const missingCache = new StreamingEncoderCacheAdapter({
      graph: statefulEncoderGraph(),
      session: new FakeEncoderSession([{ encoded: 'encoded' }]),
    });
    await expect(missingCache.encodeChunk('features')).rejects.toThrow(/cache_out/);
  });

  it('runs the generated mock encoder graph with manifest-defined cache names', async () => {
    const manifest = parseSpeechModelManifestV2(JSON.parse(await readFile(manifestPath, 'utf8')));
    const runtime = await loadOnnxRuntimeWeb({
      preferredProvider: 'wasm',
      capabilities: {
        webGpu: false,
        crossOriginIsolated: false,
        sharedArrayBuffer: false,
      },
      wasm: { numThreads: 1 },
    });
    const encoderFile = manifest.files[manifest.graphs.encoder.fileKey];
    if (encoderFile === undefined) throw new Error('Mock encoder file entry missing.');
    const session = await createOrtInferenceSession(
      runtime,
      await readFile(resolve(manifestDir, encoderFile.url)),
    );
    const adapter = new StreamingEncoderCacheAdapter({
      graph: manifest.graphs.encoder,
      session,
      initialStateFactory: {
        createInitialState: () =>
          new runtime.ort.Tensor('float32', Float32Array.from([0.5, 1, 1.5, 2]), [1, 4]),
      },
    });

    try {
      const features = new runtime.ort.Tensor('float32', Float32Array.from([1, 2, 3, 4]), [1, 4]);
      const first = await adapter.encodeChunk(features);
      expect(Array.from(first.encoded.data as Float32Array)).toEqual([1.5, 3, 4.5, 6]);
      expect(Array.from(first.state['encoder_cache_out']?.data as Float32Array)).toEqual([
        1.5, 3, 4.5, 6,
      ]);

      const second = await adapter.encodeChunk(features);
      expect(Array.from(second.encoded.data as Float32Array)).toEqual([2.5, 5, 7.5, 10]);
    } finally {
      await session.release?.();
    }
  });
});

class FakeEncoderSession implements EncoderSessionLike<string> {
  readonly feeds: Record<string, string>[] = [];

  constructor(private readonly outputs: Record<string, string>[]) {}

  async run(feeds: Record<string, string>): Promise<Record<string, string>> {
    this.feeds.push({ ...feeds });
    return this.outputs.shift() ?? {};
  }
}

function statefulEncoderGraph(
  options: {
    readonly extraInputs?: readonly string[];
    readonly resetAtUtteranceBoundary?: boolean;
  } = {},
): GraphContract {
  return {
    fileKey: 'encoder',
    inputs: [
      tensor('features'),
      tensor('cache_in'),
      ...(options.extraInputs ?? []).map((name) => tensor(name)),
    ],
    outputs: [tensor('encoded'), tensor('cache_out')],
    stateRelationships: [
      {
        input: 'cache_in',
        output: 'cache_out',
        resetAtUtteranceBoundary: options.resetAtUtteranceBoundary ?? true,
      },
    ],
  };
}

function tensor(name: string) {
  return {
    name,
    dataType: 'float32' as const,
    shape: [1, 4],
    description: name,
  };
}
