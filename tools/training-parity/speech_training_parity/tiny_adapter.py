"""Tiny frozen-feature affine adapter reference for browser/Python numerical parity."""

from __future__ import annotations

import json
import math
from dataclasses import dataclass

DATASET_ID = "synthetic-frozen-feature-tiny-adapter-v1"
FEATURE_DIMENSION = 4
OUTPUT_DIMENSION = 2
BASE_MODEL_ID = "mock-browser-training-base"
BASE_MODEL_VERSION = "0.0.0-ci"
GRAPH_CONTRACT_SHA256 = "0" * 64


@dataclass(frozen=True)
class TinyAdapterExample:
    id: str
    features: tuple[float, ...]
    target_residual: tuple[float, ...]
    weight: float = 1.0


@dataclass(frozen=True)
class TinyAdapterDataset:
    dataset_id: str
    feature_dimension: int
    output_dimension: int
    examples: tuple[TinyAdapterExample, ...]


@dataclass(frozen=True)
class TinyAdapterOptions:
    epochs: int
    learning_rate: float
    l2_regularization: float
    max_parameter_count: int
    target_loss: float | None
    checkpoint_every_epochs: int


def create_synthetic_dataset() -> TinyAdapterDataset:
    examples = (
        TinyAdapterExample("case-a", (1.0, 0.0, 0.2, -0.1), (0.18, -0.08)),
        TinyAdapterExample("case-b", (0.8, 0.1, 0.1, 0.2), (0.16, -0.02)),
        TinyAdapterExample("case-c", (0.1, 1.0, -0.2, 0.3), (-0.04, 0.22)),
        TinyAdapterExample("case-d", (0.2, 0.9, 0.3, -0.2), (0.02, 0.18)),
        TinyAdapterExample("case-e", (-0.4, 0.3, 1.0, 0.5), (-0.1, 0.06)),
        TinyAdapterExample("case-f", (0.3, -0.2, 0.4, 1.0), (0.05, -0.12)),
    )
    return TinyAdapterDataset(
        dataset_id=DATASET_ID,
        feature_dimension=FEATURE_DIMENSION,
        output_dimension=OUTPUT_DIMENSION,
        examples=examples,
    )


def default_parity_options() -> TinyAdapterOptions:
    # target_loss=0.0 disables early stopping (loss stays > 0 because of L2 and
    # non-zero targets), so the trajectory is fixed-length and deterministic.
    return TinyAdapterOptions(
        epochs=50,
        learning_rate=0.04,
        l2_regularization=0.001,
        max_parameter_count=1024,
        target_loss=0.0,
        checkpoint_every_epochs=10,
    )


def predict(
    features: tuple[float, ...],
    weights: list[float],
    bias: list[float],
    output_dimension: int,
) -> list[float]:
    feature_dimension = len(features)
    output = [0.0] * output_dimension
    for output_index in range(output_dimension):
        value = bias[output_index]
        for feature_index in range(feature_dimension):
            weight_index = output_index * feature_dimension + feature_index
            value += weights[weight_index] * features[feature_index]
        output[output_index] = value
    return output


def calculate_loss(
    dataset: TinyAdapterDataset,
    weights: list[float],
    bias: list[float],
    l2_regularization: float,
) -> float:
    total_error = 0.0
    total_weight = 0.0
    for example in dataset.examples:
        prediction = predict(example.features, weights, bias, dataset.output_dimension)
        example_weight = example.weight
        for output_index in range(dataset.output_dimension):
            error = prediction[output_index] - example.target_residual[output_index]
            total_error += error * error * example_weight
            total_weight += example_weight
    mse = total_error / max(1, total_weight * dataset.output_dimension)
    l2 = sum(value * value for value in weights) * l2_regularization
    return mse + l2


def run_sgd_epoch(
    dataset: TinyAdapterDataset,
    weights: list[float],
    bias: list[float],
    learning_rate: float,
    l2_regularization: float,
) -> None:
    for example in dataset.examples:
        prediction = predict(example.features, weights, bias, dataset.output_dimension)
        example_weight = example.weight
        for output_index in range(dataset.output_dimension):
            error = prediction[output_index] - example.target_residual[output_index]
            gradient_scale = (2 * error * example_weight) / dataset.output_dimension
            for feature_index in range(dataset.feature_dimension):
                weight_index = output_index * dataset.feature_dimension + feature_index
                weight = weights[weight_index]
                feature = example.features[feature_index]
                weights[weight_index] = weight - learning_rate * (
                    gradient_scale * feature + l2_regularization * weight
                )
            bias[output_index] = bias[output_index] - learning_rate * gradient_scale


def round_float(value: float) -> float:
    """Mirror JS Math.round(value * 1_000_000) / 1_000_000 (ties toward +inf)."""
    scaled = value * 1_000_000
    return math.floor(scaled + 0.5) / 1_000_000


