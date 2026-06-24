from __future__ import annotations

import json
from pathlib import Path

from speech_training_parity.tiny_adapter import (
    create_synthetic_dataset,
    default_parity_options,
    predict,
    round_float,
    train_tiny_adapter,
)

REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURE_PATH = REPO_ROOT / "test-data/expected/tiny-adapter-parity.json"


def load_fixture() -> dict[str, object]:
    return json.loads(FIXTURE_PATH.read_text())


def test_python_reference_reproduces_committed_fixture() -> None:
    fixture = load_fixture()
    dataset = create_synthetic_dataset()
    options = default_parity_options()
    result = train_tiny_adapter(dataset, options)

    assert result.initial_loss == fixture["initialLoss"]
    assert result.final_epoch == fixture["final"]["epoch"]
    assert result.final_loss == fixture["final"]["loss"]
    assert result.checksum == fixture["final"]["checksum"]

    fixture_checkpoints = fixture["checkpoints"]
    assert isinstance(fixture_checkpoints, list)
    assert len(result.checkpoints) == len(fixture_checkpoints)
    for checkpoint, expected in zip(result.checkpoints, fixture_checkpoints, strict=True):
        assert checkpoint.epoch == expected["epoch"]
        assert checkpoint.loss == expected["loss"]
        assert checkpoint.checksum == expected["checksum"]
        assert list(checkpoint.weights) == expected["weights"]
        assert list(checkpoint.bias) == expected["bias"]


def test_python_reference_forward_output_matches_fixture() -> None:
    fixture = load_fixture()
    forward = fixture["forwardOutput"]
    assert isinstance(forward, dict)
    features = tuple(forward["features"])
    expected_prediction = forward["prediction"]

    dataset = create_synthetic_dataset()
    options = default_parity_options()
    result = train_tiny_adapter(dataset, options)
    # The runtime adapter loads the rounded artifact weights, so the forward output
    # parity uses the rounded weights rather than the internal training state.
    rounded_weights = [round_float(value) for value in result.weights]
    rounded_bias = [round_float(value) for value in result.bias]
    prediction = predict(features, rounded_weights, rounded_bias, dataset.output_dimension)

    assert prediction == expected_prediction


def test_python_reference_dataset_matches_fixture() -> None:
    fixture = load_fixture()
    fixture_dataset = fixture["dataset"]
    assert isinstance(fixture_dataset, dict)
    dataset = create_synthetic_dataset()

    assert dataset.dataset_id == fixture_dataset["datasetId"]
    assert dataset.feature_dimension == fixture_dataset["featureDimension"]
    assert dataset.output_dimension == fixture_dataset["outputDimension"]
    assert [example.id for example in dataset.examples] == [
        example["id"] for example in fixture_dataset["examples"]
    ]


def test_round_float_matches_js_math_round() -> None:
    assert round_float(0.18) == 0.18
    assert round_float(0.0) == 0.0
    assert round_float(-0.08) == -0.08
    assert round_float(2.5e-6) == 0.000003
    # JS Math.round ties toward +inf; 0.5e-6 -> 0.000001, -0.5e-6 -> 0
    assert round_float(0.5e-6) == 0.000001
    assert round_float(-0.5e-6) == 0.0
    assert round_float(-1.5e-6) == -0.000001
