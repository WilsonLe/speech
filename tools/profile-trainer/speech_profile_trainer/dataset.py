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
    prompt_splits = split_prompt_identities(utterances, split_config)
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
    groups = [
        _PromptIdentityGroup(
            prompt_id=prompt_id,
            utterances=1,
            duration_ms=0,
            language_counts={language: 0 for language in _LANGUAGES},
            voice_condition_counts={condition: 0 for condition in _VOICE_CONDITIONS},
        )
        for prompt_id in sorted({str(prompt_id) for prompt_id in prompt_ids})
    ]
    return _split_prompt_groups(groups, config)


def split_prompt_identities(
    utterances: list[dict[str, Any]],
    config: DatasetSplitConfig = DEFAULT_SPLIT_CONFIG,
) -> tuple[ProfilePromptSplit, ...]:
    grouped: dict[str, _PromptIdentityGroup] = {}
    for utterance in utterances:
        prompt_id = str(utterance["promptId"])
        group = grouped.get(prompt_id)
        if group is None:
            group = _PromptIdentityGroup(
                prompt_id=prompt_id,
                utterances=0,
                duration_ms=0,
                language_counts={language: 0 for language in _LANGUAGES},
                voice_condition_counts={condition: 0 for condition in _VOICE_CONDITIONS},
            )
            grouped[prompt_id] = group
        language = str(utterance.get("language", ""))
        voice_condition = str(utterance.get("voiceCondition", ""))
        if language in group.language_counts:
            group.language_counts[language] += 1
        if voice_condition in group.voice_condition_counts:
            group.voice_condition_counts[voice_condition] += 1
        audio = utterance.get("audio", {})
        duration_ms = int(audio.get("durationMs", 0)) if isinstance(audio, dict) else 0
        group.utterances += 1
        group.duration_ms += max(0, duration_ms)
    return _split_prompt_groups(list(grouped.values()), config)


_LANGUAGES = ("vi", "en", "mixed")
_VOICE_CONDITIONS = ("whisper", "normal", "projected")
_SPLITS: tuple[ProfileDatasetSplit, ...] = ("train", "validation", "test")


@dataclass
class _PromptIdentityGroup:
    prompt_id: str
    utterances: int
    duration_ms: int
    language_counts: dict[str, int]
    voice_condition_counts: dict[str, int]


@dataclass
class _MutableSplitBucket:
    prompt_identities: int
    utterances: int
    duration_ms: int
    language_counts: dict[str, int]
    voice_condition_counts: dict[str, int]


def _split_prompt_groups(
    groups: list[_PromptIdentityGroup],
    config: DatasetSplitConfig,
) -> tuple[ProfilePromptSplit, ...]:
    if not groups:
        return ()
    ratios = _normalized_ratios(config)
    targets = _allocate_prompt_targets(len(groups), ratios)
    ordered = sorted(groups, key=lambda group: _group_sort_key(group, config.seed))
    totals = _summarize_groups(groups)
    buckets = {split: _empty_bucket() for split in _SPLITS}
    assignments: dict[str, ProfileDatasetSplit] = {}
    for group in ordered:
        split = _choose_split(group, buckets, targets, totals, ratios, config.seed)
        _add_group(buckets[split], group)
        assignments[group.prompt_id] = split
    return tuple(
        ProfilePromptSplit(prompt_id=prompt_id, split=assignments[prompt_id])
        for prompt_id in sorted(assignments)
    )


def _normalized_ratios(config: DatasetSplitConfig) -> dict[ProfileDatasetSplit, float]:
    total = config.train_ratio + config.validation_ratio + config.test_ratio
    if total <= 0:
        raise ValueError("Dataset split ratios must have a positive sum.")
    ratios = {
        "train": config.train_ratio / total,
        "validation": config.validation_ratio / total,
        "test": config.test_ratio / total,
    }
    if any(value < 0 for value in ratios.values()):
        raise ValueError("Dataset split ratios must be non-negative.")
    return ratios


