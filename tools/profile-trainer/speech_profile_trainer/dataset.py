from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

from .validation import (
    BaseModelIdentity,
    decode_validated_profile_package,
    load_json_file,
)

ProfileDatasetSplit = Literal["train", "validation", "test"]


@dataclass(frozen=True)
class DatasetSplitConfig:
    train_ratio: float = 0.8
    validation_ratio: float = 0.1
    test_ratio: float = 0.1
    seed: int = 0


DEFAULT_SPLIT_CONFIG = DatasetSplitConfig()


@dataclass(frozen=True)
class ProfilePromptSplit:
    prompt_id: str
    split: ProfileDatasetSplit


@dataclass(frozen=True)
class ProfileDatasetRecord:
    utterance_id: str
    profile_id: str
    prompt_id: str
    prompt_version: int
    split: ProfileDatasetSplit
    reference_text: str
    language: str
    voice_condition: str
    repetition_index: int
    audio_path: str
    audio_sha256: str
    audio_bytes: bytes
    duration_ms: int
    accepted_by: str
    quality: dict[str, Any]
    capture: dict[str, Any]
    created_at: str


@dataclass(frozen=True)
class ProfileDataset:
    profile_id: str
    records: tuple[ProfileDatasetRecord, ...]
    prompt_splits: tuple[ProfilePromptSplit, ...]
    base_model_identity: BaseModelIdentity | None

    @property
    def train(self) -> tuple[ProfileDatasetRecord, ...]:
        return tuple(record for record in self.records if record.split == "train")

    @property
    def validation(self) -> tuple[ProfileDatasetRecord, ...]:
        return tuple(record for record in self.records if record.split == "validation")

    @property
    def test(self) -> tuple[ProfileDatasetRecord, ...]:
        return tuple(record for record in self.records if record.split == "test")


def load_profile_dataset(
    profile_path: str | Path,
    *,
    base_model_manifest_path: str | Path | None = None,
    split_config: DatasetSplitConfig = DEFAULT_SPLIT_CONFIG,
) -> ProfileDataset:
    profile_package = load_json_file(profile_path)
    base_manifest = None
    base_manifest_bytes = None
    if base_model_manifest_path is not None:
        base_manifest_file = Path(base_model_manifest_path)
        base_manifest_bytes = base_manifest_file.read_bytes()
        base_manifest = load_json_file(base_manifest_file)
    return build_profile_dataset(
        profile_package,
        base_model_manifest=base_manifest,
        base_model_manifest_bytes=base_manifest_bytes,
        split_config=split_config,
    )


def build_profile_dataset(
    profile_package: dict[str, Any],
    *,
    base_model_manifest: dict[str, Any] | None = None,
    base_model_manifest_bytes: bytes | None = None,
    split_config: DatasetSplitConfig = DEFAULT_SPLIT_CONFIG,
) -> ProfileDataset:
    decoded = decode_validated_profile_package(
        profile_package,
        base_model_manifest=base_model_manifest,
        base_model_manifest_bytes=base_model_manifest_bytes,
    )
    package = decoded.package
    profile_id = str(package["profileId"])
    utterances = package["utterances"]
    if not isinstance(utterances, list):
        raise ValueError("Validated profile package did not contain an utterance array.")
    prompt_splits = split_prompt_ids(
        sorted({str(utterance["promptId"]) for utterance in utterances}), split_config
    )
    split_by_prompt = {entry.prompt_id: entry.split for entry in prompt_splits}
    records: list[ProfileDatasetRecord] = []
    for utterance in sorted(utterances, key=lambda item: (str(item["promptId"]), str(item["id"]))):
        audio = utterance["audio"]
        audio_path = str(audio["path"])
        audio_bytes = decoded.files.get(audio_path)
        if audio_bytes is None:
            raise ValueError(f"Validated profile package is missing audio file {audio_path}.")
        prompt_id = str(utterance["promptId"])
        records.append(
            ProfileDatasetRecord(
                utterance_id=str(utterance["id"]),
                profile_id=str(utterance["profileId"]),
                prompt_id=prompt_id,
                prompt_version=int(utterance["promptVersion"]),
                split=split_by_prompt[prompt_id],
                reference_text=str(utterance["referenceText"]),
                language=str(utterance["language"]),
                voice_condition=str(utterance["voiceCondition"]),
                repetition_index=int(utterance["repetitionIndex"]),
                audio_path=audio_path,
                audio_sha256=str(audio["sha256"]),
                audio_bytes=audio_bytes,
                duration_ms=int(audio["durationMs"]),
                accepted_by=str(utterance["acceptedBy"]),
                quality=dict(utterance.get("quality", {})),
                capture=dict(utterance.get("capture", {})),
                created_at=str(utterance["createdAt"]),
            )
        )
    return ProfileDataset(
        profile_id=profile_id,
        records=tuple(records),
        prompt_splits=prompt_splits,
        base_model_identity=decoded.report.base_model_identity,
    )


def split_prompt_ids(
    prompt_ids: list[str],
    config: DatasetSplitConfig = DEFAULT_SPLIT_CONFIG,
) -> tuple[ProfilePromptSplit, ...]:
    if not prompt_ids:
        return ()
    total = config.train_ratio + config.validation_ratio + config.test_ratio
    if total <= 0:
        raise ValueError("Dataset split ratios must have a positive sum.")
    normalized = (
        config.train_ratio / total,
        config.validation_ratio / total,
        config.test_ratio / total,
    )
    ordered = sorted(prompt_ids, key=lambda prompt_id: _stable_prompt_score(prompt_id, config.seed))
    train_cutoff = round(len(ordered) * normalized[0])
    validation_cutoff = train_cutoff + round(len(ordered) * normalized[1])
    if len(ordered) >= 3:
        train_cutoff = max(1, min(train_cutoff, len(ordered) - 2))
        validation_cutoff = max(train_cutoff + 1, min(validation_cutoff, len(ordered) - 1))
    elif len(ordered) == 2:
        train_cutoff = 1
        validation_cutoff = 1
    else:
        train_cutoff = 1
        validation_cutoff = 1

    splits: list[ProfilePromptSplit] = []
    for index, prompt_id in enumerate(ordered):
        if index < train_cutoff:
            split: ProfileDatasetSplit = "train"
        elif index < validation_cutoff:
            split = "validation"
        else:
            split = "test"
        splits.append(ProfilePromptSplit(prompt_id=prompt_id, split=split))
    return tuple(sorted(splits, key=lambda item: item.prompt_id))


def _stable_prompt_score(prompt_id: str, seed: int) -> str:
    body = f"{seed}:{prompt_id}".encode()
    return hashlib.sha256(body).hexdigest()
