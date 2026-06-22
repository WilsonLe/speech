import type {
  InstalledModelRecord,
  ModelCatalogEntryV1,
  ModelCatalogV1,
  ModelInstallProgress,
  ModelStorageBackendKind,
} from '@speech/model-manager';
import modelLifecycleWorkerUrl from './model-lifecycle.worker.ts?worker&url';

export type ModelLifecycleRequest =
  | { readonly type: 'INIT' }
  | { readonly type: 'INSPECT_MODEL'; readonly modelId: string }
  | { readonly type: 'INSTALL_MODEL'; readonly modelId: string }
  | { readonly type: 'DELETE_ACTIVE_MODEL'; readonly modelId: string }
  | { readonly type: 'DISPOSE' };

export interface ManifestInspectionResult {
  readonly modelId: string;
  readonly version: string;
  readonly requiredStorageBytes: number;
  readonly manifestSha256: string;
  readonly manifestSha256MatchesCatalog: boolean;
  readonly streamingReady: boolean;
  readonly fileCount: number;
}

export type ModelLifecycleResponse =
  | {
      readonly type: 'READY';
      readonly catalog: ModelCatalogV1;
      readonly backendKind: ModelStorageBackendKind;
      readonly installed: readonly InstalledModelRecord[];
    }
  | { readonly type: 'MANIFEST_READY'; readonly inspection: ManifestInspectionResult }
  | { readonly type: 'INSTALL_PROGRESS'; readonly progress: ModelInstallProgress }
  | { readonly type: 'INSTALL_COMPLETE'; readonly record: InstalledModelRecord }
  | { readonly type: 'DELETE_COMPLETE'; readonly modelId: string }
  | { readonly type: 'ERROR'; readonly message: string; readonly recoverable: boolean };

export type ModelLifecycleModel = ModelCatalogEntryV1;

export function createModelLifecycleWorker(): Worker {
  return new Worker(modelLifecycleWorkerUrl, {
    type: 'module',
    name: 'speech-model-lifecycle-worker',
  });
}
