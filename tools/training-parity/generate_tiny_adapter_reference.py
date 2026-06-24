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

REPO_ROOT = Path(__file__).resolve().parents[2]
OUTPUT_PATH = REPO_ROOT / "test-data/expected/tiny-adapter-parity.json"


def build_fixture() -> dict[str, object]:
    dataset = create_synthetic_dataset()
    options = default_parity_options()
    result = train_tiny_adapter(dataset, options)

    forward_features = (1.0, 0.0, 0.2, -0.1)
    rounded_weights = [round_float(value) for value in result.weights]
    rounded_bias = [round_float(value) for value in result.bias]
    forward_output = predict(
        forward_features, rounded_weights, rounded_bias, dataset.output_dimension
    )

    return {
        "schemaVersion": 1,
        "description": (
            "Tiny frozen-feature affine adapter browser/Python numerical parity fixture; "
            "synthetic CI data only, no audio, transcripts, or private profile data."
        ),
        "dataset": {
            "datasetId": dataset.dataset_id,
            "featureDimension": dataset.feature_dimension,
            "outputDimension": dataset.output_dimension,
            "examples": [
                {
                    "id": example.id,
                    "features": list(example.features),
                    "targetResidual": list(example.target_residual),
                }
                for example in dataset.examples
            ],
            "source": {
                "kind": "synthetic-ci-fixture",
                "baseModelId": "mock-browser-training-base",
                "baseModelVersion": "0.0.0-ci",
                "graphContractSha256": "0" * 64,
            },
        },
        "options": {
            "epochs": options.epochs,
            "learningRate": options.learning_rate,
            "l2Regularization": options.l2_regularization,
            "maxParameterCount": options.max_parameter_count,
            "checkpointEveryEpochs": options.checkpoint_every_epochs,
        },
        "initialLoss": result.initial_loss,
        "checkpoints": [
            {
                "epoch": checkpoint.epoch,
                "loss": checkpoint.loss,
                "weights": list(checkpoint.weights),
                "bias": list(checkpoint.bias),
                "checksum": checkpoint.checksum,
            }
            for checkpoint in result.checkpoints
        ],
        "final": {
            "epoch": result.final_epoch,
            "loss": result.final_loss,
            "weights": [round_float(value) for value in result.weights],
            "bias": [round_float(value) for value in result.bias],
            "checksum": result.checksum,
        },
        "forwardOutput": {
            "features": list(forward_features),
            "prediction": forward_output,
        },
        "privacy": {
            "containsRawAudio": False,
            "containsTranscriptText": False,
            "containsPrivateFrozenFeatureValues": False,
            "containsProfileData": False,
            "networkUpload": False,
            "localOnly": True,
        },
    }


def main() -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(build_fixture(), indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
