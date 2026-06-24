import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  analyzeOnnxRuntimeWebTrainingArtifact,
  pinnedOnnxRuntimeWebTrainingArtifactSnapshot,
  type OnnxRuntimeWebTrainingArtifactSnapshot,
} from './training-artifact-spike';

interface PackageJsonWithExports {
  readonly version?: string;
  readonly description?: string;
  readonly exports?: Record<string, unknown>;
}

const packageRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'node_modules',
  'onnxruntime-web',
);

function readInstalledOnnxRuntimeWebSnapshot(): OnnxRuntimeWebTrainingArtifactSnapshot {
  const packageJson = JSON.parse(
    readFileSync(join(packageRoot, 'package.json'), 'utf8'),
  ) as PackageJsonWithExports;
  const typeDeclarations = readFileSync(join(packageRoot, 'types.d.ts'), 'utf8');
  const distFiles = readdirSync(join(packageRoot, 'dist'))
    .filter((file) => /(?:train|training|ort-wasm|wasm|webgpu|mjs|js)$/i.test(file))
    .map((file) => `dist/${file}`)
    .sort();

  return {
    ...pinnedOnnxRuntimeWebTrainingArtifactSnapshot,
    packageVersion: packageJson.version ?? 'unknown',
    ...(packageJson.description === undefined
      ? {}
      : { packageDescription: packageJson.description }),
    packageExportSubpaths: Object.keys(packageJson.exports ?? {}).sort(),
    distributionFiles: distFiles,
    publicTypeDeclarationText: typeDeclarations,
  };
}

describe('installed onnxruntime-web training artifact surface', () => {
  it('matches the spike decision for the installed package on disk', async () => {
    const runtimeExports = await import('onnxruntime-web');
    const snapshot = {
      ...readInstalledOnnxRuntimeWebSnapshot(),
      runtimeExportNames: Object.keys(runtimeExports).sort(),
    };

    const report = analyzeOnnxRuntimeWebTrainingArtifact(snapshot);

    expect(report.packageVersion).toBe('1.27.0');
    expect(report.evidence.publicExportSubpaths).toContain('./webgpu');
    expect(report.evidence.publicTrainingSubpaths).toEqual([]);
    expect(report.evidence.distributionTrainingFiles).toEqual([]);
    expect(report.evidence.publicTrainingSymbols).toEqual([]);
    expect(report.evidence.publicInferenceSymbols).toEqual(
      expect.arrayContaining(['InferenceSession', 'Tensor', 'env']),
    );
    expect(report.officialDocsListTrainingWasm).toBe(true);
    expect(report.packageIncludesTrainingWasm).toBe(false);
    expect(report.backendDecision).toBe('fixed-adapter-math-fallback-required');
  });
});
