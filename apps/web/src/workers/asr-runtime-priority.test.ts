import { describe, expect, it } from 'vitest';
import {
  asrRuntimePriorityChannelName,
  createAsrRuntimePriorityMonitor,
  createAsrRuntimePriorityPublisher,
  parseAsrRuntimePriorityEvent,
  type AsrRuntimePriorityBroadcastChannelLike,
  type AsrRuntimePriorityEventV1,
} from './asr-runtime-priority';

class FakePriorityBroadcastChannel implements AsrRuntimePriorityBroadcastChannelLike {
  static readonly channels = new Set<FakePriorityBroadcastChannel>();
  readonly name: string;
  private listener: ((event: MessageEvent<AsrRuntimePriorityEventV1>) => void) | undefined;

  constructor(name: string) {
    this.name = name;
    FakePriorityBroadcastChannel.channels.add(this);
  }

  postMessage(message: AsrRuntimePriorityEventV1): void {
    for (const channel of FakePriorityBroadcastChannel.channels) {
      if (channel.name !== this.name || channel === this) continue;
      channel.listener?.({ data: message } as MessageEvent<AsrRuntimePriorityEventV1>);
    }
  }

  addEventListener(
    _type: 'message',
    listener: (event: MessageEvent<AsrRuntimePriorityEventV1>) => void,
  ): void {
    this.listener = listener;
  }

  removeEventListener(
    _type: 'message',
    listener: (event: MessageEvent<AsrRuntimePriorityEventV1>) => void,
  ): void {
    if (this.listener === listener) this.listener = undefined;
  }

  close(): void {
    FakePriorityBroadcastChannel.channels.delete(this);
    this.listener = undefined;
  }
}

function resetChannels(): void {
  for (const channel of [...FakePriorityBroadcastChannel.channels]) channel.close();
}

describe('ASR runtime priority coordination', () => {
  it('broadcasts redacted active and idle state updates', () => {
    resetChannels();
    const received: AsrRuntimePriorityEventV1[] = [];
    const publisher = createAsrRuntimePriorityPublisher({
      BroadcastChannel: FakePriorityBroadcastChannel,
      now: () => new Date('2026-06-25T00:00:00.000Z'),
      requestId: 'asr-worker-test',
    });
    const monitor = createAsrRuntimePriorityMonitor({
      dependencies: {
        BroadcastChannel: FakePriorityBroadcastChannel,
        now: () => new Date('2026-06-25T00:00:01.000Z'),
        requestId: 'training-worker-test',
      },
      onEvent: (event) => received.push(event),
    });

    publisher.markActive('utterance-started');
    expect(monitor.isActive()).toBe(true);
    publisher.markIdle('utterance-ended');
    expect(monitor.isActive()).toBe(false);

    expect(received.map((event) => [event.active, event.reason])).toEqual([
      [true, 'utterance-started'],
      [false, 'utterance-ended'],
    ]);
    for (const event of received) {
      expect(event.source).toBe('asr-worker');
      expect(event.privacy).toEqual({
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
      });
      expect(JSON.stringify(event)).not.toContain('utterance-123');
      expect(parseAsrRuntimePriorityEvent(event)).toEqual(event);
    }
    expect(asrRuntimePriorityChannelName).toBe('speech:asr-runtime-priority:v1');

    monitor.close();
    publisher.close();
  });

  it('answers browser-training state requests with the current ASR priority state', () => {
    resetChannels();
    const received: AsrRuntimePriorityEventV1[] = [];
    const publisher = createAsrRuntimePriorityPublisher({
      BroadcastChannel: FakePriorityBroadcastChannel,
      now: () => new Date('2026-06-25T00:00:00.000Z'),
      requestId: 'asr-worker-test',
    });
    publisher.markActive('runtime-initializing');
    const monitor = createAsrRuntimePriorityMonitor({
      dependencies: {
        BroadcastChannel: FakePriorityBroadcastChannel,
        now: () => new Date('2026-06-25T00:00:01.000Z'),
        requestId: 'training-worker-test',
      },
      onEvent: (event) => received.push(event),
    });

    monitor.requestState();

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      eventType: 'state-update',
      source: 'asr-worker',
      active: true,
      reason: 'runtime-initializing',
    });
    expect(monitor.isActive()).toBe(true);

    monitor.close();
    publisher.close();
  });

  it('rejects malformed or privacy-leaking priority events', () => {
    const valid = {
      schemaVersion: 1,
      eventType: 'state-update',
      requestId: 'asr-worker-test',
      source: 'asr-worker',
      active: true,
      reason: 'audio-available',
      createdAt: '2026-06-25T00:00:00.000Z',
      message:
        'ASR runtime is active; browser training must pause cooperatively at a safe boundary.',
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
    } satisfies AsrRuntimePriorityEventV1;

    expect(parseAsrRuntimePriorityEvent(valid)).toEqual(valid);
    expect(parseAsrRuntimePriorityEvent({ ...valid, reason: 'utterance-123' })).toBeNull();
    expect(
      parseAsrRuntimePriorityEvent({
        ...valid,
        privacy: { ...valid.privacy, containsRawAudio: true },
      }),
    ).toBeNull();
  });
});
