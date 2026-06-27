import { findVocabularyDisplayMatches, type VocabularyTokenAutomaton } from '@speech/context-bias';
import {
  renderTranscriptFromTokenIds,
  type TranscriptDisplayReplacement,
  type TranscriptVocabulary,
} from '@speech/formatter';
export * from './dictate-performance-parity';
export * from './personal-model-release-benchmark';
import type { DictatePerformanceParityReportV1 } from './dictate-performance-parity';
import type { PersonalModelReleaseBenchmarkReportV1 } from './personal-model-release-benchmark';

export type BenchmarkMetricName =
  | 'firstPartialLatencyMs'
  | 'stableTokenLatencyMs'
  | 'finalizationLatencyMs'
  | 'encoderChunkMs'
  | 'decoderChunkMs'
  | 'realTimeFactor'
  | 'queueDepthFrames'
  | 'audioOverruns'
  | 'jsHeapUsedBytes'
  | 'modelSessionMemoryBytes'
  | 'customTermRecall'
  | 'customTermFalseInsertionRate';

export type BenchmarkMetricUnit = 'ms' | 'ratio' | 'frames' | 'count' | 'bytes';

export interface BenchmarkMetricSample {
  readonly name: BenchmarkMetricName;
  readonly unit: BenchmarkMetricUnit;
  readonly value: number;
}

export interface BenchmarkSummaryStats {
  readonly count: number;
  readonly min: number;
  readonly max: number;
  readonly mean: number;
  readonly median: number;
  readonly p95: number;
}

export interface BenchmarkMetricSummary extends BenchmarkSummaryStats {
  readonly name: BenchmarkMetricName;
  readonly unit: BenchmarkMetricUnit;
}

export interface BenchmarkTraceEvent {
  readonly chunkIndex: number;
  readonly audioStartMs: number;
  readonly audioDurationMs: number;
  readonly queueDepthFrames: number;
  readonly encoderMs: number;
  readonly decoderMs: number;
  readonly workerElapsedMs: number;
}

export interface BenchmarkEnvironment {
  readonly userAgent?: string;
  readonly platform?: string;
  readonly browserLanguage?: string;
  readonly hardwareConcurrency?: number;
  readonly deviceMemoryGb?: number;
  readonly provider?: 'webgpu' | 'wasm' | 'none' | 'unknown';
  readonly wasmThreads?: number;
  readonly modelId?: string;
  readonly modelVersion?: string;
}

export interface BenchmarkConfiguration {
  readonly scenario: 'synthetic-worker' | 'audio-fixture' | 'model-runtime';
  readonly repetitions: number;
  readonly chunkCount: number;
  readonly chunkDurationMs: number;
  readonly syntheticAudioMs: number;
  readonly notes: readonly string[];
}

export interface BenchmarkPrivacyStatement {
  readonly containsAudio: false;
  readonly containsTranscript: false;
  readonly networkUpload: false;
}

export interface BenchmarkReportV1 {
  readonly schemaVersion: 1;
  readonly reportType: 'speech-benchmark';
  readonly generatedAt: string;
  readonly benchmarkId: string;
  readonly configuration: BenchmarkConfiguration;
  readonly environment: BenchmarkEnvironment;
  readonly privacy: BenchmarkPrivacyStatement;
  readonly summaries: readonly BenchmarkMetricSummary[];
  readonly traces: readonly BenchmarkTraceEvent[];
  readonly customTermEvaluation?: CustomTermBenchmarkReportV1;
  readonly warnings: readonly string[];
}

export interface CustomTermBenchmarkScore {
  readonly numerator: number;
  readonly denominator: number;
  readonly rate: number | null;
}

export interface CustomTermBenchmarkCase {
  readonly id: string;
  readonly referenceTokenIds: readonly number[];
  readonly hypothesisTokenIds: readonly number[];
}

