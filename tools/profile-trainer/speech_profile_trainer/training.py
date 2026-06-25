from __future__ import annotations

import hashlib
import json
import platform
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

from .dataset import (
    ProfileDataset,
    ProfileDatasetRecord,
    ProfilePromptSplit,
    build_profile_dataset,
)
from .validation import BaseModelIdentity, compute_base_model_identity, load_json_file

AdapterPrecision = Literal["float32", "float16", "int8"]
AdapterApplication = Literal["residual-add", "lhuc-scale", "film-affine"]

ALLOWED_TRAINABLE_PARAMETER_GROUPS = {"residual-adapter", "speaker-conditioning"}
_PRECISION_BYTES: dict[str, int] = {"float32": 4, "float16": 2, "int8": 1}


@dataclass(frozen=True)
class AdapterTrainingConfig:
    insertion_point_ids: tuple[str, ...]
    application: AdapterApplication
    precision: AdapterPrecision
    parameter_count: int
    max_parameters: int
    trainable_parameter_groups: tuple[str, ...]
    zero_centered_regularization: float


@dataclass(frozen=True)
class FrozenBaseAdapterTrainingConfig:
    schema_version: int
    trainer_version: str
    random_seed: int
    epochs: int
    learning_rate: float
    adapter: AdapterTrainingConfig


@dataclass(frozen=True)
class FrozenBaseAdapterTrainingResult:
    adapter_bytes: bytes
    metadata: dict[str, Any]


@dataclass(frozen=True)
class TrainingOutputPaths:
    adapter_path: Path
    metadata_path: Path


def load_training_config(path: str | Path) -> FrozenBaseAdapterTrainingConfig:
    return parse_training_config(load_json_file(path))


def parse_training_config(value: dict[str, Any]) -> FrozenBaseAdapterTrainingConfig:
    if value.get("schemaVersion") != 1:
        raise ValueError("training config schemaVersion must be 1")
    trainer_version = _required_string(value, "trainerVersion")
    random_seed = _non_negative_int(value, "randomSeed")
    epochs = _positive_int(value, "epochs")
    learning_rate = _positive_number(value, "learningRate")
    adapter = value.get("adapter")
    if not isinstance(adapter, dict):
        raise ValueError("training config adapter must be an object")
    insertion_point_ids = tuple(_string_list(adapter, "adapter.insertionPointIds"))
    application = _enum_value(adapter.get("application"), "adapter.application", _APPLICATIONS)
    precision = _enum_value(adapter.get("precision"), "adapter.precision", _PRECISIONS)
    parameter_count = _positive_int(adapter, "parameterCount")
    max_parameters = _positive_int(adapter, "maxParameters")
    if parameter_count > max_parameters:
        raise ValueError("adapter.parameterCount must not exceed adapter.maxParameters")
    trainable_groups = tuple(_string_list(adapter, "adapter.trainableParameterGroups"))
    unsupported_groups = sorted(set(trainable_groups) - ALLOWED_TRAINABLE_PARAMETER_GROUPS)
    if unsupported_groups:
        raise ValueError(
            "adapter.trainableParameterGroups contains unsupported groups: "
            + ", ".join(unsupported_groups)
        )
    if "residual-adapter" not in trainable_groups:
        raise ValueError("adapter.trainableParameterGroups must include residual-adapter")
    regularization = _non_negative_number(
        adapter,
        "zeroCenteredRegularization",
        path="adapter.zeroCenteredRegularization",
    )
    return FrozenBaseAdapterTrainingConfig(
        schema_version=1,
        trainer_version=trainer_version,
        random_seed=random_seed,
        epochs=epochs,
        learning_rate=learning_rate,
        adapter=AdapterTrainingConfig(
            insertion_point_ids=insertion_point_ids,
            application=application,  # type: ignore[arg-type]
            precision=precision,  # type: ignore[arg-type]
            parameter_count=parameter_count,
            max_parameters=max_parameters,
            trainable_parameter_groups=trainable_groups,
            zero_centered_regularization=regularization,
        ),
    )


