import type { EnrollmentQualityReportV1 } from '@speech/enrollment';
import enrollmentQualityWorkerUrl from './enrollment-quality.worker.ts?worker&url';
import type {
  AnalyzeEnrollmentTakeRequest,
  EnrollmentQualityWorkerMessage,
  EnrollmentQualityWorkerResponse,
} from './enrollment-quality.worker';

export interface AnalyzeEnrollmentTakeInWorkerOptions extends AnalyzeEnrollmentTakeRequest {
  readonly timeoutMs?: number;
}

export function createEnrollmentQualityWorker(): Worker {
  return new Worker(enrollmentQualityWorkerUrl, {
    type: 'module',
    name: 'speech-enrollment-quality-worker',
  });
}

export function analyzeEnrollmentTakeInWorker(
  options: AnalyzeEnrollmentTakeInWorkerOptions,
): Promise<EnrollmentQualityReportV1> {
  const worker = createEnrollmentQualityWorker();
  const timeoutMs = options.timeoutMs ?? 5_000;
  const requestId = `enrollment-quality-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return new Promise((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => {
      cleanup();
      reject(new Error('Timed out while analyzing enrollment take quality.'));
    }, timeoutMs);

    function cleanup() {
      globalThis.clearTimeout(timeout);
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
      worker.terminate();
    }

    function handleMessage(event: MessageEvent<EnrollmentQualityWorkerResponse>) {
      const message = event.data;
      if (message.requestId !== requestId) {
        return;
      }
      if (message.type === 'ENROLLMENT_QUALITY_COMPLETE') {
        cleanup();
        resolve(message.report);
        return;
      }
      if (message.type === 'ENROLLMENT_QUALITY_ERROR') {
        cleanup();
        reject(new Error(message.message));
      }
    }

    function handleError(event: ErrorEvent) {
      cleanup();
      reject(event.error instanceof Error ? event.error : new Error(event.message));
    }

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);
    const message = buildAnalyzeMessage(requestId, options);
    worker.postMessage(message, [message.pcm]);
  });
}

function buildAnalyzeMessage(
  requestId: string,
  options: AnalyzeEnrollmentTakeInWorkerOptions,
): EnrollmentQualityWorkerMessage {
  return {
    type: 'ANALYZE_ENROLLMENT_TAKE',
    requestId,
    pcm: options.pcm,
    sampleRateHz: options.sampleRateHz,
    referenceText: options.referenceText,
    language: options.language,
    voiceCondition: options.voiceCondition,
    ...(options.calibration === undefined ? {} : { calibration: options.calibration }),
    ...(options.alignment === undefined ? {} : { alignment: options.alignment }),
  };
}