export interface CustomTermBenchmarkCaseResult {
  readonly id: string;
  readonly expectedCustomTermCount: number;
  readonly recalledCustomTermCount: number;
  readonly emittedCustomTermCount: number;
  readonly falseInsertionCount: number;
  readonly displayReplacementCount: number;
}

export interface CustomTermBenchmarkDefinitions {
  readonly recall: string;
  readonly falseInsertion: string;
}

export interface CustomTermBenchmarkReportV1 {
  readonly schemaVersion: 1;
  readonly reportType: 'custom-term-benchmark';
  readonly suiteId: string;
  readonly synthetic: true;
  readonly caseCount: number;
  readonly activeCustomTermCount: number;
  readonly recall: CustomTermBenchmarkScore;
  readonly falseInsertion: CustomTermBenchmarkScore;
  readonly displayReplacementCount: number;
  readonly definitions: CustomTermBenchmarkDefinitions;
  readonly cases: readonly CustomTermBenchmarkCaseResult[];
  readonly notes: readonly string[];
}

export interface CreateCustomTermBenchmarkEvaluationOptions {
  readonly suiteId: string;
  readonly automaton: VocabularyTokenAutomaton;
  readonly transcriptVocabulary: TranscriptVocabulary;
  readonly cases: readonly CustomTermBenchmarkCase[];
  readonly notes?: readonly string[];
}

export interface CreateBenchmarkReportOptions {
  readonly generatedAt: string;
  readonly benchmarkId: string;
  readonly configuration: BenchmarkConfiguration;
  readonly environment?: BenchmarkEnvironment;
  readonly traces: readonly BenchmarkTraceEvent[];
  readonly customTermEvaluation?: CustomTermBenchmarkReportV1;
  readonly metricSamples?: readonly BenchmarkMetricSample[];
  readonly warnings?: readonly string[];
}

export interface DiagnosticsExportV1 {
  readonly schemaVersion: 1;
  readonly reportType: 'speech-diagnostics-export';
  readonly generatedAt: string;
  readonly privacy: BenchmarkPrivacyStatement;
  readonly benchmark?: BenchmarkReportV1;
  readonly personalModelReleaseBenchmark?: PersonalModelReleaseBenchmarkReportV1;
  readonly dictatePerformanceParity?: DictatePerformanceParityReportV1;
  readonly capabilities?: unknown;
  readonly notes: readonly string[];
}

export interface CreateDiagnosticsExportOptions {
  readonly generatedAt: string;
  readonly benchmark?: BenchmarkReportV1;
  readonly personalModelReleaseBenchmark?: PersonalModelReleaseBenchmarkReportV1;
  readonly dictatePerformanceParity?: DictatePerformanceParityReportV1;
  readonly capabilities?: unknown;
  readonly notes?: readonly string[];
}

export interface BenchmarkPackageInfo {
  readonly name: '@speech/benchmark';
  readonly status: 'planned' | 'active';
  readonly description: string;
}

export const packageInfo: BenchmarkPackageInfo = {
  name: '@speech/benchmark',
  status: 'active',
  description:
    'Latency, RTF, queue, memory, storage, custom-term, Dictate UI parity, personal-model release gates, and benchmark export contracts.',
};

export const benchmarkPrivacyStatement: BenchmarkPrivacyStatement = {
  containsAudio: false,
  containsTranscript: false,
  networkUpload: false,
};

