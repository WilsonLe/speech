export const PCM_RING_CONTROL_LENGTH = 8;

export const PCM_RING_CONTROL = {
  writeSequence: 0,
  readSequence: 1,
  capacitySamples: 2,
  channelCount: 3,
  sourceSampleRateHz: 4,
  overrunCount: 5,
  stateFlags: 6,
  notificationSequence: 7,
} as const;

export const PCM_RING_STATE = {
  running: 1 << 0,
  closed: 1 << 1,
} as const;

export interface CreateSharedPcmRingBufferOptions {
  readonly sourceSampleRateHz: number;
  readonly channelCount?: number;
  readonly capacitySamples?: number;
  readonly capacitySeconds?: number;
}

export interface SharedPcmRingBufferTransfer {
  readonly controlBuffer: SharedArrayBuffer;
  readonly sampleBuffer: SharedArrayBuffer;
}

export interface SharedPcmRingBuffer {
  readonly control: Int32Array;
  readonly samples: Float32Array;
}

export interface PcmRingBufferState {
  readonly writeSequence: number;
  readonly readSequence: number;
  readonly availableSamples: number;
  readonly freeSamples: number;
  readonly capacitySamples: number;
  readonly channelCount: number;
  readonly sourceSampleRateHz: number;
  readonly overrunCount: number;
  readonly stateFlags: number;
  readonly notificationSequence: number;
}

export interface PcmRingBufferWriteResult {
  readonly writtenSamples: number;
  readonly droppedSamples: number;
  readonly writeSequence: number;
  readonly readSequence: number;
  readonly overrunCount: number;
}

export interface PcmRingBufferReadResult {
  readonly readSamples: number;
  readonly writeSequence: number;
  readonly readSequence: number;
  readonly remainingSamples: number;
}

const defaultCapacitySeconds = 4;

export function createSharedPcmRingBuffer(
  options: CreateSharedPcmRingBufferOptions,
): SharedPcmRingBuffer {
  assertSharedArrayBufferAvailable();
  const sourceSampleRateHz = assertPositiveInteger(
    options.sourceSampleRateHz,
    'sourceSampleRateHz',
  );
  const channelCount = assertPositiveInteger(options.channelCount ?? 1, 'channelCount');
  const capacitySamples = assertPositiveInteger(
    options.capacitySamples ??
      Math.ceil(sourceSampleRateHz * (options.capacitySeconds ?? defaultCapacitySeconds)),
    'capacitySamples',
  );

  const controlBuffer = new SharedArrayBuffer(
    Int32Array.BYTES_PER_ELEMENT * PCM_RING_CONTROL_LENGTH,
  );
  const sampleBuffer = new SharedArrayBuffer(Float32Array.BYTES_PER_ELEMENT * capacitySamples);
  const ringBuffer = createSharedPcmRingBufferViews({ controlBuffer, sampleBuffer });

  Atomics.store(ringBuffer.control, PCM_RING_CONTROL.capacitySamples, capacitySamples);
  Atomics.store(ringBuffer.control, PCM_RING_CONTROL.channelCount, channelCount);
  Atomics.store(ringBuffer.control, PCM_RING_CONTROL.sourceSampleRateHz, sourceSampleRateHz);
  Atomics.store(ringBuffer.control, PCM_RING_CONTROL.stateFlags, PCM_RING_STATE.running);
  return ringBuffer;
}

export function createSharedPcmRingBufferViews(
  transfer: SharedPcmRingBufferTransfer,
): SharedPcmRingBuffer {
  const control = new Int32Array(transfer.controlBuffer);
  const samples = new Float32Array(transfer.sampleBuffer);

  if (control.length < PCM_RING_CONTROL_LENGTH) {
    throw new Error('PCM ring control block is too small.');
  }

  return { control, samples };
}

export function getSharedPcmRingBufferTransfer(
  ringBuffer: SharedPcmRingBuffer,
): SharedPcmRingBufferTransfer {
  const controlBuffer = ringBuffer.control.buffer;
  const sampleBuffer = ringBuffer.samples.buffer;
  if (
    !(controlBuffer instanceof SharedArrayBuffer) ||
    !(sampleBuffer instanceof SharedArrayBuffer)
  ) {
    throw new Error('PCM ring buffer views must be backed by SharedArrayBuffer instances.');
  }

  return { controlBuffer, sampleBuffer };
}

