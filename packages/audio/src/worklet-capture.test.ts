import { describe, expect, it } from 'vitest';
import type { AudioContextLike, ConnectableAudioNodeLike } from './microphone';
import { createSharedPcmRingBuffer, getPcmRingBufferState } from './ring-buffer';
import {
  attachPcmCaptureWorklet,
  type AudioWorkletNodeLike,
  type PcmCaptureWorkletCommand,
  type PcmCaptureWorkletMessage,
} from './worklet-capture';

class FakeAudioNode implements ConnectableAudioNodeLike {
  readonly connections: ConnectableAudioNodeLike[] = [];
  disconnected = false;

  connect(destination: ConnectableAudioNodeLike): ConnectableAudioNodeLike {
    this.connections.push(destination);
    return destination;
  }

  disconnect(): void {
    this.disconnected = true;
  }
}

class FakeMessagePort {
  onmessage: ((event: MessageEvent<PcmCaptureWorkletMessage>) => void) | null = null;
  readonly posted: PcmCaptureWorkletCommand[] = [];
  closed = false;
  started = false;

  postMessage(message: PcmCaptureWorkletCommand): void {
    this.posted.push(message);
  }

  start(): void {
    this.started = true;
  }

  close(): void {
    this.closed = true;
  }

  emit(message: PcmCaptureWorkletMessage): void {
    this.onmessage?.({ data: message } as MessageEvent<PcmCaptureWorkletMessage>);
  }
}

class FakeWorkletNode extends FakeAudioNode implements AudioWorkletNodeLike {
  readonly port = new FakeMessagePort();
}

describe('PCM capture worklet attachment', () => {
  it('loads, connects, starts, relays messages, stops, and disposes the worklet node', async () => {
    const sourceNode = new FakeAudioNode();
    const destination = new FakeAudioNode();
    const loadedModules: string[] = [];
    const workletNode = new FakeWorkletNode();
    const messages: PcmCaptureWorkletMessage[] = [];

    const audioContext: AudioContextLike = {
      sampleRate: 48_000,
      state: 'running',
      destination,
      audioWorklet: {
        addModule: async (moduleURL) => {
          loadedModules.push(moduleURL.toString());
        },
      },
      createMediaStreamSource: () => sourceNode,
      resume: async () => undefined,
      close: async () => undefined,
    };

    const controller = await attachPcmCaptureWorklet({
      audioContext,
      sourceNode,
      workletModuleUrl: '/pcm-capture.worklet.js',
      onMessage: (message) => messages.push(message),
      createAudioWorkletNode: () => workletNode,
    });

    expect(loadedModules).toEqual(['/pcm-capture.worklet.js']);
    expect(sourceNode.connections).toEqual([workletNode]);
    expect(workletNode.connections).toEqual([destination]);
    expect(workletNode.port.started).toBe(true);
    expect(workletNode.port.posted).toEqual([{ type: 'USE_CHUNK_MESSAGES' }]);

    controller.start();
    controller.start();
    expect(controller.active).toBe(true);
    expect(workletNode.port.posted).toEqual([{ type: 'USE_CHUNK_MESSAGES' }, { type: 'START' }]);

    workletNode.port.emit({
      type: 'LEVEL',
      sequence: 1,
      sampleRateHz: 48_000,
      capturedFrame: 128,
      metrics: { sampleCount: 128, peak: 0.5, rms: 0.2, clippedSamples: 0, clippingRatio: 0 },
    });
    expect(messages).toHaveLength(1);

    controller.stop();
    expect(controller.active).toBe(false);
    expect(workletNode.port.posted.at(-1)).toEqual({ type: 'STOP' });

    controller.dispose();
    controller.dispose();
    expect(sourceNode.disconnected).toBe(true);
    expect(workletNode.disconnected).toBe(true);
    expect(workletNode.port.closed).toBe(true);
  });

  it('sends a shared ring buffer configuration before capture starts', async () => {
    const sourceNode = new FakeAudioNode();
    const destination = new FakeAudioNode();
    const workletNode = new FakeWorkletNode();
    const ringBuffer = createSharedPcmRingBuffer({
      sourceSampleRateHz: 48_000,
      capacitySamples: 16,
    });
    const messages: PcmCaptureWorkletMessage[] = [];

    const audioContext: AudioContextLike = {
      sampleRate: 48_000,
      state: 'running',
      destination,
      audioWorklet: { addModule: async () => undefined },
      createMediaStreamSource: () => sourceNode,
      resume: async () => undefined,
      close: async () => undefined,
    };

    await attachPcmCaptureWorklet({
      audioContext,
      sourceNode,
      workletModuleUrl: '/pcm-capture.worklet.js',
      sharedRingBuffer: ringBuffer,
      onMessage: (message) => messages.push(message),
      createAudioWorkletNode: () => workletNode,
    });

    expect(workletNode.port.posted[0]).toMatchObject({ type: 'USE_SHARED_RING_BUFFER' });
    const state = getPcmRingBufferState(ringBuffer);
    expect(state).toMatchObject({
      capacitySamples: 16,
      sourceSampleRateHz: 48_000,
    });
    expect(messages).toHaveLength(0);

    workletNode.port.emit({
      type: 'RING_BUFFER_STATUS',
      sequence: 1,
      sampleRateHz: 48_000,
      capturedFrame: 0,
      droppedSamples: 0,
      state,
    });
    expect(messages[0]).toMatchObject({
      type: 'RING_BUFFER_STATUS',
      droppedSamples: 0,
      state: { availableSamples: 0, capacitySamples: 16 },
    });
  });
});
