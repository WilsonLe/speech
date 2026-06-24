/// <reference lib="webworker" />

import {
  analyzeEnrollmentTakeQuality,
  type EnrollmentCalibrationBaseline,
  type EnrollmentQualityReportV1,
  type EnrollmentSentenceLanguage,
  type EnrollmentTakeAlignmentInput,
  type EnrollmentVoiceCondition,
} from '@speech/enrollment';

export interface AnalyzeEnrollmentTakeRequest {
  readonly pcm: ArrayBuffer;
  readonly sampleRateHz: number;
  readonly referenceText: string;
  readonly language: EnrollmentSentenceLanguage;
  readonly voiceCondition: EnrollmentVoiceCondition;
  readonly calibration?: EnrollmentCalibrationBaseline;
  readonly alignment?: EnrollmentTakeAlignmentInput;
}

export interface AnalyzeEnrollmentTakeMessage extends AnalyzeEnrollmentTakeRequest {
  readonly type: 'ANALYZE_ENROLLMENT_TAKE';
  readonly requestId: string;
}

export interface EnrollmentQualityCompleteMessage {
  readonly type: 'ENROLLMENT_QUALITY_COMPLETE';
  readonly requestId: string;
  readonly report: EnrollmentQualityReportV1;
}

export interface EnrollmentQualityErrorMessage {
  readonly type: 'ENROLLMENT_QUALITY_ERROR';
  readonly requestId: string;
  readonly message: string;
}

export type EnrollmentQualityWorkerMessage = AnalyzeEnrollmentTakeMessage;
export type EnrollmentQualityWorkerResponse =
  | EnrollmentQualityCompleteMessage
  | EnrollmentQualityErrorMessage;

const ctx = self as DedicatedWorkerGlobalScope;

ctx.addEventListener('message', (event: MessageEvent<EnrollmentQualityWorkerMessage>) => {
  const message = event.data;
  if (message.type !== 'ANALYZE_ENROLLMENT_TAKE') {
    return;
  }

  try {
    const report = analyzeEnrollmentTakeQuality({
      pcm: new Float32Array(message.pcm),
      sampleRateHz: message.sampleRateHz,
      referenceText: message.referenceText,
      language: message.language,
      voiceCondition: message.voiceCondition,
      ...(message.calibration === undefined ? {} : { calibration: message.calibration }),
      ...(message.alignment === undefined ? {} : { alignment: message.alignment }),
    });
    ctx.postMessage({
      type: 'ENROLLMENT_QUALITY_COMPLETE',
      requestId: message.requestId,
      report,
    } satisfies EnrollmentQualityCompleteMessage);
  } catch (error) {
    ctx.postMessage({
      type: 'ENROLLMENT_QUALITY_ERROR',
      requestId: message.requestId,
      message: error instanceof Error ? error.message : String(error),
    } satisfies EnrollmentQualityErrorMessage);
  }
});

export {};