def _allocate_prompt_targets(
    prompt_identity_count: int,
    ratios: dict[ProfileDatasetSplit, float],
) -> dict[ProfileDatasetSplit, int]:
    if prompt_identity_count <= 0:
        return {split: 0 for split in _SPLITS}
    raw = {split: prompt_identity_count * ratios[split] for split in _SPLITS}
    targets = {split: int(raw[split] // 1) for split in _SPLITS}
    assigned = sum(targets.values())
    remainder_order = sorted(
        _SPLITS,
        key=lambda split: (-(raw[split] - targets[split]), -ratios[split], _SPLITS.index(split)),
    )
    while assigned < prompt_identity_count:
        for split in remainder_order:
            if assigned >= prompt_identity_count:
                break
            targets[split] += 1
            assigned += 1
    active_splits = [split for split in _SPLITS if ratios[split] > 0]
    if prompt_identity_count < len(active_splits):
        tiny_targets = {split: 0 for split in _SPLITS}
        tiny_order = sorted(active_splits, key=lambda split: (-ratios[split], _SPLITS.index(split)))
        for split in tiny_order[:prompt_identity_count]:
            tiny_targets[split] = 1
        return tiny_targets
    for split in active_splits:
        if targets[split] > 0:
            continue
        donors = [candidate for candidate in active_splits if targets[candidate] > 1]
        if not donors:
            continue
        donor = sorted(donors, key=lambda candidate: targets[candidate], reverse=True)[0]
        targets[donor] -= 1
        targets[split] += 1
    return targets


def _group_sort_key(group: _PromptIdentityGroup, seed: int) -> tuple[int, int, int, str]:
    return (
        -group.utterances,
        -sum(1 for count in group.voice_condition_counts.values() if count > 0),
        -sum(1 for count in group.language_counts.values() if count > 0),
        _stable_prompt_score(group.prompt_id, seed),
    )


def _choose_split(
    group: _PromptIdentityGroup,
    buckets: dict[ProfileDatasetSplit, _MutableSplitBucket],
    targets: dict[ProfileDatasetSplit, int],
    totals: _MutableSplitBucket,
    ratios: dict[ProfileDatasetSplit, float],
    seed: int,
) -> ProfileDatasetSplit:
    available = [split for split in _SPLITS if buckets[split].prompt_identities < targets[split]]
    candidates = available or list(_SPLITS)
    return min(
        candidates,
        key=lambda split: (
            _candidate_score(group, split, buckets, targets, totals, ratios),
            _stable_prompt_score(f"{group.prompt_id}:{split}", seed),
        ),
    )


def _candidate_score(
    group: _PromptIdentityGroup,
    split: ProfileDatasetSplit,
    buckets: dict[ProfileDatasetSplit, _MutableSplitBucket],
    targets: dict[ProfileDatasetSplit, int],
    totals: _MutableSplitBucket,
    ratios: dict[ProfileDatasetSplit, float],
) -> float:
    score = 0.0
    for candidate in _SPLITS:
        prompt_identities = buckets[candidate].prompt_identities + int(candidate == split)
        score += ((prompt_identities - targets[candidate]) ** 2) * 20
        duration_ms = buckets[candidate].duration_ms
        if candidate == split:
            duration_ms += group.duration_ms
        score += _normalized_square(duration_ms, totals.duration_ms * ratios[candidate])
        for language in _LANGUAGES:
            actual = buckets[candidate].language_counts[language]
            if candidate == split:
                actual += group.language_counts[language]
            score += (
                _normalized_square(actual, totals.language_counts[language] * ratios[candidate]) * 3
            )
        for condition in _VOICE_CONDITIONS:
            actual = buckets[candidate].voice_condition_counts[condition]
            if candidate == split:
                actual += group.voice_condition_counts[condition]
            score += (
                _normalized_square(
                    actual, totals.voice_condition_counts[condition] * ratios[candidate]
                )
                * 3
            )
    return score


def _summarize_groups(groups: list[_PromptIdentityGroup]) -> _MutableSplitBucket:
    bucket = _empty_bucket()
    for group in groups:
        _add_group(bucket, group)
    return bucket


def _empty_bucket() -> _MutableSplitBucket:
    return _MutableSplitBucket(
        prompt_identities=0,
        utterances=0,
        duration_ms=0,
        language_counts={language: 0 for language in _LANGUAGES},
        voice_condition_counts={condition: 0 for condition in _VOICE_CONDITIONS},
    )


def _add_group(bucket: _MutableSplitBucket, group: _PromptIdentityGroup) -> None:
    bucket.prompt_identities += 1
    bucket.utterances += group.utterances
    bucket.duration_ms += group.duration_ms
    for language in _LANGUAGES:
        bucket.language_counts[language] += group.language_counts[language]
    for condition in _VOICE_CONDITIONS:
        bucket.voice_condition_counts[condition] += group.voice_condition_counts[condition]


def _normalized_square(actual: float, expected: float) -> float:
    return ((actual - expected) ** 2) / max(1.0, expected)


def _stable_prompt_score(prompt_id: str, seed: int) -> str:
    body = f"{seed}:{prompt_id}".encode()
    return hashlib.sha256(body).hexdigest()
