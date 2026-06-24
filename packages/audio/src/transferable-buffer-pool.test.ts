import { describe, expect, it } from 'vitest';
import { createSharedPcmRingBuffer, readPcmRingBuffer, writePcmRingBuffer } from './ring-buffer';
import { createTransferableFloat32BufferPool } from './transferable-buffer-pool';

describe('transferable Float32 buffer pool', () => {
  it('reuses returned buffers by id', () => {
    const pool = createTransferableFloat32BufferPool({
      sampleLength: 4,
      initialBufferCount: 1,
      maxBufferCount: 2,
    });

    const first = pool.acquire();
    first.view.set([1, 2, 3, 4]);
    expect(pool.state).toMatchObject({
      allocatedBuffers: 1,
      availableBuffers: 0,
      inFlightBuffers: 1,
    });

    const returned = asArrayBuffer(first.view.buffer);
    expect(pool.release(first.id, returned)).toBe(true);
    expect(pool.state).toMatchObject({
      allocatedBuffers: 1,
      availableBuffers: 1,
      inFlightBuffers: 0,
    });

    const second = pool.acquire();
    expect(second.id).toBe(first.id);
    expect(second.view.buffer).toBe(returned);
  });

  it('rejects unknown or wrong-sized returned buffers', () => {
    const pool = createTransferableFloat32BufferPool({ sampleLength: 4, initialBufferCount: 1 });
    const lease = pool.acquire();

    expect(pool.release(lease.id + 1, asArrayBuffer(lease.view.buffer))).toBe(false);
    expect(pool.release(lease.id, new ArrayBuffer(2))).toBe(false);
    expect(pool.state.inFlightBuffers).toBe(1);
    expect(pool.state.availableBuffers).toBe(0);
    expect(pool.release(lease.id, asArrayBuffer(lease.view.buffer))).toBe(true);
  });

  it('limits allocations when returned buffers are missing', () => {
    const pool = createTransferableFloat32BufferPool({
      sampleLength: 2,
      initialBufferCount: 0,
      maxBufferCount: 2,
    });

    pool.acquire();
    pool.acquire();

    expect(() => pool.acquire()).toThrow(/exhausted/i);
    expect(pool.state).toMatchObject({
      allocatedBuffers: 2,
      availableBuffers: 0,
      inFlightBuffers: 2,
    });
  });

  it('can carry the same sample sequence as the shared ring buffer path', () => {
    const samples = new Float32Array([0.1, -0.2, 0.3, -0.4]);
    const ringBuffer = createSharedPcmRingBuffer({
      sourceSampleRateHz: 16_000,
      capacitySamples: 8,
    });
    const pool = createTransferableFloat32BufferPool({ sampleLength: 8, initialBufferCount: 1 });

    writePcmRingBuffer(ringBuffer, samples);
    const ringOutput = new Float32Array(4);
    readPcmRingBuffer(ringBuffer, ringOutput);

    const lease = pool.acquire();
    lease.view.set(samples, 0);
    const transferableOutput = lease.view.subarray(0, samples.length);

    expect(Array.from(transferableOutput)).toEqual(Array.from(ringOutput));
  });
});

function asArrayBuffer(buffer: ArrayBufferLike): ArrayBuffer {
  if (!(buffer instanceof ArrayBuffer)) {
    throw new Error('Expected ArrayBuffer-backed test fixture.');
  }
  return buffer;
}
