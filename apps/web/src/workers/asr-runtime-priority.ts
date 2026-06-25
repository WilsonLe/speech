export type AsrRuntimePriorityEventTypeV1 = 'state-request' | 'state-update';

export type AsrRuntimePrioritySourceV1 = 'asr-worker' | 'browser-training-worker';

export type AsrRuntimePriorityReasonV1 =
  | 'state-request'
  | 'runtime-initializing'
  | 'runtime-ready'
  | 'profile-loading'
  | 'profile-ready'
  | 'utterance-started'
  | 'audio-available'
  | 'utterance-ended'
  | 'reset'
  | 'dispose'
  | 'error';

export interface AsrRuntimePriorityEventV1 {
  readonly schemaVersion: 1;
  readonly eventType: AsrRuntimePriorityEventTypeV1;
  readonly requestId: string;
  readonly source: AsrRuntimePrioritySourceV1;
  readonly active: boolean;
  readonly reason: AsrRuntimePriorityReasonV1;
  readonly createdAt: string;
  readonly message: string;
  readonly privacy: {
    readonly containsRawAudio: false;
    readonly containsTranscriptText: false;
    readonly containsPrivateFrozenFeatureValues: false;
    readonly containsCheckpoint: false;
    readonly containsAdapterWeights: false;
    readonly containsRawProfileId: false;
    readonly containsUtteranceId: false;
    readonly containsDatasetId: false;
    readonly networkUpload: false;
    readonly telemetry: false;
    readonly localOnly: true;
  };
}

export interface AsrRuntimePriorityBroadcastChannelLike {
  postMessage(message: AsrRuntimePriorityEventV1): void;
  addEventListener?(
    type: 'message',
    listener: (event: MessageEvent<AsrRuntimePriorityEventV1>) => void,
  ): void;
  removeEventListener?(
    type: 'message',
    listener: (event: MessageEvent<AsrRuntimePriorityEventV1>) => void,
  ): void;
  close(): void;
}

export interface AsrRuntimePriorityBroadcastChannelConstructorLike {
  new (name: string): AsrRuntimePriorityBroadcastChannelLike;
}

export interface AsrRuntimePriorityDependenciesV1 {
  readonly BroadcastChannel?: AsrRuntimePriorityBroadcastChannelConstructorLike;
  readonly now?: () => Date;
  readonly requestId?: string;
}

export interface AsrRuntimePriorityPublisherV1 {
  markActive(reason: Exclude<AsrRuntimePriorityReasonV1, 'state-request'>): void;
  markIdle(reason: Exclude<AsrRuntimePriorityReasonV1, 'state-request'>): void;
  close(): void;
}

export interface AsrRuntimePriorityMonitorV1 {
  isActive(): boolean;
  lastEvent(): AsrRuntimePriorityEventV1 | undefined;
  requestState(): void;
  close(): void;
}

export const asrRuntimePriorityChannelName = 'speech:asr-runtime-priority:v1';

export function createAsrRuntimePriorityPublisher(
  dependencies: AsrRuntimePriorityDependenciesV1 = {},
): AsrRuntimePriorityPublisherV1 {
  const channel = createPriorityChannel(
    dependencies.BroadcastChannel ?? getGlobalBroadcastChannel(),
  );
  let active = false;
  let reason: Exclude<AsrRuntimePriorityReasonV1, 'state-request'> = 'runtime-ready';
  const requestId = dependencies.requestId ?? 'asr-runtime-priority';

  const publishState = (
    nextActive: boolean,
    nextReason: Exclude<AsrRuntimePriorityReasonV1, 'state-request'>,
  ): void => {
    active = nextActive;
    reason = nextReason;
    publish(
      channel,
      createAsrRuntimePriorityEvent({
        eventType: 'state-update',
        requestId,
        source: 'asr-worker',
        active,
        reason,
        ...(dependencies.now === undefined ? {} : { now: dependencies.now }),
      }),
    );
  };

  const onMessage = (event: MessageEvent<AsrRuntimePriorityEventV1>): void => {
    const parsed = parseAsrRuntimePriorityEvent(event.data);
    if (parsed?.eventType !== 'state-request') return;
    publish(
      channel,
      createAsrRuntimePriorityEvent({
        eventType: 'state-update',
        requestId,
        source: 'asr-worker',
        active,
        reason,
        ...(dependencies.now === undefined ? {} : { now: dependencies.now }),
      }),
    );
  };
  channel?.addEventListener?.('message', onMessage);

  return {
    markActive: (nextReason) => publishState(true, nextReason),
    markIdle: (nextReason) => publishState(false, nextReason),
    close: () => {
      channel?.removeEventListener?.('message', onMessage);
      channel?.close();
    },
  };
}

