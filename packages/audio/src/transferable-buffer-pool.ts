export interface TransferableFloat32BufferLease {
  readonly id: number;
  readonly view: Float32Array;
}

export interface TransferableFloat32BufferPoolOptions {
  readonly sampleLength: number;
  readonly initialBufferCount?: number;
  readonly maxBufferCount?: number;
}

export interface TransferableFloat32BufferPoolState {
  readonly sampleLength: number;
  readonly allocatedBuffers: number;
  readonly availableBuffers: number;
  readonly inFlightBuffers: number;
  readonly maxBufferCount: number;
}

export class TransferableFloat32BufferPool {
  private readonly sampleLength: number;
  private readonly maxBufferCount: number;
  private readonly available: TransferableFloat32BufferLease[] = [];
  private readonly inFlight = new Set<number>();
  private nextId = 1;
  private allocatedBuffers = 0;

  constructor(options: TransferableFloat32BufferPoolOptions) {
    this.sampleLength = assertPositiveInteger(options.sampleLength, 'sampleLength');
    const initialBufferCount = assertNonNegativeInteger(
      options.initialBufferCount ?? 4,
      'initialBufferCount',
    );
    this.maxBufferCount = assertPositiveInteger(
      options.maxBufferCount ?? Math.max(initialBufferCount, 16),
      'maxBufferCount',
    );

    if (initialBufferCount > this.maxBufferCount) {
      throw new Error('initialBufferCount must be less than or equal to maxBufferCount.');
    }

    for (let index = 0; index < initialBufferCount; index += 1) {
      this.available.push(this.allocateLease());
    }
  }

  get state(): TransferableFloat32BufferPoolState {
    return {
      sampleLength: this.sampleLength,
      allocatedBuffers: this.allocatedBuffers,
      availableBuffers: this.available.length,
      inFlightBuffers: this.inFlight.size,
      maxBufferCount: this.maxBufferCount,
    };
  }

  acquire(): TransferableFloat32BufferLease {
    const lease = this.available.pop() ?? this.allocateLease();
    this.inFlight.add(lease.id);
    return lease;
  }

  release(id: number, buffer: ArrayBuffer): boolean {
    if (!this.inFlight.has(id)) {
      return false;
    }

    if (buffer.byteLength !== this.sampleLength * Float32Array.BYTES_PER_ELEMENT) {
      return false;
    }

    this.inFlight.delete(id);
    this.available.push({ id, view: new Float32Array(buffer) });
    return true;
  }

  private allocateLease(): TransferableFloat32BufferLease {
    if (this.allocatedBuffers >= this.maxBufferCount) {
      throw new Error('Transferable Float32 buffer pool is exhausted.');
    }

    const lease = { id: this.nextId, view: new Float32Array(this.sampleLength) };
    this.nextId += 1;
    this.allocatedBuffers += 1;
    return lease;
  }
}

export function createTransferableFloat32BufferPool(
  options: TransferableFloat32BufferPoolOptions,
): TransferableFloat32BufferPool {
  return new TransferableFloat32BufferPool(options);
}

function assertPositiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function assertNonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return value;
}
