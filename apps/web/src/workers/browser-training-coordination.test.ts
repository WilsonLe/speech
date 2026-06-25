import { describe, expect, it } from 'vitest';
import { createSyntheticFrozenFeatureTinyAdapterDataset } from '@speech/browser-training';
import {
  browserTrainingCoordinationChannelName,
  createBrowserTrainingCoordinationScope,
  parseBrowserTrainingCoordinationEvent,
  runWithBrowserTrainingCoordination,
  type BrowserTrainingBroadcastChannelLike,
  type BrowserTrainingCoordinationEventV1,
  type BrowserTrainingLockLike,
  type BrowserTrainingLockManagerLike,
} from './browser-training-coordination';

class FakeLockManager implements BrowserTrainingLockManagerLike {
  private readonly held = new Set<string>();

  async request<T>(
    name: string,
    _options: { readonly mode: 'exclusive'; readonly ifAvailable: true },
    callback: (lock: BrowserTrainingLockLike | null) => T | Promise<T>,
  ): Promise<T> {
    if (this.held.has(name)) {
      return callback(null);
    }
    this.held.add(name);
    try {
      return await callback({ name, mode: 'exclusive' });
    } finally {
      this.held.delete(name);
    }
  }
}

class FakeBroadcastChannel implements BrowserTrainingBroadcastChannelLike {
  static readonly messages: BrowserTrainingCoordinationEventV1[] = [];
  readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  postMessage(message: BrowserTrainingCoordinationEventV1): void {
    FakeBroadcastChannel.messages.push(message);
  }

  close(): void {
    // No resources to release in the fake channel.
  }
}

function deferred(): { readonly promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('browser training cross-tab coordination', () => {
  it('derives a redacted lock scope without exposing the raw dataset id', () => {
    const dataset = createSyntheticFrozenFeatureTinyAdapterDataset();
    const scope = createBrowserTrainingCoordinationScope(dataset);

    expect(scope.lockName).toMatch(/^speech:browser-training:redacted-fnv1a32:[a-f0-9]{8}$/);
    expect(scope.scopeFingerprint).toMatch(/^redacted-fnv1a32:[a-f0-9]{8}$/);
    expect(scope.lockName).not.toContain(dataset.datasetId);
    expect(scope.scopeFingerprint).not.toContain(dataset.datasetId);
    expect(scope.privacy).toEqual({
      exposesRawProfileId: false,
      exposesDatasetId: false,
      localOnly: true,
    });
  });

  it('rejects a second same-profile run while the first lock is held', async () => {
    FakeBroadcastChannel.messages.length = 0;
    const locks = new FakeLockManager();
    const scope = createBrowserTrainingCoordinationScope(
      createSyntheticFrozenFeatureTinyAdapterDataset(),
    );
    const hold = deferred();
    const events: BrowserTrainingCoordinationEventV1[] = [];

    const first = runWithBrowserTrainingCoordination(
      {
        requestId: 'run-a',
        scope,
        dependencies: {
          locks,
          BroadcastChannel: FakeBroadcastChannel,
          now: () => new Date('2026-06-25T00:00:00.000Z'),
          tabId: 'tab-a',
        },
        onEvent: (event) => events.push(event),
      },
      async () => hold.promise,
    );
    await flushMicrotasks();

    await expect(
      runWithBrowserTrainingCoordination(
        {
          requestId: 'run-b',
          scope,
          dependencies: {
            locks,
            BroadcastChannel: FakeBroadcastChannel,
            now: () => new Date('2026-06-25T00:00:01.000Z'),
            tabId: 'tab-b',
          },
          onEvent: (event) => events.push(event),
        },
        async () => undefined,
      ),
    ).rejects.toThrow(/Another tab is already training this profile/);

    hold.resolve();
    await first;

    expect(events.map((event) => event.eventType)).toEqual([
      'lock-requested',
      'lock-acquired',
      'lock-requested',
      'lock-busy',
      'lock-released',
    ]);
    expect(FakeBroadcastChannel.messages.map((event) => event.eventType)).toEqual(
      events.map((event) => event.eventType),
    );
    for (const event of events) {
      expect(event.scope.scopeFingerprint).toBe(scope.scopeFingerprint);
      expect(event.privacy).toMatchObject({
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
      });
      expect(JSON.stringify(event)).not.toContain('synthetic-frozen-feature-tiny-adapter-v1');
    }
    expect(FakeBroadcastChannel.messages).toHaveLength(5);
  });

  it('continues with an explicit unavailable event when Web Locks are missing', async () => {
    FakeBroadcastChannel.messages.length = 0;
    const scope = createBrowserTrainingCoordinationScope(undefined);
    const events: BrowserTrainingCoordinationEventV1[] = [];

    const result = await runWithBrowserTrainingCoordination(
      {
        requestId: 'run-without-locks',
        scope,
        dependencies: {
          locks: null,
          BroadcastChannel: FakeBroadcastChannel,
          now: () => new Date('2026-06-25T00:00:00.000Z'),
          tabId: 'tab-offline',
        },
        onEvent: (event) => events.push(event),
      },
      async () => 'completed',
    );

    expect(result).toBe('completed');
    expect(events.map((event) => event.eventType)).toEqual(['lock-requested', 'lock-unavailable']);
    expect(FakeBroadcastChannel.messages.map((event) => event.eventType)).toEqual([
      'lock-requested',
      'lock-unavailable',
    ]);
  });

  it('parses only current redacted coordination events', () => {
    const scope = createBrowserTrainingCoordinationScope(undefined);
    const event =
      FakeBroadcastChannel.messages.at(-1) ??
      ({
        schemaVersion: 1,
        eventType: 'lock-requested',
        requestId: 'parse-me',
        tabId: 'tab-parse',
        scope: {
          schemaVersion: 1,
          scopeFingerprint: scope.scopeFingerprint,
          source: scope.source,
          privacy: scope.privacy,
        },
        createdAt: '2026-06-25T00:00:00.000Z',
        message: 'Browser training is requesting the local cross-tab training lock.',
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
      } satisfies BrowserTrainingCoordinationEventV1);

    expect(parseBrowserTrainingCoordinationEvent(event)).toEqual(event);
    expect(parseBrowserTrainingCoordinationEvent({ ...event, schemaVersion: 0 })).toBeNull();
    expect(
      parseBrowserTrainingCoordinationEvent({
        ...event,
        scope: { ...event.scope, scopeFingerprint: 'synthetic-frozen-feature-tiny-adapter-v1' },
      }),
    ).toBeNull();
    expect(browserTrainingCoordinationChannelName).toBe('speech:browser-training-coordination:v1');
  });
});
