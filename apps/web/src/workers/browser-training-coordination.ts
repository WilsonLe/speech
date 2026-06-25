import type { FrozenFeatureTinyAdapterDatasetV1 } from '@speech/browser-training';

export type BrowserTrainingCoordinationEventTypeV1 =
  | 'lock-requested'
  | 'lock-acquired'
  | 'lock-busy'
  | 'lock-released'
  | 'lock-unavailable';

export interface BrowserTrainingCoordinationScopeV1 {
  readonly schemaVersion: 1;
  readonly lockName: string;
  readonly scopeFingerprint: string;
  readonly source: 'dataset-id' | 'explicit-scope' | 'synthetic-default';
  readonly privacy: {
    readonly exposesRawProfileId: false;
    readonly exposesDatasetId: false;
    readonly localOnly: true;
  };
}

export interface BrowserTrainingCoordinationEventV1 {
  readonly schemaVersion: 1;
  readonly eventType: BrowserTrainingCoordinationEventTypeV1;
  readonly requestId: string;
  readonly tabId: string;
  readonly scope: Omit<BrowserTrainingCoordinationScopeV1, 'lockName'>;
  readonly createdAt: string;
  readonly message: string;
  readonly privacy: {
    readonly containsRawAudio: false;
    readonly containsTranscriptText: false;
    readonly containsPrivateFrozenFeatureValues: false;
    readonly containsCheckpoint: false;
    readonly containsAdapterWeights: false;
    readonly containsRawProfileId: false;
    readonly containsDatasetId: false;
    readonly networkUpload: false;
    readonly telemetry: false;
    readonly localOnly: true;
  };
}

export interface BrowserTrainingLockLike {
  readonly name: string;
  readonly mode: 'exclusive' | 'shared';
}

export interface BrowserTrainingLockManagerLike {
  request<T>(
    name: string,
    options: { readonly mode: 'exclusive'; readonly ifAvailable: true },
    callback: (lock: BrowserTrainingLockLike | null) => T | Promise<T>,
  ): Promise<T>;
}

export interface BrowserTrainingBroadcastChannelLike {
  postMessage(message: BrowserTrainingCoordinationEventV1): void;
  addEventListener?(
    type: 'message',
    listener: (event: MessageEvent<BrowserTrainingCoordinationEventV1>) => void,
  ): void;
  removeEventListener?(
    type: 'message',
    listener: (event: MessageEvent<BrowserTrainingCoordinationEventV1>) => void,
  ): void;
  close(): void;
}

export interface BrowserTrainingBroadcastChannelConstructorLike {
  new (name: string): BrowserTrainingBroadcastChannelLike;
}

export interface BrowserTrainingCoordinationDependenciesV1 {
  readonly locks?: BrowserTrainingLockManagerLike | null;
  readonly BroadcastChannel?: BrowserTrainingBroadcastChannelConstructorLike;
  readonly now?: () => Date;
  readonly tabId?: string;
}

export interface RunWithBrowserTrainingCoordinationOptionsV1 {
  readonly requestId: string;
  readonly scope: BrowserTrainingCoordinationScopeV1;
  readonly enabled?: boolean;
  readonly onEvent?: (event: BrowserTrainingCoordinationEventV1) => void;
  readonly dependencies?: BrowserTrainingCoordinationDependenciesV1;
}

export const browserTrainingCoordinationChannelName = 'speech:browser-training-coordination:v1';

const defaultScopeSeed = 'synthetic-frozen-feature-tiny-adapter-v1';

export function createBrowserTrainingCoordinationScope(
  dataset: FrozenFeatureTinyAdapterDatasetV1 | undefined,
  explicitScopeId?: string,
): BrowserTrainingCoordinationScopeV1 {
  const source =
    explicitScopeId === undefined ? (dataset?.datasetId ?? defaultScopeSeed) : explicitScopeId;
  const fingerprint = `redacted-fnv1a32:${fnv1a32(source)}`;
  return {
    schemaVersion: 1,
    lockName: `speech:browser-training:${fingerprint}`,
    scopeFingerprint: fingerprint,
    source:
      explicitScopeId === undefined
        ? dataset === undefined
          ? 'synthetic-default'
          : 'dataset-id'
        : 'explicit-scope',
    privacy: {
      exposesRawProfileId: false,
      exposesDatasetId: false,
      localOnly: true,
    },
  };
}

export async function runWithBrowserTrainingCoordination<T>(
  options: RunWithBrowserTrainingCoordinationOptionsV1,
  run: () => Promise<T>,
): Promise<T> {
  if (options.enabled === false) {
    return run();
  }
  const dependencies = options.dependencies ?? {};
  const locks = dependencies.locks === undefined ? getGlobalLockManager() : dependencies.locks;
  const channel = createCoordinationChannel(
    dependencies.BroadcastChannel ?? getGlobalBroadcastChannel(),
  );
  const tabId = dependencies.tabId ?? createEphemeralTabId();
  const publish = (eventType: BrowserTrainingCoordinationEventTypeV1, message: string): void => {
    const event = createCoordinationEvent({
      eventType,
      requestId: options.requestId,
      tabId,
      scope: options.scope,
      message,
      ...(dependencies.now === undefined ? {} : { now: dependencies.now }),
    });
    options.onEvent?.(event);
    channel?.postMessage(event);
  };

  publish('lock-requested', 'Browser training is requesting the local cross-tab training lock.');
  if (locks === undefined || locks === null) {
    publish(
      'lock-unavailable',
      'Web Locks are unavailable in this browser context; training will continue without cross-tab exclusivity.',
    );
    try {
      return await run();
    } finally {
      channel?.close();
    }
  }

  try {
    return await locks.request(
      options.scope.lockName,
      { mode: 'exclusive', ifAvailable: true },
      async (lock) => {
        if (lock === null) {
          publish('lock-busy', 'Another tab is already training this profile.');
          throw new Error(
            'Another tab is already training this profile. Pause or cancel it before starting a new browser-training run.',
          );
        }
        publish('lock-acquired', 'Browser training acquired the local cross-tab training lock.');
        try {
          return await run();
        } finally {
          publish('lock-released', 'Browser training released the local cross-tab training lock.');
        }
      },
    );
  } finally {
    channel?.close();
  }
}