export function resetPcmRingBuffer(ringBuffer: SharedPcmRingBuffer): void {
  Atomics.store(ringBuffer.control, PCM_RING_CONTROL.writeSequence, 0);
  Atomics.store(ringBuffer.control, PCM_RING_CONTROL.readSequence, 0);
  Atomics.store(ringBuffer.control, PCM_RING_CONTROL.overrunCount, 0);
  Atomics.store(ringBuffer.control, PCM_RING_CONTROL.notificationSequence, 0);
  Atomics.store(ringBuffer.control, PCM_RING_CONTROL.stateFlags, PCM_RING_STATE.running);
  ringBuffer.samples.fill(0);
}

export function getPcmRingBufferState(ringBuffer: SharedPcmRingBuffer): PcmRingBufferState {
  const capacitySamples = getCapacitySamples(ringBuffer);
  const writeSequence = Atomics.load(ringBuffer.control, PCM_RING_CONTROL.writeSequence);
  const readSequence = Atomics.load(ringBuffer.control, PCM_RING_CONTROL.readSequence);
  const availableSamples = clampAvailableSamples(writeSequence - readSequence, capacitySamples);

  return {
    writeSequence,
    readSequence,
    availableSamples,
    freeSamples: capacitySamples - availableSamples,
    capacitySamples,
    channelCount: Atomics.load(ringBuffer.control, PCM_RING_CONTROL.channelCount),
    sourceSampleRateHz: Atomics.load(ringBuffer.control, PCM_RING_CONTROL.sourceSampleRateHz),
    overrunCount: Atomics.load(ringBuffer.control, PCM_RING_CONTROL.overrunCount),
    stateFlags: Atomics.load(ringBuffer.control, PCM_RING_CONTROL.stateFlags),
    notificationSequence: Atomics.load(ringBuffer.control, PCM_RING_CONTROL.notificationSequence),
  };
}

export function writePcmRingBuffer(
  ringBuffer: SharedPcmRingBuffer,
  samples: Float32Array,
  sampleCount = samples.length,
): PcmRingBufferWriteResult {
  const capacitySamples = getCapacitySamples(ringBuffer);
  const boundedSampleCount = Math.min(Math.max(0, sampleCount), samples.length);
  if (boundedSampleCount === 0) {
    const state = getPcmRingBufferState(ringBuffer);
    return {
      writtenSamples: 0,
      droppedSamples: 0,
      writeSequence: state.writeSequence,
      readSequence: state.readSequence,
      overrunCount: state.overrunCount,
    };
  }

  let writeSequence = Atomics.load(ringBuffer.control, PCM_RING_CONTROL.writeSequence);
  let readSequence = Atomics.load(ringBuffer.control, PCM_RING_CONTROL.readSequence);
  let availableSamples = writeSequence - readSequence;

  if (availableSamples > capacitySamples) {
    readSequence = writeSequence - capacitySamples;
    Atomics.store(ringBuffer.control, PCM_RING_CONTROL.readSequence, readSequence);
    availableSamples = capacitySamples;
  }

  const samplesToWrite = Math.min(boundedSampleCount, capacitySamples);
  const skippedInputSamples = boundedSampleCount - samplesToWrite;
  const freeSamples = capacitySamples - availableSamples;
  const unreadSamplesToDrop = Math.max(0, samplesToWrite - freeSamples);
  const droppedSamples = skippedInputSamples + unreadSamplesToDrop;

  if (unreadSamplesToDrop > 0) {
    readSequence += unreadSamplesToDrop;
    Atomics.store(ringBuffer.control, PCM_RING_CONTROL.readSequence, readSequence);
  }

  if (droppedSamples > 0) {
    Atomics.add(ringBuffer.control, PCM_RING_CONTROL.overrunCount, 1);
  }

  const sourceOffset = boundedSampleCount - samplesToWrite;
  copyIntoRing(
    ringBuffer.samples,
    capacitySamples,
    writeSequence,
    samples,
    sourceOffset,
    samplesToWrite,
  );
  writeSequence += samplesToWrite;
  Atomics.store(ringBuffer.control, PCM_RING_CONTROL.writeSequence, writeSequence);
  Atomics.add(ringBuffer.control, PCM_RING_CONTROL.notificationSequence, 1);
  Atomics.notify(ringBuffer.control, PCM_RING_CONTROL.notificationSequence, 1);

  return {
    writtenSamples: samplesToWrite,
    droppedSamples,
    writeSequence,
    readSequence,
    overrunCount: Atomics.load(ringBuffer.control, PCM_RING_CONTROL.overrunCount),
  };
}