def checksum_tiny_adapter(weights: list[float], bias: list[float]) -> str:
    payload = _js_stringify_adapter(weights, bias)
    hash_value = 0x811C9DC5
    for ch in payload:
        hash_value ^= ord(ch)
        hash_value = (hash_value * 0x01000193) & 0xFFFFFFFF
    return f"fnv1a32:{hash_value:08x}"


def _js_stringify_adapter(weights: list[float], bias: list[float]) -> str:
    weights_part = "[" + ",".join(_js_number(value) for value in weights) + "]"
    bias_part = "[" + ",".join(_js_number(value) for value in bias) + "]"
    return '{"weights":' + weights_part + ',"bias":' + bias_part + "}"


def _js_number(value: float) -> str:
    """Format a float like JS JSON.stringify for values rounded to 6 decimals."""
    if value != value:  # NaN
        return "null"
    if value == float("inf"):
        return "null"
    if value == 0.0:
        return "0"
    if value == int(value):
        return str(int(value))
    return repr(value)


@dataclass(frozen=True)
class TinyAdapterCheckpoint:
    epoch: int
    loss: float
    weights: tuple[float, ...]
    bias: tuple[float, ...]
    checksum: str


@dataclass(frozen=True)
class TinyAdapterTrainingResult:
    initial_loss: float
    final_epoch: int
    final_loss: float
    weights: list[float]
    bias: list[float]
    checksum: str
    checkpoints: tuple[TinyAdapterCheckpoint, ...]


def train_tiny_adapter(
    dataset: TinyAdapterDataset,
    options: TinyAdapterOptions,
) -> TinyAdapterTrainingResult:
    parameter_count = (
        dataset.feature_dimension * dataset.output_dimension + dataset.output_dimension
    )
    if parameter_count > options.max_parameter_count:
        raise ValueError("Frozen-feature adapter parameter count exceeds limit.")

    weights = [0.0] * (dataset.feature_dimension * dataset.output_dimension)
    bias = [0.0] * dataset.output_dimension
    current_epoch = 0
    initial_loss = calculate_loss(dataset, weights, bias, options.l2_regularization)
    current_loss = initial_loss
    checkpoints: list[TinyAdapterCheckpoint] = []

    while current_epoch < options.epochs:
        run_sgd_epoch(
            dataset,
            weights,
            bias,
            options.learning_rate,
            options.l2_regularization,
        )
        current_epoch += 1
        current_loss = calculate_loss(dataset, weights, bias, options.l2_regularization)
        if (
            options.checkpoint_every_epochs > 0
            and current_epoch % options.checkpoint_every_epochs == 0
        ):
            checkpoints.append(_make_checkpoint(current_epoch, current_loss, weights, bias))
        if options.target_loss is not None and current_loss <= options.target_loss:
            break

    return TinyAdapterTrainingResult(
        initial_loss=round_float(initial_loss),
        final_epoch=current_epoch,
        final_loss=round_float(current_loss),
        weights=weights,
        bias=bias,
        checksum=checksum_tiny_adapter(
            [round_float(value) for value in weights],
            [round_float(value) for value in bias],
        ),
        checkpoints=tuple(checkpoints),
    )


def _make_checkpoint(
    epoch: int,
    loss: float,
    weights: list[float],
    bias: list[float],
) -> TinyAdapterCheckpoint:
    rounded_weights = [round_float(value) for value in weights]
    rounded_bias = [round_float(value) for value in bias]
    return TinyAdapterCheckpoint(
        epoch=epoch,
        loss=round_float(loss),
        weights=tuple(rounded_weights),
        bias=tuple(rounded_bias),
        checksum=checksum_tiny_adapter(rounded_weights, rounded_bias),
    )


def dataset_to_json(dataset: TinyAdapterDataset) -> dict[str, object]:
    return {
        "datasetId": dataset.dataset_id,
        "featureDimension": dataset.feature_dimension,
        "outputDimension": dataset.output_dimension,
        "examples": [
            {
                "id": example.id,
                "features": list(example.features),
                "targetResidual": list(example.target_residual),
                "weight": example.weight,
            }
            for example in dataset.examples
        ],
    }


def options_to_json(options: TinyAdapterOptions) -> dict[str, object]:
    return {
        "epochs": options.epochs,
        "learningRate": options.learning_rate,
        "l2Regularization": options.l2_regularization,
        "maxParameterCount": options.max_parameter_count,
        "targetLoss": options.target_loss,
        "checkpointEveryEpochs": options.checkpoint_every_epochs,
    }


def to_jsonable(value: object) -> object:
    """Recursively convert dataclasses/tuples to JSON-serializable forms."""
    if isinstance(value, tuple):
        return [to_jsonable(item) for item in value]
    if isinstance(value, list):
        return [to_jsonable(item) for item in value]
    if hasattr(value, "__dataclass_fields__"):
        return {key: to_jsonable(getattr(value, key)) for key in value.__dataclass_fields__}
    return value


def dumps_canonical(value: object) -> str:
    return json.dumps(to_jsonable(value), indent=2, ensure_ascii=False) + "\n"