export function subscribeBrowserTrainingCoordination(
  listener: (event: BrowserTrainingCoordinationEventV1) => void,
  dependencies: Pick<BrowserTrainingCoordinationDependenciesV1, 'BroadcastChannel'> = {},
): () => void {
  const channel = createCoordinationChannel(
    dependencies.BroadcastChannel ?? getGlobalBroadcastChannel(),
  );
  if (channel === undefined || channel.addEventListener === undefined) {
    return () => undefined;
  }
  const onMessage = (event: MessageEvent<BrowserTrainingCoordinationEventV1>): void => {
    const parsed = parseBrowserTrainingCoordinationEvent(event.data);
    if (parsed !== null) listener(parsed);
  };
  channel.addEventListener('message', onMessage);
  return () => {
    channel.removeEventListener?.('message', onMessage);
    channel.close();
  };
}

export function parseBrowserTrainingCoordinationEvent(
  value: unknown,
): BrowserTrainingCoordinationEventV1 | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as BrowserTrainingCoordinationEventV1;
  if (candidate.schemaVersion !== 1) return null;
  if (!isCoordinationEventType(candidate.eventType)) return null;
  if (typeof candidate.requestId !== 'string' || candidate.requestId.length === 0) return null;
  if (typeof candidate.tabId !== 'string' || candidate.tabId.length === 0) return null;
  if (typeof candidate.createdAt !== 'string' || candidate.createdAt.length === 0) return null;
  if (typeof candidate.message !== 'string' || candidate.message.length === 0) return null;
  if (
    candidate.scope?.schemaVersion !== 1 ||
    typeof candidate.scope.scopeFingerprint !== 'string' ||
    !candidate.scope.scopeFingerprint.startsWith('redacted-fnv1a32:') ||
    !['dataset-id', 'explicit-scope', 'synthetic-default'].includes(candidate.scope.source)
  ) {
    return null;
  }
  if (
    candidate.privacy?.containsRawAudio !== false ||
    candidate.privacy.containsTranscriptText !== false ||
    candidate.privacy.containsPrivateFrozenFeatureValues !== false ||
    candidate.privacy.containsCheckpoint !== false ||
    candidate.privacy.containsAdapterWeights !== false ||
    candidate.privacy.containsRawProfileId !== false ||
    candidate.privacy.containsDatasetId !== false ||
    candidate.privacy.networkUpload !== false ||
    candidate.privacy.telemetry !== false ||
    candidate.privacy.localOnly !== true
  ) {
    return null;
  }
  return candidate;
}

function createCoordinationEvent({
  eventType,
  requestId,
  tabId,
  scope,
  message,
  now,
}: {
  readonly eventType: BrowserTrainingCoordinationEventTypeV1;
  readonly requestId: string;
  readonly tabId: string;
  readonly scope: BrowserTrainingCoordinationScopeV1;
  readonly message: string;
  readonly now?: () => Date;
}): BrowserTrainingCoordinationEventV1 {
  return {
    schemaVersion: 1,
    eventType,
    requestId,
    tabId,
    scope: {
      schemaVersion: scope.schemaVersion,
      scopeFingerprint: scope.scopeFingerprint,
      source: scope.source,
      privacy: scope.privacy,
    },
    createdAt: (now ?? (() => new Date()))().toISOString(),
    message,
    privacy: {
      containsRawAudio: false,
      containsTranscriptText: false,
      containsPrivateFrozenFeatureValues: false,
      containsCheckpoint: false,
      containsAdapterWeights: false,
      containsRawProfileId: false,
      containsDatasetId: false,
      networkUpload: false,
      telemetry: false,
      localOnly: true,
    },
  };
}

function createCoordinationChannel(
  Channel: BrowserTrainingBroadcastChannelConstructorLike | undefined,
): BrowserTrainingBroadcastChannelLike | undefined {
  if (Channel === undefined) return undefined;
  try {
    return new Channel(browserTrainingCoordinationChannelName);
  } catch {
    return undefined;
  }
}

function getGlobalLockManager(): BrowserTrainingLockManagerLike | undefined {
  const navigatorLike = (
    globalThis as { readonly navigator?: { readonly locks?: BrowserTrainingLockManagerLike } }
  ).navigator;
  return navigatorLike?.locks;
}

function getGlobalBroadcastChannel(): BrowserTrainingBroadcastChannelConstructorLike | undefined {
  return typeof globalThis.BroadcastChannel === 'undefined'
    ? undefined
    : (globalThis.BroadcastChannel as BrowserTrainingBroadcastChannelConstructorLike);
}

function createEphemeralTabId(): string {
  const cryptoLike = globalThis.crypto as Crypto | undefined;
  if (typeof cryptoLike?.randomUUID === 'function') {
    return cryptoLike.randomUUID();
  }
  return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function isCoordinationEventType(value: unknown): value is BrowserTrainingCoordinationEventTypeV1 {
  return (
    value === 'lock-requested' ||
    value === 'lock-acquired' ||
    value === 'lock-busy' ||
    value === 'lock-released' ||
    value === 'lock-unavailable'
  );
}

function fnv1a32(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