export function readPcmRingBuffer(
  ringBuffer: SharedPcmRingBuffer,
  output: Float32Array,
  maxSamples = output.length,
): PcmRingBufferReadResult {
  const capacitySamples = getCapacitySamples(ringBuffer);
  const writeSequence = Atomics.load(ringBuffer.control, PCM_RING_CONTROL.writeSequence);
  let readSequence = Atomics.load(ringBuffer.control, PCM_RING_CONTROL.readSequence);
  const availableSamples = clampAvailableSamples(writeSequence - readSequence, capacitySamples);
  const samplesToRead = Math.min(output.length, Math.max(0, maxSamples), availableSamples);

  if (samplesToRead === 0) {
    return {
      readSamples: 0,
      writeSequence,
      readSequence,
      remainingSamples: availableSamples,
    };
  }

  copyFromRing(ringBuffer.samples, capacitySamples, readSequence, output, samplesToRead);
  readSequence += samplesToRead;
  Atomics.store(ringBuffer.control, PCM_RING_CONTROL.readSequence, readSequence);

  return {
    readSamples: samplesToRead,
    writeSequence,
    readSequence,
    remainingSamples: availableSamples - samplesToRead,
  };
}

export function closePcmRingBuffer(ringBuffer: SharedPcmRingBuffer): void {
  Atomics.store(ringBuffer.control, PCM_RING_CONTROL.stateFlags, PCM_RING_STATE.closed);
  Atomics.add(ringBuffer.control, PCM_RING_CONTROL.notificationSequence, 1);
  Atomics.notify(ringBuffer.control, PCM_RING_CONTROL.notificationSequence, 1);
}

function copyIntoRing(
  ringSamples: Float32Array,
  capacitySamples: number,
  writeSequence: number,
  source: Float32Array,
  sourceOffset: number,
  sampleCount: number,
): void {
  const startIndex = modulo(writeSequence, capacitySamples);
  const firstSpan = Math.min(sampleCount, capacitySamples - startIndex);
  ringSamples.set(source.subarray(sourceOffset, sourceOffset + firstSpan), startIndex);
  const remaining = sampleCount - firstSpan;
  if (remaining > 0) {
    ringSamples.set(
      source.subarray(sourceOffset + firstSpan, sourceOffset + firstSpan + remaining),
      0,
    );
  }
}

function copyFromRing(
  ringSamples: Float32Array,
  capacitySamples: number,
  readSequence: number,
  output: Float32Array,
  sampleCount: number,
): void {
  const startIndex = modulo(readSequence, capacitySamples);
  const firstSpan = Math.min(sampleCount, capacitySamples - startIndex);
  output.set(ringSamples.subarray(startIndex, startIndex + firstSpan), 0);
  const remaining = sampleCount - firstSpan;
  if (remaining > 0) {
    output.set(ringSamples.subarray(0, remaining), firstSpan);
  }
}

function getCapacitySamples(ringBuffer: SharedPcmRingBuffer): number {
  const capacitySamples = Atomics.load(ringBuffer.control, PCM_RING_CONTROL.capacitySamples);
  if (capacitySamples <= 0 || capacitySamples > ringBuffer.samples.length) {
    throw new Error('PCM ring buffer capacity is invalid.');
  }
  return capacitySamples;
}

function clampAvailableSamples(availableSamples: number, capacitySamples: number): number {
  return Math.max(0, Math.min(availableSamples, capacitySamples));
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function assertSharedArrayBufferAvailable(): void {
  if (typeof SharedArrayBuffer === 'undefined') {
    throw new Error('SharedArrayBuffer is unavailable in this browser context.');
  }
}

function assertPositiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}