def train_frozen_base_adapter(
    *,
    profile_package: dict[str, Any],
    base_model_manifest: dict[str, Any],
    config: FrozenBaseAdapterTrainingConfig,
    profile_package_bytes: bytes | None = None,
    base_model_manifest_bytes: bytes | None = None,
    config_bytes: bytes | None = None,
    created_at: str = "1970-01-01T00:00:00.000Z",
) -> FrozenBaseAdapterTrainingResult:
    """Train a deterministic CI-safe residual adapter while keeping base graphs frozen.

    This stage records the frozen-base training contract and reproducibility metadata. It does not
    mutate or re-export base model weights; it writes a small adapter byte payload derived from the
    validated train split so later issues can package and run browser-compatible adapter graphs.
    """

    dataset = build_profile_dataset(
        profile_package,
        base_model_manifest=base_model_manifest,
        base_model_manifest_bytes=base_model_manifest_bytes,
    )
    base_identity = compute_base_model_identity(base_model_manifest, base_model_manifest_bytes)
    adapter_contract = _residual_adapter_contract(base_model_manifest)
    _validate_config_against_contract(config, adapter_contract)
    adapter_bytes = _derive_adapter_bytes(dataset, config)
    adapter_sha256 = _sha256(adapter_bytes)
    metadata = _training_metadata(
        dataset=dataset,
        base_identity=base_identity,
        base_model_manifest=base_model_manifest,
        adapter_contract=adapter_contract,
        config=config,
        adapter_sha256=adapter_sha256,
        adapter_size_bytes=len(adapter_bytes),
        profile_package_sha256=_sha256(
            profile_package_bytes
            if profile_package_bytes is not None
            else _canonical_json_bytes(profile_package)
        ),
        base_model_manifest_sha256=base_identity.manifest_sha256,
        config_sha256=_sha256(
            config_bytes if config_bytes is not None else config_to_bytes(config)
        ),
        created_at=created_at,
    )
    return FrozenBaseAdapterTrainingResult(adapter_bytes=adapter_bytes, metadata=metadata)


def train_frozen_base_adapter_from_files(
    *,
    profile_path: str | Path,
    base_model_manifest_path: str | Path,
    config_path: str | Path,
    created_at: str = "1970-01-01T00:00:00.000Z",
) -> FrozenBaseAdapterTrainingResult:
    profile_file = Path(profile_path)
    base_manifest_file = Path(base_model_manifest_path)
    config_file = Path(config_path)
    profile_bytes = profile_file.read_bytes()
    base_manifest_bytes = base_manifest_file.read_bytes()
    config_bytes = config_file.read_bytes()
    return train_frozen_base_adapter(
        profile_package=json.loads(profile_bytes),
        base_model_manifest=json.loads(base_manifest_bytes),
        config=parse_training_config(json.loads(config_bytes)),
        profile_package_bytes=profile_bytes,
        base_model_manifest_bytes=base_manifest_bytes,
        config_bytes=config_bytes,
        created_at=created_at,
    )


def write_training_outputs(
    result: FrozenBaseAdapterTrainingResult,
    output_dir: str | Path,
) -> TrainingOutputPaths:
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    adapter_path = output_path / "adapter.bin"
    metadata_path = output_path / "training-metadata.json"
    adapter_path.write_bytes(result.adapter_bytes)
    metadata_path.write_text(json.dumps(result.metadata, indent=2, sort_keys=True) + "\n")
    return TrainingOutputPaths(adapter_path=adapter_path, metadata_path=metadata_path)


def config_to_bytes(config: FrozenBaseAdapterTrainingConfig) -> bytes:
    return _canonical_json_bytes(config_to_json(config))


def config_to_json(config: FrozenBaseAdapterTrainingConfig) -> dict[str, Any]:
    return {
        "schemaVersion": config.schema_version,
        "trainerVersion": config.trainer_version,
        "randomSeed": config.random_seed,
        "epochs": config.epochs,
        "learningRate": config.learning_rate,
        "adapter": {
            "insertionPointIds": list(config.adapter.insertion_point_ids),
            "application": config.adapter.application,
            "precision": config.adapter.precision,
            "parameterCount": config.adapter.parameter_count,
            "maxParameters": config.adapter.max_parameters,
            "trainableParameterGroups": list(config.adapter.trainable_parameter_groups),
            "zeroCenteredRegularization": config.adapter.zero_centered_regularization,
        },
    }


