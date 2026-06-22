import type { GraphContract, GraphStateRelationship, TensorContract } from '@speech/protocol';

export interface EncoderSessionLike<TTensor> {
  run(feeds: Record<string, TTensor>): Promise<Record<string, TTensor>>;
}

export interface EncoderInitialStateFactory<TTensor> {
  createInitialState(input: TensorContract, relationship: GraphStateRelationship): TTensor;
}

export interface StreamingEncoderCacheAdapterOptions<TTensor> {
  readonly graph: GraphContract;
  readonly session: EncoderSessionLike<TTensor>;
  readonly featureInputName?: string;
  readonly encodedOutputName?: string;
  readonly initialStateFactory?: EncoderInitialStateFactory<TTensor>;
}

export interface StreamingEncoderRunResult<TTensor> {
  readonly encoded: TTensor;
  readonly outputs: Readonly<Record<string, TTensor>>;
  readonly state: Readonly<Record<string, TTensor>>;
  readonly fedStateInputs: readonly string[];
}

export class StreamingEncoderCacheAdapter<TTensor> {
  private readonly graph: GraphContract;
  private readonly session: EncoderSessionLike<TTensor>;
  private readonly featureInput: TensorContract;
  private readonly encodedOutput: TensorContract;
  private readonly stateRelationships: readonly GraphStateRelationship[];
  private readonly initialStateFactory: EncoderInitialStateFactory<TTensor> | undefined;
  private readonly state = new Map<string, TTensor>();

  constructor(options: StreamingEncoderCacheAdapterOptions<TTensor>) {
    this.graph = options.graph;
    this.session = options.session;
    this.stateRelationships = options.graph.stateRelationships ?? [];
    this.featureInput = resolveFeatureInput(
      options.graph,
      this.stateRelationships,
      options.featureInputName,
    );
    this.encodedOutput = resolveEncodedOutput(
      options.graph,
      this.stateRelationships,
      options.encodedOutputName,
    );
    this.initialStateFactory = options.initialStateFactory;
    validateStateRelationships(options.graph, this.stateRelationships);
  }

  resetUtterance(): void {
    for (const relationship of this.stateRelationships) {
      if (relationship.resetAtUtteranceBoundary) {
        this.state.delete(relationship.output);
      }
    }
  }

  snapshotState(): Readonly<Record<string, TTensor>> {
    return Object.fromEntries(this.state.entries());
  }

  async encodeChunk(features: TTensor): Promise<StreamingEncoderRunResult<TTensor>> {
    const feeds: Record<string, TTensor> = { [this.featureInput.name]: features };
    const fedStateInputs: string[] = [];

    for (const relationship of this.stateRelationships) {
      const stateTensor =
        this.state.get(relationship.output) ?? this.createInitialState(relationship);
      if (stateTensor !== undefined) {
        feeds[relationship.input] = stateTensor;
        fedStateInputs.push(relationship.input);
      }
    }

    const outputs = await this.session.run(feeds);
    const encoded = requireTensor(outputs, this.encodedOutput.name, 'encoder output');

    for (const relationship of this.stateRelationships) {
      const outputTensor = requireTensor(outputs, relationship.output, 'encoder state output');
      this.state.set(relationship.output, outputTensor);
    }

    return {
      encoded,
      outputs,
      state: this.snapshotState(),
      fedStateInputs,
    };
  }

  private createInitialState(relationship: GraphStateRelationship): TTensor | undefined {
    if (this.initialStateFactory === undefined) return undefined;
    const input = this.graph.inputs.find((candidate) => candidate.name === relationship.input);
    if (input === undefined) {
      throw new Error(`Encoder state input ${relationship.input} is missing from graph inputs.`);
    }
    return this.initialStateFactory.createInitialState(input, relationship);
  }
}

function resolveFeatureInput(
  graph: GraphContract,
  relationships: readonly GraphStateRelationship[],
  explicitName: string | undefined,
): TensorContract {
  if (explicitName !== undefined)
    return requireContract(graph.inputs, explicitName, 'encoder input');
  const stateInputNames = new Set(relationships.map((relationship) => relationship.input));
  const candidates = graph.inputs.filter((input) => !stateInputNames.has(input.name));
  return requireSingleCandidate(candidates, 'encoder feature input');
}

function resolveEncodedOutput(
  graph: GraphContract,
  relationships: readonly GraphStateRelationship[],
  explicitName: string | undefined,
): TensorContract {
  if (explicitName !== undefined)
    return requireContract(graph.outputs, explicitName, 'encoder output');
  const stateOutputNames = new Set(relationships.map((relationship) => relationship.output));
  const candidates = graph.outputs.filter((output) => !stateOutputNames.has(output.name));
  return requireSingleCandidate(candidates, 'encoder encoded output');
}

function validateStateRelationships(
  graph: GraphContract,
  relationships: readonly GraphStateRelationship[],
): void {
  const inputNames = new Set(graph.inputs.map((input) => input.name));
  const outputNames = new Set(graph.outputs.map((output) => output.name));
  for (const relationship of relationships) {
    if (!inputNames.has(relationship.input)) {
      throw new Error(
        `Encoder state relationship input ${relationship.input} is not a graph input.`,
      );
    }
    if (!outputNames.has(relationship.output)) {
      throw new Error(
        `Encoder state relationship output ${relationship.output} is not a graph output.`,
      );
    }
  }
}

function requireContract(
  contracts: readonly TensorContract[],
  name: string,
  description: string,
): TensorContract {
  const contract = contracts.find((candidate) => candidate.name === name);
  if (contract === undefined) {
    throw new Error(`Manifest ${description} ${name} was not found.`);
  }
  return contract;
}

function requireSingleCandidate(
  candidates: readonly TensorContract[],
  description: string,
): TensorContract {
  if (candidates.length !== 1) {
    throw new Error(
      `Manifest must define exactly one ${description} after excluding encoder cache state tensors.`,
    );
  }
  const candidate = candidates[0];
  if (candidate === undefined) {
    throw new Error(`Manifest did not define ${description}.`);
  }
  return candidate;
}

function requireTensor<TTensor>(
  outputs: Readonly<Record<string, TTensor>>,
  name: string,
  description: string,
): TTensor {
  const value = outputs[name];
  if (value === undefined) {
    throw new Error(`ONNX encoder session did not produce ${description} ${name}.`);
  }
  return value;
}
