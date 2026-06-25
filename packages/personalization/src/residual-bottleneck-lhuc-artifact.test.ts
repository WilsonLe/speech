import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  applyResidualBottleneckLhucAdapterFrame,
  createIdentityResidualBottleneckLhucAdapter,
  type ResidualBottleneckLhucAdapterParametersV1,
  type ResidualBottleneckLhucParameterTensorsV1,
} from './residual-bottleneck-lhuc';

const contractVectors = JSON.parse(
  readFileSync(
    new URL(
      '../../../model-packs/example-manifest/browser-training/contract-test-vectors.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as {
  artifactRole: 'contract-test-vectors';
  vectors: Array<{
    id: string;
    inputFrame: number[];
    tensors: 'nominal-checkpoint:identity-zero' | ResidualBottleneckLhucParameterTensorsV1;
    expectedOutput: number[];
    tolerance: number;
  }>;
  privacy: {
    containsRawAudio: false;
    containsTranscriptText: false;
    containsPrivateFrozenFeatureValues: false;
    networkUpload: false;
    localOnly: true;
  };
};

describe('residual bottleneck/LHUC browser-training artifact vectors', () => {
  it('matches committed synthetic contract-test-vector outputs', () => {
    expect(contractVectors.artifactRole).toBe('contract-test-vectors');
    expect(contractVectors.privacy).toMatchObject({
      containsRawAudio: false,
      containsTranscriptText: false,
      containsPrivateFrozenFeatureValues: false,
      networkUpload: false,
      localOnly: true,
    });

    for (const vector of contractVectors.vectors) {
      const adapter = adapterForVector(vector.tensors);
      const result = applyResidualBottleneckLhucAdapterFrame(vector.inputFrame, adapter);

      expect(result.output).toHaveLength(vector.expectedOutput.length);
      result.output.forEach((value, index) => {
        expect(Math.abs(value - (vector.expectedOutput[index] ?? 0))).toBeLessThanOrEqual(
          vector.tolerance,
        );
      });
    }
  });
});

function adapterForVector(
  tensors: 'nominal-checkpoint:identity-zero' | ResidualBottleneckLhucParameterTensorsV1,
): ResidualBottleneckLhucAdapterParametersV1 {
  const base = createIdentityResidualBottleneckLhucAdapter({
    inputDimension: 4,
    rank: 2,
    residualScale: 0.25,
  });
  if (tensors === 'nominal-checkpoint:identity-zero') return base;
  return { ...base, tensors };
}