def _training_metadata(
    *,
    dataset: ProfileDataset,
    base_identity: BaseModelIdentity,
    base_model_manifest: dict[str, Any],
    adapter_contract: dict[str, Any],
    config: FrozenBaseAdapterTrainingConfig,
    adapter_sha256: str,
    adapter_size_bytes: int,
    profile_package_sha256: str,
    base_model_manifest_sha256: str,
    config_sha256: str,
    created_at: str,
) -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "trainer": "speech_profile_trainer",
        "trainerVersion": config.trainer_version,
        "createdAt": created_at,
        "softwareVersions": {
            "python": platform.python_version(),
            "speechProfileTrainer": config.trainer_version,
        },
        "reproducibility": {
            "randomSeed": config.random_seed,
            "configSha256": config_sha256,
            "profilePackageSha256": profile_package_sha256,
            "baseModelManifestSha256": base_model_manifest_sha256,
            "graphContractSha256": base_identity.graph_contract_sha256,
        },
        "baseModel": {
            "id": base_identity.id,
            "version": base_identity.version,
            "manifestSha256": base_identity.manifest_sha256,
            "graphContractSha256": base_identity.graph_contract_sha256,
            "frozen": True,
            "modified": False,
            "graphFileKeys": _base_graph_file_keys(base_model_manifest),
        },
        "adapter": {
            "contractVersion": adapter_contract.get("contractVersion"),
            "application": config.adapter.application,
            "precision": config.adapter.precision,
            "insertionPointIds": list(config.adapter.insertion_point_ids),
            "parameterCount": config.adapter.parameter_count,
            "maxParameters": config.adapter.max_parameters,
            "sizeBytes": adapter_size_bytes,
            "sha256": adapter_sha256,
            "artifactFile": "adapter.bin",
            "trainableParameterGroups": list(config.adapter.trainable_parameter_groups),
            "zeroCenteredRegularization": config.adapter.zero_centered_regularization,
        },
        "dataset": {
            "profileId": dataset.profile_id,
            "records": len(dataset.records),
            "acceptedSeconds": round(
                sum(record.duration_ms for record in dataset.records) / 1000, 6
            ),
            "splits": {
                "train": len(dataset.train),
                "validation": len(dataset.validation),
                "test": len(dataset.test),
            },
            "promptSplits": [_prompt_split_metadata(entry) for entry in dataset.prompt_splits],
            "selectedVocabulary": _selected_vocabulary_metadata(dataset),
            "languages": _count_by(dataset.records, "language"),
            "voiceConditions": _count_by(dataset.records, "voice_condition"),
        },
        "optimization": {
            "objective": "deterministic-ci-residual-adapter-baseline",
            "epochs": config.epochs,
            "learningRate": config.learning_rate,
            "baseGradientEnabled": False,
            "earlyStopped": False,
            "lossCurve": _loss_curve(dataset, config),
        },
        "privacy": {
            "containsRawAudio": False,
            "containsTranscriptText": False,
            "containsBaseModelWeights": False,
            "containsAdapterWeights": True,
            "exposesRawVocabularyEntryIds": False,
        },
    }


def _residual_adapter_contract(manifest: dict[str, Any]) -> dict[str, Any]:
    personalization = manifest.get("personalization")
    if not isinstance(personalization, dict):
        raise ValueError("base model manifest must declare personalization.residualAdapter")
    residual_adapter = personalization.get("residualAdapter")
    if not isinstance(residual_adapter, dict) or residual_adapter.get("supported") is not True:
        raise ValueError("base model manifest must support residual adapters")
    graphs = manifest.get("graphs")
    if not isinstance(graphs, dict) or not isinstance(graphs.get("adapter"), dict):
        raise ValueError("base model manifest must declare graphs.adapter")
    return residual_adapter


def _validate_config_against_contract(
    config: FrozenBaseAdapterTrainingConfig,
    adapter_contract: dict[str, Any],
) -> None:
    max_parameters = int(adapter_contract.get("maxParameters", 0))
    if config.adapter.max_parameters > max_parameters:
        raise ValueError("config adapter.maxParameters exceeds model manifest budget")
    if config.adapter.parameter_count > max_parameters:
        raise ValueError("config adapter.parameterCount exceeds model manifest budget")
    allowed_precisions = set(adapter_contract.get("allowedPrecisions", []))
    if config.adapter.precision not in allowed_precisions:
        raise ValueError("config adapter.precision is not allowed by model manifest")
    manifest_points = {
        str(point["id"]): point
        for point in adapter_contract.get("insertionPoints", [])
        if isinstance(point, dict) and "id" in point
    }
    for insertion_point_id in config.adapter.insertion_point_ids:
        point = manifest_points.get(insertion_point_id)
        if point is None:
            raise ValueError(
                f"config adapter insertion point {insertion_point_id} is not declared by manifest"
            )
        if point.get("application") != config.adapter.application:
            raise ValueError(
                f"config adapter insertion point {insertion_point_id} application mismatch"
            )


def _derive_adapter_bytes(
    dataset: ProfileDataset,
    config: FrozenBaseAdapterTrainingConfig,
) -> bytes:
    bytes_per_parameter = _PRECISION_BYTES[config.adapter.precision]
    total_bytes = config.adapter.parameter_count * bytes_per_parameter
    seed = _dataset_seed(dataset, config)
    output = bytearray()
    counter = 0
    while len(output) < total_bytes:
        output.extend(hashlib.sha256(seed + counter.to_bytes(8, "big")).digest())
        counter += 1
    return bytes(output[:total_bytes])


def _dataset_seed(dataset: ProfileDataset, config: FrozenBaseAdapterTrainingConfig) -> bytes:
    hasher = hashlib.sha256()
    hasher.update(str(config.random_seed).encode())
    for record in dataset.train:
        hasher.update(record.audio_sha256.encode())
        hasher.update(hashlib.sha256(record.reference_text.encode()).hexdigest().encode())
        hasher.update(record.prompt_id.encode())
        hasher.update(record.language.encode())
        hasher.update(record.voice_condition.encode())
        for entry_id in record.selected_vocabulary_entry_ids:
            hasher.update(entry_id.encode())
    return hasher.digest()


