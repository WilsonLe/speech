export type AdaptationType = 'speaker-embedding' | 'residual-adapter' | 'merged-model';

export interface ModelIdentity {
  readonly id: string;
  readonly version: string;
  readonly manifestSha256: string;
  readonly graphContractSha256: string;
}

export interface ProfileFileRef {
  readonly path: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly mediaType: string;
}

export interface EvaluationMetrics {
  readonly wer?: number;
  readonly cer?: number;
  readonly customTermRecall?: number;
  readonly falseInsertionsPer100Utterances?: number;
  readonly realTimeFactor?: number;
}

export interface SpeechProfileManifestV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly displayName: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly baseModel: ModelIdentity;
  readonly languages: readonly ('vi' | 'en')[];
  readonly enrollment: {
    readonly acceptedUtterances: number;
    readonly acceptedSeconds: number;
    readonly languageCounts: Record<string, number>;
    readonly voiceConditionCounts: Record<string, number>;
    readonly sentenceBankVersion: string;
  };
  readonly vocabularyRevision?: number;
  readonly adaptation: {
    readonly type: AdaptationType;
    readonly contractVersion: number;
    readonly files: Record<string, ProfileFileRef>;
  };
  readonly evaluation: {
    readonly baseMetrics: EvaluationMetrics;
    readonly adaptedMetrics: EvaluationMetrics;
    readonly activationGatePassed: boolean;
    readonly warnings: readonly string[];
  };
  readonly privacy: {
    readonly containsRawAudio: boolean;
    readonly exportEncrypted: boolean;
  };
}
