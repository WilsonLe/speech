import { describe, expect, it } from 'vitest';
import {
  PCM_RING_CONTROL,
  PCM_RING_STATE,
  closePcmRingBuffer,
  createSharedPcmRingBuffer,
  getPcmRingBufferState,
  readPcmRingBuffer,
  resetPcmRingBuffer,
  writePcmRingBuffer,
} from './ring-buffer';

describe('SharedArrayBuffer PCM ring buffer', () => {
  it('initializes control fields from capture settings', () => {
    const ringBuffer = createSharedPcmRingBuffer({
      sourceSampleRateHz: 48_000,
      channelCount: 1,
      capacitySamples: 8,
    });

    expect(getPcmRingBufferState(ringBuffer)).toMatchObject({
      writeSequence: 0,
      readSequence: 0,
      availableSamples: 0,
      freeSamples: 8,
      capacitySamples: 8,
      channelCount: 1,
      sourceSampleRateHz: 48_000,
      overrunCount: 0,
      stateFlags: PCM_RING_STATE.running,
    });
  });

  it('preserves sample order across wraparound', () => {
    const ringBuffer = createSharedPcmRingBuffer({
      sourceSampleRateHz: 16_000,
      capacitySamples: 5,
    });
    const firstWrite = writePcmRingBuffer(ringBuffer, new Float32Array([1, 2, 3]));
    const firstRead = new Float32Array(2);
    const firstReadResult = readPcmRingBuffer(ringBuffer, firstRead);
    const secondWrite = writePcmRingBuffer(ringBuffer, new Float32Array([4, 5, 6, 7]));
    const secondRead = new Float32Array(5);
    const secondReadResult = readPcmRingBuffer(ringBuffer, secondRead);

    expect(firstWrite).toMatchObject({ writtenSamples: 3, droppedSamples: 0 });
    expect(Array.from(firstRead)).toEqual([1, 2]);
    expect(firstReadResult).toMatchObject({ readSamples: 2, remainingSamples: 1 });
    expect(secondWrite).toMatchObject({ writtenSamples: 4, droppedSamples: 0 });
    expect(secondReadResult).toMatchObject({ readSamples: 5, remainingSamples: 0 });
    expect(Array.from(secondRead)).toEqual([3, 4, 5, 6, 7]);
  });

  it('drops oldest unread samples and increments overrun count when full', () => {
    const ringBuffer = createSharedPcmRingBuffer({
      sourceSampleRateHz: 16_000,
      capacitySamples: 4,
    });

    writePcmRingBuffer(ringBuffer, new Float32Array([1, 2, 3, 4]));
    const result = writePcmRingBuffer(ringBuffer, new Float32Array([5, 6]));
    const output = new Float32Array(4);
    const readResult = readPcmRingBuffer(ringBuffer, output);

    expect(result).toMatchObject({ writtenSamples: 2, droppedSamples: 2, overrunCount: 1 });
    expect(readResult.readSamples).toBe(4);
    expect(Array.from(output)).toEqual([3, 4, 5, 6]);
    expect(getPcmRingBufferState(ringBuffer).overrunCount).toBe(1);
  });

  it('keeps only the newest samples when one write exceeds capacity', () => {
    const ringBuffer = createSharedPcmRingBuffer({
      sourceSampleRateHz: 16_000,
      capacitySamples: 4,
    });

    const result = writePcmRingBuffer(ringBuffer, new Float32Array([1, 2, 3, 4, 5, 6]));
    const output = new Float32Array(4);
    readPcmRingBuffer(ringBuffer, output);

    expect(result).toMatchObject({ writtenSamples: 4, droppedSamples: 2, overrunCount: 1 });
    expect(Array.from(output)).toEqual([3, 4, 5, 6]);
  });

  it('resets and closes state with notification increments', () => {
    const ringBuffer = createSharedPcmRingBuffer({
      sourceSampleRateHz: 16_000,
      capacitySamples: 4,
    });

    writePcmRingBuffer(ringBuffer, new Float32Array([1, 2, 3, 4, 5]));
    expect(getPcmRingBufferState(ringBuffer).notificationSequence).toBe(1);
    resetPcmRingBuffer(ringBuffer);
    expect(getPcmRingBufferState(ringBuffer)).toMatchObject({
      writeSequence: 0,
      readSequence: 0,
      overrunCount: 0,
      stateFlags: PCM_RING_STATE.running,
    });

    closePcmRingBuffer(ringBuffer);
    expect(Atomics.load(ringBuffer.control, PCM_RING_CONTROL.stateFlags)).toBe(
      PCM_RING_STATE.closed,
    );
    expect(getPcmRingBufferState(ringBuffer).notificationSequence).toBe(1);
  });
});
