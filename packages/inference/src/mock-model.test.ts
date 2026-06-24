import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSpeechModelManifestV2, type SpeechModelManifestV2 } from '@speech/protocol';
import { describe, expect, it } from 'vitest';
import {
  createOrtInferenceSession,
  loadOnnxRuntimeWeb,
  type OrtInferenceSession,
} from './onnx-runtime';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const manifestPath = resolve(repoRoot, 'model-packs/example-manifest/local-dev-rnnt-mock.json');
const manifestDir = dirname(manifestPath);

describe('mock ONNX model pack', () => {
  it('ships deterministic graph files matching the manifest checksums', async () => {
    const manifest = await loadMockManifest();

    for (const [fileKey, fileRef] of Object.entries(manifest.files)) {
      const modelBytes = await readFile(resolve(manifestDir, fileRef.url));
      expect(modelBytes.byteLength, fileKey).toBe(fileRef.sizeBytes);
      expect(createHash('sha256').update(modelBytes).digest('hex'), fileKey).toBe(fileRef.sha256);
      expect(fileRef.mediaType).toBe('application/onnx');
    }
  });

  it('loads and runs encoder, predictor, and joiner graphs through ONNX Runtime Web WASM', async () => {
    const manifest = await loadMockManifest();
    const runtime = await loadOnnxRuntimeWeb({
      preferredProvider: 'wasm',
      capabilities: {
        webGpu: false,
        crossOriginIsolated: false,
        sharedArrayBuffer: false,
      },
      wasm: { numThreads: 1 },
    });

    const encoder = await createSession(runtime, manifest, 'encoder');
    const predictor = await createSession(runtime, manifest, 'predictor');
    const joiner = await createSession(runtime, manifest, 'joiner');

    try {
      const features = new runtime.ort.Tensor('float32', Float32Array.from([1, 2, 3, 4]), [1, 4]);
      const encoderCacheIn = new runtime.ort.Tensor(
        'float32',
        Float32Array.from([0, 0, 0, 0]),
        [1, 4],
      );
      const tokens = new runtime.ort.Tensor('float32', Float32Array.from([0.5, 0, 1, 0]), [1, 4]);

      const encoded = await encoder.run({ features, encoder_cache_in: encoderCacheIn });
      const predicted = await predictor.run({ tokens });
      const encodedTensor = requireTensor(encoded['encoded'], 'encoded');
      const encoderCacheOutTensor = requireTensor(
        encoded['encoder_cache_out'],
        'encoder_cache_out',
      );
      const predictedTensor = requireTensor(predicted['predicted'], 'predicted');
      const logits = await joiner.run({
        encoded: encodedTensor,
        predicted: predictedTensor,
      });
      const logitsTensor = requireTensor(logits['logits'], 'logits');

      expect(Array.from(encodedTensor.data as Float32Array)).toEqual([1, 2, 3, 4]);
      expect(Array.from(encoderCacheOutTensor.data as Float32Array)).toEqual([1, 2, 3, 4]);
      expect(Array.from(predictedTensor.data as Float32Array)).toEqual([0.5, 0, 1, 0]);
      expect(Array.from(logitsTensor.data as Float32Array)).toEqual([1.5, 2, 4, 4]);
    } finally {
      await disposeSession(encoder);
      await disposeSession(predictor);
      await disposeSession(joiner);
    }
  });
});

async function loadMockManifest(): Promise<SpeechModelManifestV2> {
  return parseSpeechModelManifestV2(JSON.parse(await readFile(manifestPath, 'utf8')));
}

async function createSession(
  runtime: Awaited<ReturnType<typeof loadOnnxRuntimeWeb>>,
  manifest: SpeechModelManifestV2,
  graphName: 'encoder' | 'predictor' | 'joiner',
): Promise<OrtInferenceSession> {
  const graph = manifest.graphs[graphName];
  const fileRef = manifest.files[graph.fileKey];
  if (fileRef === undefined) {
    throw new Error(`Missing mock model file entry for ${graphName}.`);
  }
  const modelBytes = await readFile(resolve(manifestDir, fileRef.url));
  return createOrtInferenceSession(runtime, modelBytes);
}

function requireTensor(
  value: Awaited<ReturnType<OrtInferenceSession['run']>>[string] | undefined,
  name: string,
): Awaited<ReturnType<OrtInferenceSession['run']>>[string] {
  if (value === undefined) {
    throw new Error(`Mock ONNX output ${name} was not produced.`);
  }
  return value;
}

async function disposeSession(session: OrtInferenceSession): Promise<void> {
  await session.release?.();
}