export function createAsrRuntimePriorityMonitor({
  onEvent,
  dependencies = {},
}: {
  readonly onEvent?: (event: AsrRuntimePriorityEventV1) => void;
  readonly dependencies?: AsrRuntimePriorityDependenciesV1;
} = {}): AsrRuntimePriorityMonitorV1 {
  const channel = createPriorityChannel(
    dependencies.BroadcastChannel ?? getGlobalBroadcastChannel(),
  );
  let latest: AsrRuntimePriorityEventV1 | undefined;
  const requestId = dependencies.requestId ?? createEphemeralRequestId();

  const onMessage = (event: MessageEvent<AsrRuntimePriorityEventV1>): void => {
    const parsed = parseAsrRuntimePriorityEvent(event.data);
    if (parsed?.eventType !== 'state-update' || parsed.source !== 'asr-worker') return;
    latest = parsed;
    onEvent?.(parsed);
  };
  channel?.addEventListener?.('message', onMessage);

  return {
    isActive: () => latest?.active === true,
    lastEvent: () => latest,
    requestState: () => {
      publish(
        channel,
        createAsrRuntimePriorityEvent({
          eventType: 'state-request',
          requestId,
          source: 'browser-training-worker',
          active: false,
          reason: 'state-request',
          ...(dependencies.now === undefined ? {} : { now: dependencies.now }),
        }),
      );
    },
    close: () => {
      channel?.removeEventListener?.('message', onMessage);
      channel?.close();
    },
  };
}

export function parseAsrRuntimePriorityEvent(value: unknown): AsrRuntimePriorityEventV1 | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as AsrRuntimePriorityEventV1;
  if (candidate.schemaVersion !== 1) return null;
  if (candidate.eventType !== 'state-request' && candidate.eventType !== 'state-update') {
    return null;
  }
  if (candidate.source !== 'asr-worker' && candidate.source !== 'browser-training-worker') {
    return null;
  }
  if (typeof candidate.requestId !== 'string' || candidate.requestId.length === 0) return null;
  if (typeof candidate.active !== 'boolean') return null;
  if (!isAsrRuntimePriorityReason(candidate.reason)) return null;
  if (typeof candidate.createdAt !== 'string' || candidate.createdAt.length === 0) return null;
  if (typeof candidate.message !== 'string' || candidate.message.length === 0) return null;
  if (
    candidate.privacy?.containsRawAudio !== false ||
    candidate.privacy.containsTranscriptText !== false ||
    candidate.privacy.containsPrivateFrozenFeatureValues !== false ||
    candidate.privacy.containsCheckpoint !== false ||
    candidate.privacy.containsAdapterWeights !== false ||
    candidate.privacy.containsRawProfileId !== false ||
    candidate.privacy.containsUtteranceId !== false ||
    candidate.privacy.containsDatasetId !== false ||
    candidate.privacy.networkUpload !== false ||
    candidate.privacy.telemetry !== false ||
    candidate.privacy.localOnly !== true
  ) {
    return null;
  }
  return candidate;
}

function createAsrRuntimePriorityEvent({
  eventType,
  requestId,
  source,
  active,
  reason,
  now,
}: {
  readonly eventType: AsrRuntimePriorityEventTypeV1;
  readonly requestId: string;
  readonly source: AsrRuntimePrioritySourceV1;
  readonly active: boolean;
  readonly reason: AsrRuntimePriorityReasonV1;
  readonly now?: () => Date;
}): AsrRuntimePriorityEventV1 {
  return {
    schemaVersion: 1,
    eventType,
    requestId,
    source,
    active,
    reason,
    createdAt: (now ?? (() => new Date()))().toISOString(),
    message: formatAsrRuntimePriorityMessage(active, reason),
    privacy: {
      containsRawAudio: false,
      containsTranscriptText: false,
      containsPrivateFrozenFeatureValues: false,
      containsCheckpoint: false,
      containsAdapterWeights: false,
      containsRawProfileId: false,
      containsUtteranceId: false,
      containsDatasetId: false,
      networkUpload: false,
      telemetry: false,
      localOnly: true,
    },
  };
}

function formatAsrRuntimePriorityMessage(
  active: boolean,
  reason: AsrRuntimePriorityReasonV1,
): string {
  if (reason === 'state-request') {
    return 'Browser training requested the local ASR runtime priority state.';
  }
  if (active) {
    return 'ASR runtime is active; browser training must pause cooperatively at a safe boundary.';
  }
  return 'ASR runtime priority is idle; browser training may run when otherwise allowed.';
}

function createPriorityChannel(
  Channel: AsrRuntimePriorityBroadcastChannelConstructorLike | undefined,
): AsrRuntimePriorityBroadcastChannelLike | undefined {
  if (Channel === undefined) return undefined;
  try {
    return new Channel(asrRuntimePriorityChannelName);
  } catch {
    return undefined;
  }
}

function getGlobalBroadcastChannel():
  | AsrRuntimePriorityBroadcastChannelConstructorLike
  | undefined {
  return typeof globalThis.BroadcastChannel === 'undefined'
    ? undefined
    : (globalThis.BroadcastChannel as AsrRuntimePriorityBroadcastChannelConstructorLike);
}

function publish(
  channel: AsrRuntimePriorityBroadcastChannelLike | undefined,
  event: AsrRuntimePriorityEventV1,
): void {
  channel?.postMessage(event);
}

function createEphemeralRequestId(): string {
  const cryptoLike = globalThis.crypto as Crypto | undefined;
  if (typeof cryptoLike?.randomUUID === 'function') {
    return cryptoLike.randomUUID();
  }
  return `asr-priority-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function isAsrRuntimePriorityReason(value: unknown): value is AsrRuntimePriorityReasonV1 {
  return (
    value === 'state-request' ||
    value === 'runtime-initializing' ||
    value === 'runtime-ready' ||
    value === 'profile-loading' ||
    value === 'profile-ready' ||
    value === 'utterance-started' ||
    value === 'audio-available' ||
    value === 'utterance-ended' ||
    value === 'reset' ||
    value === 'dispose' ||
    value === 'error'
  );
}
