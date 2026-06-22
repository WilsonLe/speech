/// <reference lib="webworker" />

interface BenchmarkPing {
  readonly type: 'PING';
  readonly id: number;
  readonly sentAtMs: number;
}

interface BenchmarkPong {
  readonly type: 'PONG';
  readonly id: number;
  readonly sentAtMs: number;
  readonly workerReceivedAtMs: number;
}

const ctx = self as DedicatedWorkerGlobalScope;

ctx.addEventListener('message', (event: MessageEvent<BenchmarkPing>) => {
  if (event.data.type !== 'PING') {
    return;
  }

  const response: BenchmarkPong = {
    type: 'PONG',
    id: event.data.id,
    sentAtMs: event.data.sentAtMs,
    workerReceivedAtMs: performance.now(),
  };

  ctx.postMessage(response);
});

export {};
