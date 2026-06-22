import { describe, expect, it } from 'vitest';
import {
  MicrophoneCaptureController,
  createMicrophoneConstraints,
  getDefaultMicrophoneProcessingOptions,
} from './microphone';

class FakeTrack {
  readonly label = 'Fake microphone';
  readyState: MediaStreamTrackState = 'live';
  stopped = false;

  getSettings(): MediaTrackSettings {
    return {
      deviceId: 'device-1',
      channelCount: 1,
      sampleRate: 48000,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    };
  }

  stop() {
    this.stopped = true;
    this.readyState = 'ended';
  }
}

class FakeStream {
  constructor(private readonly track: FakeTrack) {}

  getAudioTracks(): MediaStreamTrack[] {
    return [this.track as unknown as MediaStreamTrack];
  }

  getTracks(): MediaStreamTrack[] {
    return [this.track as unknown as MediaStreamTrack];
  }
}

describe('microphone capture controller', () => {
  it('creates mono microphone constraints with processing toggles', () => {
    const constraints = createMicrophoneConstraints({
      deviceId: 'abc',
      processing: { echoCancellation: false, noiseSuppression: true, autoGainControl: false },
    });

    expect(constraints).toEqual({
      audio: {
        channelCount: { ideal: 1 },
        sampleRate: { ideal: 48_000 },
        deviceId: { exact: 'abc' },
        echoCancellation: false,
        noiseSuppression: true,
        autoGainControl: false,
      },
      video: false,
    });
  });

  it('starts after an explicit call, exposes actual settings, and stops resources', async () => {
    const track = new FakeTrack();
    const stream = new FakeStream(track);
    const requested: MediaStreamConstraints[] = [];
    let disconnected = false;
    let closed = false;
    const fakeDestination = {
      connect: () => fakeDestination,
      disconnect: () => undefined,
    };
    const fakeSource = {
      connect: () => fakeSource,
      disconnect: () => (disconnected = true),
    };

    const controller = new MicrophoneCaptureController({
      now: () => '2026-06-22T00:00:00.000Z',
      mediaDevices: {
        getUserMedia: async (constraints) => {
          requested.push(constraints);
          return stream as unknown as MediaStream;
        },
      },
      createAudioContext: () => ({
        sampleRate: 48000,
        state: 'running',
        destination: fakeDestination,
        createMediaStreamSource: () => fakeSource,
        resume: async () => undefined,
        close: async () => {
          closed = true;
        },
      }),
    });

    expect(controller.active).toBe(false);

    const session = await controller.start({ processing: getDefaultMicrophoneProcessingOptions() });

    expect(controller.active).toBe(true);
    expect(requested).toHaveLength(1);
    expect(session.actualSettings).toMatchObject({ channelCount: 1, sampleRate: 48000 });
    expect(session.audioContextSampleRateHz).toBe(48000);
    expect(session.trackLabel).toBe('Fake microphone');
    expect(controller.snapshot?.trackLabel).toBe('Fake microphone');

    await controller.stop();
    await controller.stop();

    expect(controller.active).toBe(false);
    expect(disconnected).toBe(true);
    expect(track.stopped).toBe(true);
    expect(closed).toBe(true);
  });
});