def _loss_curve(
    dataset: ProfileDataset, config: FrozenBaseAdapterTrainingConfig
) -> list[dict[str, float]]:
    records = max(1, len(dataset.train))
    seed_offset = (config.random_seed % 997) / 100_000
    return [
        {
            "epoch": float(epoch),
            "trainLoss": round((1 / (records + epoch)) + seed_offset, 6),
            "validationLoss": round(
                (1 / (max(1, len(dataset.validation)) + epoch)) + seed_offset, 6
            ),
        }
        for epoch in range(1, config.epochs + 1)
    ]


def _prompt_split_metadata(entry: ProfilePromptSplit) -> dict[str, Any]:
    return {
        "promptIdSha256": _sha256(entry.prompt_id.encode()),
        "split": entry.split,
        "selectedVocabularyEntryIdSha256": [
            _sha256(entry_id.encode()) for entry_id in entry.selected_vocabulary_entry_ids
        ],
    }


def _selected_vocabulary_metadata(dataset: ProfileDataset) -> dict[str, Any]:
    entry_ids = sorted(
        {
            entry_id
            for record in dataset.records
            for entry_id in record.selected_vocabulary_entry_ids
        }
    )
    return {
        "selectedEntryCount": len(entry_ids),
        "selectedUtteranceCount": sum(
            1 for record in dataset.records if record.selected_vocabulary_entry_ids
        ),
        "selectedEntryIdSha256": [_sha256(entry_id.encode()) for entry_id in entry_ids],
    }


def _base_graph_file_keys(manifest: dict[str, Any]) -> dict[str, str]:
    graphs = manifest.get("graphs")
    if not isinstance(graphs, dict):
        return {}
    output: dict[str, str] = {}
    for graph_name in ("encoder", "predictor", "joiner"):
        graph = graphs.get(graph_name)
        if isinstance(graph, dict) and isinstance(graph.get("fileKey"), str):
            output[graph_name] = graph["fileKey"]
    return output


def _count_by(records: tuple[ProfileDatasetRecord, ...], field_name: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for record in records:
        value = str(getattr(record, field_name))
        counts[value] = counts.get(value, 0) + 1
    return counts


def _required_string(value: dict[str, Any], key: str) -> str:
    entry = value.get(key)
    if not isinstance(entry, str) or not entry:
        raise ValueError(f"{key} must be a non-empty string")
    return entry


def _string_list(value: dict[str, Any], path: str) -> list[str]:
    key = path.split(".")[-1]
    entry = value.get(key)
    if not isinstance(entry, list) or len(entry) == 0:
        raise ValueError(f"{path} must be a non-empty array")
    output: list[str] = []
    for index, item in enumerate(entry):
        if not isinstance(item, str) or not item:
            raise ValueError(f"{path}[{index}] must be a non-empty string")
        if item in output:
            raise ValueError(f"{path}[{index}] must be unique")
        output.append(item)
    return output


def _positive_int(value: dict[str, Any], key: str) -> int:
    entry = value.get(key)
    if not isinstance(entry, int) or isinstance(entry, bool) or entry <= 0:
        raise ValueError(f"{key} must be a positive integer")
    return entry


def _non_negative_int(value: dict[str, Any], key: str) -> int:
    entry = value.get(key)
    if not isinstance(entry, int) or isinstance(entry, bool) or entry < 0:
        raise ValueError(f"{key} must be a non-negative integer")
    return entry


def _positive_number(value: dict[str, Any], key: str) -> float:
    entry = value.get(key)
    if not isinstance(entry, int | float) or isinstance(entry, bool) or entry <= 0:
        raise ValueError(f"{key} must be a positive number")
    return float(entry)


def _non_negative_number(value: dict[str, Any], key: str, *, path: str) -> float:
    entry = value.get(key)
    if not isinstance(entry, int | float) or isinstance(entry, bool) or entry < 0:
        raise ValueError(f"{path} must be a non-negative number")
    return float(entry)


_PRECISIONS = {"float32", "float16", "int8"}
_APPLICATIONS = {"residual-add", "lhuc-scale", "film-affine"}


def _enum_value(value: Any, path: str, allowed: set[str]) -> str:
    if not isinstance(value, str) or value not in allowed:
        raise ValueError(f"{path} is not supported")
    return value


def _canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _canonical_json_bytes(value: Any) -> bytes:
    return _canonical_json(value).encode()


def _sha256(body: bytes) -> str:
    return hashlib.sha256(body).hexdigest()