export function summarizeSamples(values: readonly number[]): BenchmarkSummaryStats {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  if (finiteValues.length === 0) {
    throw new Error('Cannot summarize an empty benchmark sample set.');
  }

  const sorted = [...finiteValues].sort((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  if (first === undefined || last === undefined) {
    throw new Error('Cannot summarize an empty benchmark sample set.');
  }

  return {
    count: sorted.length,
    min: first,
    max: last,
    mean: total / sorted.length,
    median: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
  };
}

export function createBenchmarkReport(options: CreateBenchmarkReportOptions): BenchmarkReportV1 {
  const metricSamples = [
    ...metricSamplesFromTraces(options.traces),
    ...(options.customTermEvaluation === undefined
      ? []
      : metricSamplesFromCustomTermEvaluation(options.customTermEvaluation)),
    ...(options.metricSamples ?? []),
  ];
  const summaries = summarizeMetricSamples(metricSamples);

  return {
    schemaVersion: 1,
    reportType: 'speech-benchmark',
    generatedAt: options.generatedAt,
    benchmarkId: options.benchmarkId,
    configuration: options.configuration,
    environment: options.environment ?? {},
    privacy: benchmarkPrivacyStatement,
    summaries,
    traces: options.traces.map(copyTraceEvent),
    ...(options.customTermEvaluation === undefined
      ? {}
      : { customTermEvaluation: copyCustomTermBenchmarkReport(options.customTermEvaluation) }),
    warnings: [...(options.warnings ?? [])],
  };
}

export function createDiagnosticsExport(
  options: CreateDiagnosticsExportOptions,
): DiagnosticsExportV1 {
  return {
    schemaVersion: 1,
    reportType: 'speech-diagnostics-export',
    generatedAt: options.generatedAt,
    privacy: benchmarkPrivacyStatement,
    ...(options.benchmark === undefined ? {} : { benchmark: options.benchmark }),
    ...(options.personalModelReleaseBenchmark === undefined
      ? {}
      : { personalModelReleaseBenchmark: options.personalModelReleaseBenchmark }),
    ...(options.dictatePerformanceParity === undefined
      ? {}
      : { dictatePerformanceParity: options.dictatePerformanceParity }),
    ...(options.capabilities === undefined ? {} : { capabilities: options.capabilities }),
    notes: [...(options.notes ?? [])],
  };
}

export function serializeBenchmarkJson(report: BenchmarkReportV1 | DiagnosticsExportV1): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function createBenchmarkId(generatedAt: string, label = 'local'): string {
  const normalizedLabel = label
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const timestamp = generatedAt.replace(/[:.]/g, '-');
  return `speech-${normalizedLabel || 'benchmark'}-${timestamp}`;
}

export function calculateRealTimeFactor(processingMs: number, audioDurationMs: number): number {
  assertNonNegativeFinite(processingMs, 'processingMs');
  assertPositiveFinite(audioDurationMs, 'audioDurationMs');
  return processingMs / audioDurationMs;
}

export function createCustomTermBenchmarkEvaluation(
  options: CreateCustomTermBenchmarkEvaluationOptions,
): CustomTermBenchmarkReportV1 {
  if (options.suiteId.trim().length === 0) {
    throw new Error('suiteId must not be empty.');
  }
  if (options.cases.length === 0) {
    throw new Error('Custom-term benchmark suites require at least one case.');
  }

  const activeCustomTermCount = new Set(
    options.automaton.candidates.map((candidate) => candidate.entryId),
  ).size;
  const cases: CustomTermBenchmarkCaseResult[] = [];
  let expectedCustomTermCount = 0;
  let recalledCustomTermCount = 0;
  let emittedCustomTermCount = 0;
  let falseInsertionCount = 0;
  let displayReplacementCount = 0;

  for (const testCase of options.cases) {
    const result = evaluateCustomTermCase(testCase, options);
    cases.push(result);
    expectedCustomTermCount += result.expectedCustomTermCount;
    recalledCustomTermCount += result.recalledCustomTermCount;
    emittedCustomTermCount += result.emittedCustomTermCount;
    falseInsertionCount += result.falseInsertionCount;
    displayReplacementCount += result.displayReplacementCount;
  }

  return {
    schemaVersion: 1,
    reportType: 'custom-term-benchmark',
    suiteId: options.suiteId,
    synthetic: true,
    caseCount: options.cases.length,
    activeCustomTermCount,
    recall: createScore(recalledCustomTermCount, expectedCustomTermCount),
    falseInsertion: createScore(falseInsertionCount, emittedCustomTermCount),
    displayReplacementCount,
    definitions: {
      recall:
        'Recalled expected custom-term matches divided by expected custom-term matches in synthetic reference token fixtures.',
      falseInsertion:
        'Unexpected custom-term matches divided by emitted custom-term matches in synthetic hypothesis token fixtures.',
    },
    cases,
    notes: [...(options.notes ?? [])],
  };
}

export function createSyntheticCustomTermBenchmarkEvaluation(): CustomTermBenchmarkReportV1 {
  return createCustomTermBenchmarkEvaluation({
    suiteId: 'synthetic-custom-term-v1',
    automaton: syntheticCustomTermAutomaton,
    transcriptVocabulary: syntheticTranscriptVocabulary,
    cases: syntheticCustomTermCases,
    notes: [
      'Synthetic token fixtures only; no microphone audio, transcript text, private vocabulary, or model output is included.',
      'Recall and false insertion are informational until measured against a real model pack and declared benchmark fixture set.',
    ],
  });
}

function evaluateCustomTermCase(
  testCase: CustomTermBenchmarkCase,
  options: CreateCustomTermBenchmarkEvaluationOptions,
): CustomTermBenchmarkCaseResult {
  validateCaseId(testCase.id);
  validateTokenSequence(testCase.referenceTokenIds, `${testCase.id}.referenceTokenIds`);
  validateTokenSequence(testCase.hypothesisTokenIds, `${testCase.id}.hypothesisTokenIds`);

  const expectedMatches = findVocabularyDisplayMatches(
    options.automaton,
    testCase.referenceTokenIds,
  );
  const emittedMatches = findVocabularyDisplayMatches(
    options.automaton,
    testCase.hypothesisTokenIds,
  );
  const expectedCounts = countMatchesByEntryId(expectedMatches);
  const emittedCounts = countMatchesByEntryId(emittedMatches);
  const displayReplacementCount = renderHypothesisWithDisplayReplacements(
    testCase.hypothesisTokenIds,
    emittedMatches,
    options.transcriptVocabulary,
  );

  return {
    id: testCase.id,
    expectedCustomTermCount: expectedMatches.length,
    recalledCustomTermCount: countRecalledMatches(expectedCounts, emittedCounts),
    emittedCustomTermCount: emittedMatches.length,
    falseInsertionCount: countFalseInsertions(expectedCounts, emittedCounts),
    displayReplacementCount,
  };
}

function renderHypothesisWithDisplayReplacements(
  tokenIds: readonly number[],
  matches: ReturnType<typeof findVocabularyDisplayMatches>,
  vocabulary: TranscriptVocabulary,
): number {
  const replacements: TranscriptDisplayReplacement[] = matches.map((match) => ({
    startTokenIndex: match.startTokenIndex,
    endTokenIndex: match.endTokenIndex,
    displayForm: match.displayForm,
    vocabularyEntryId: match.entryId,
  }));
  renderTranscriptFromTokenIds({ tokenIds, vocabulary, displayReplacements: replacements });
  return replacements.length;
}

function countMatchesByEntryId(
  matches: ReturnType<typeof findVocabularyDisplayMatches>,
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const match of matches) {
    counts.set(match.entryId, (counts.get(match.entryId) ?? 0) + 1);
  }
  return counts;
}

function countRecalledMatches(
  expectedCounts: ReadonlyMap<string, number>,
  emittedCounts: ReadonlyMap<string, number>,
): number {
  let count = 0;
  for (const [entryId, expectedCount] of expectedCounts) {
    count += Math.min(expectedCount, emittedCounts.get(entryId) ?? 0);
  }
  return count;
}

function countFalseInsertions(
  expectedCounts: ReadonlyMap<string, number>,
  emittedCounts: ReadonlyMap<string, number>,
): number {
  let count = 0;
  for (const [entryId, emittedCount] of emittedCounts) {
    count += Math.max(0, emittedCount - (expectedCounts.get(entryId) ?? 0));
  }
  return count;
}

function metricSamplesFromCustomTermEvaluation(
  evaluation: CustomTermBenchmarkReportV1,
): readonly BenchmarkMetricSample[] {
  const samples: BenchmarkMetricSample[] = [];
  if (evaluation.recall.rate !== null) {
    samples.push({ name: 'customTermRecall', unit: 'ratio', value: evaluation.recall.rate });
  }
  if (evaluation.falseInsertion.rate !== null) {
    samples.push({
      name: 'customTermFalseInsertionRate',
      unit: 'ratio',
      value: evaluation.falseInsertion.rate,
    });
  }
  return samples;
}

function copyCustomTermBenchmarkReport(
  evaluation: CustomTermBenchmarkReportV1,
): CustomTermBenchmarkReportV1 {
  if (evaluation.schemaVersion !== 1 || evaluation.reportType !== 'custom-term-benchmark') {
    throw new Error('customTermEvaluation must be a custom-term-benchmark schema v1 report.');
  }
  if (!evaluation.synthetic) {
    throw new Error('customTermEvaluation must be marked synthetic for benchmark exports.');
  }
  validateCaseId(evaluation.suiteId);
  assertNonNegativeInteger(evaluation.caseCount, 'customTermEvaluation.caseCount');
  assertNonNegativeInteger(
    evaluation.activeCustomTermCount,
    'customTermEvaluation.activeCustomTermCount',
  );
  assertScore(evaluation.recall, 'customTermEvaluation.recall');
  assertScore(evaluation.falseInsertion, 'customTermEvaluation.falseInsertion');
  assertNonNegativeInteger(
    evaluation.displayReplacementCount,
    'customTermEvaluation.displayReplacementCount',
  );
  return {
    ...evaluation,
    recall: { ...evaluation.recall },
    falseInsertion: { ...evaluation.falseInsertion },
    definitions: { ...evaluation.definitions },
    cases: evaluation.cases.map((testCase) => {
      validateCaseId(testCase.id);
      assertNonNegativeInteger(testCase.expectedCustomTermCount, `${testCase.id}.expected`);
      assertNonNegativeInteger(testCase.recalledCustomTermCount, `${testCase.id}.recalled`);
      assertNonNegativeInteger(testCase.emittedCustomTermCount, `${testCase.id}.emitted`);
      assertNonNegativeInteger(testCase.falseInsertionCount, `${testCase.id}.falseInsertion`);
      assertNonNegativeInteger(
        testCase.displayReplacementCount,
        `${testCase.id}.displayReplacement`,
      );
      return { ...testCase };
    }),
    notes: [...evaluation.notes],
  };
}

function createScore(numerator: number, denominator: number): CustomTermBenchmarkScore {
  assertNonNegativeInteger(numerator, 'numerator');
  assertNonNegativeInteger(denominator, 'denominator');
  if (numerator > denominator) {
    throw new Error('Score numerator cannot exceed denominator.');
  }
  return {
    numerator,
    denominator,
    rate: denominator === 0 ? null : roundMetric(numerator / denominator),
  };
}

function assertScore(score: CustomTermBenchmarkScore, name: string): void {
  assertNonNegativeInteger(score.numerator, `${name}.numerator`);
  assertNonNegativeInteger(score.denominator, `${name}.denominator`);
  if (score.numerator > score.denominator) {
    throw new Error(`${name}.numerator cannot exceed denominator.`);
  }
  if (score.denominator === 0) {
    if (score.rate !== null) {
      throw new Error(`${name}.rate must be null when denominator is zero.`);
    }
    return;
  }
  if (score.rate === null || !Number.isFinite(score.rate) || score.rate < 0 || score.rate > 1) {
    throw new Error(`${name}.rate must be a finite ratio between zero and one.`);
  }
}

function validateCaseId(id: string): void {
  if (id.trim().length === 0) {
    throw new Error('Custom-term benchmark ids must not be empty.');
  }
}

function validateTokenSequence(tokenIds: readonly number[], name: string): void {
  for (const tokenId of tokenIds) {
    assertNonNegativeInteger(tokenId, name);
  }
}

const syntheticTranscriptVocabulary: TranscriptVocabulary = {
  wordBoundaryMarker: '▁',
  tokens: {
    '1': '▁mở',
    '2': '▁nhé',
    '3': '▁xem',
    '4': '▁hôm',
    '5': '▁gọi',
    '6': '▁đi',
    '7': '▁người',
    '8': '▁ghi',
    '9': '▁chú',
    '10': '▁pangea',
    '11': '▁chat',
    '12': '▁dashboard',
    '13': '▁wilson',
    '14': '▁sổ',
    '15': '▁cái',
  },
};

const syntheticCustomTermCandidates: VocabularyTokenAutomaton['candidates'] = [
  {
    id: 'synthetic-term-a:phrase:0',
    entryId: 'synthetic-term-a',
    displayForm: 'Pangea Chat',
    language: 'mixed',
    source: 'phrase',
    text: 'pangea chat',
    tokenIds: [10, 11],
    weight: 5,
    exactCase: true,
  },
  {
    id: 'synthetic-term-a:alias:1',
    entryId: 'synthetic-term-a',
    displayForm: 'Pangea Chat',
    language: 'mixed',
    source: 'alias',
    text: 'dashboard chat',
    tokenIds: [12, 11],
    weight: 5,
    exactCase: true,
  },
  {
    id: 'synthetic-term-b:phrase:0',
    entryId: 'synthetic-term-b',
    displayForm: 'Wilson',
    language: 'en',
    source: 'phrase',
    text: 'wilson',
    tokenIds: [13],
    weight: 5,
    exactCase: true,
  },
  {
    id: 'synthetic-term-c:phrase:0',
    entryId: 'synthetic-term-c',
    displayForm: 'Sổ Cái',
    language: 'vi',
    source: 'phrase',
    text: 'sổ cái',
    tokenIds: [14, 15],
    weight: 5,
    exactCase: true,
  },
];

const syntheticCustomTermAutomaton: VocabularyTokenAutomaton = {
  revision: 1,
  activeSetIds: ['synthetic-custom-term-benchmark'],
  rootNodeId: 0,
  nodes: createTokenTrieNodes(syntheticCustomTermCandidates),
  candidates: syntheticCustomTermCandidates,
  scoring: {
    prefixBonus: 1,
    completionBonus: 3,
    mismatchPenalty: 0.5,
    defaultWeight: 5,
    maxCumulativeBonus: 6,
  },
};

const syntheticCustomTermCases: readonly CustomTermBenchmarkCase[] = [
  {
    id: 'synthetic-hit-phrase',
    referenceTokenIds: [1, 10, 11, 2],
    hypothesisTokenIds: [1, 10, 11, 2],
  },
  {
    id: 'synthetic-hit-alias',
    referenceTokenIds: [3, 12, 11, 4],
    hypothesisTokenIds: [3, 12, 11, 4],
  },
  {
    id: 'synthetic-miss',
    referenceTokenIds: [5, 13, 6],
    hypothesisTokenIds: [5, 7, 6],
  },
  {
    id: 'synthetic-false-insertion',
    referenceTokenIds: [8, 9, 2],
    hypothesisTokenIds: [8, 14, 15, 2],
  },
];

function createTokenTrieNodes(
  candidates: VocabularyTokenAutomaton['candidates'],
): VocabularyTokenAutomaton['nodes'] {
  const nodes: Array<{
    readonly id: number;
    readonly transitions: Map<number, number>;
    readonly terminalCandidateIds: string[];
  }> = [{ id: 0, transitions: new Map(), terminalCandidateIds: [] }];

  for (const candidate of candidates) {
    let nodeId = 0;
    for (const tokenId of candidate.tokenIds) {
      const node = nodes[nodeId];
      if (node === undefined) throw new Error(`Missing synthetic automaton node ${nodeId}.`);
      let nextNodeId = node.transitions.get(tokenId);
      if (nextNodeId === undefined) {
        nextNodeId = nodes.length;
        node.transitions.set(tokenId, nextNodeId);
        nodes.push({ id: nextNodeId, transitions: new Map(), terminalCandidateIds: [] });
      }
      nodeId = nextNodeId;
    }
    const terminalNode = nodes[nodeId];
    if (terminalNode === undefined) throw new Error(`Missing synthetic terminal node ${nodeId}.`);
    terminalNode.terminalCandidateIds.push(candidate.id);
  }

  return nodes.map((node) => ({
    id: node.id,
    transitions: [...node.transitions.entries()]
      .map(([tokenId, nextNodeId]) => ({ tokenId, nextNodeId }))
      .sort((left, right) => left.tokenId - right.tokenId),
    terminalCandidateIds: [...node.terminalCandidateIds].sort(),
  }));
}

function summarizeMetricSamples(
  samples: readonly BenchmarkMetricSample[],
): readonly BenchmarkMetricSummary[] {
  const grouped = new Map<BenchmarkMetricName, { unit: BenchmarkMetricUnit; values: number[] }>();

  for (const sample of samples) {
    assertNonNegativeFinite(sample.value, sample.name);
    const group = grouped.get(sample.name);
    if (group !== undefined) {
      if (group.unit !== sample.unit) {
        throw new Error(`Metric ${sample.name} used inconsistent units.`);
      }
      group.values.push(sample.value);
      continue;
    }
    grouped.set(sample.name, { unit: sample.unit, values: [sample.value] });
  }

  return [...grouped.entries()].map(([name, group]) => ({
    name,
    unit: group.unit,
    ...summarizeSamples(group.values),
  }));
}

function metricSamplesFromTraces(
  traces: readonly BenchmarkTraceEvent[],
): readonly BenchmarkMetricSample[] {
  const samples: BenchmarkMetricSample[] = [];
  for (const trace of traces) {
    samples.push(
      { name: 'encoderChunkMs', unit: 'ms', value: trace.encoderMs },
      { name: 'decoderChunkMs', unit: 'ms', value: trace.decoderMs },
      { name: 'queueDepthFrames', unit: 'frames', value: trace.queueDepthFrames },
    );
  }
  return samples;
}

function copyTraceEvent(trace: BenchmarkTraceEvent): BenchmarkTraceEvent {
  assertNonNegativeFinite(trace.chunkIndex, 'chunkIndex');
  assertNonNegativeFinite(trace.audioStartMs, 'audioStartMs');
  assertPositiveFinite(trace.audioDurationMs, 'audioDurationMs');
  assertNonNegativeFinite(trace.queueDepthFrames, 'queueDepthFrames');
  assertNonNegativeFinite(trace.encoderMs, 'encoderMs');
  assertNonNegativeFinite(trace.decoderMs, 'decoderMs');
  assertNonNegativeFinite(trace.workerElapsedMs, 'workerElapsedMs');
  return { ...trace };
}

function percentile(sortedValues: readonly number[], quantile: number): number {
  if (sortedValues.length === 0) {
    throw new Error('Cannot calculate percentile without samples.');
  }
  if (sortedValues.length === 1) {
    const only = sortedValues[0];
    if (only === undefined) {
      throw new Error('Cannot calculate percentile without samples.');
    }
    return only;
  }

  const index = (sortedValues.length - 1) * quantile;
  const lowerIndex = Math.floor(index);
  const upperIndex = Math.ceil(index);
  const lower = sortedValues[lowerIndex];
  const upper = sortedValues[upperIndex];
  if (lower === undefined || upper === undefined) {
    throw new Error('Cannot calculate percentile outside sample range.');
  }

  if (lowerIndex === upperIndex) {
    return lower;
  }

  const weight = index - lowerIndex;
  return lower + (upper - lower) * weight;
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
}

function assertNonNegativeFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative finite number.`);
  }
}

function assertPositiveFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive finite number.`);
  }
}

function roundMetric(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
