from __future__ import annotations

import base64
import hashlib
import json
from pathlib import Path
from typing import Any

from speech_profile_trainer import (
    DatasetSplitConfig,
    build_profile_dataset,
    compute_base_model_identity,
    load_profile_dataset,
    validate_profile_package,
)
from speech_profile_trainer.__main__ import main as trainer_main

REPO_ROOT = Path(__file__).resolve().parents[3]
BASE_MANIFEST_PATH = REPO_ROOT / "model-packs/example-manifest/local-dev-rnnt-mock.json"


def test_validate_profile_package_accepts_checksummed_export_with_base_model() -> None:
    base_manifest, base_manifest_bytes = _load_base_manifest()
    package = make_profile_package(base_manifest, base_manifest_bytes)

    report = validate_profile_package(
        package,
        base_model_manifest=base_manifest,
        base_model_manifest_bytes=base_manifest_bytes,
    )

    assert report.ok
    assert report.errors == ()
    assert report.warnings == ()
    assert report.profile_id == "profile-local"
    assert report.accepted_utterances == 5
    assert report.language_counts == {"vi": 2, "en": 1, "mixed": 2}
    assert report.base_model_identity == compute_base_model_identity(
        base_manifest, base_manifest_bytes
    )


def test_validate_profile_package_rejects_tampered_audio_and_base_model_mismatch() -> None:
    base_manifest, base_manifest_bytes = _load_base_manifest()
    package = make_profile_package(base_manifest, base_manifest_bytes)
    package["profile"]["baseModel"]["graphContractSha256"] = "0" * 64
    audio_path = "profiles/profile-local/recordings/utt-001.wav"
    package["files"][audio_path]["base64"] = base64.b64encode(b"tampered").decode("ascii")

    report = validate_profile_package(
        package,
        base_model_manifest=base_manifest,
        base_model_manifest_bytes=base_manifest_bytes,
    )

    assert not report.ok
    assert any(issue.path == "profile.baseModel.graphContractSha256" for issue in report.errors)
    assert any(issue.path == f"files.{audio_path}.sizeBytes" for issue in report.errors)
    assert any(issue.path == f"files.{audio_path}.sha256" for issue in report.errors)


def test_validate_profile_package_rejects_export_paths_outside_profile() -> None:
    base_manifest, base_manifest_bytes = _load_base_manifest()
    package = make_profile_package(base_manifest, base_manifest_bytes)
    audio_path = "profiles/profile-local/recordings/utt-001.wav"
    file_entry = package["files"].pop(audio_path)
    unsafe_path = "profiles/profile-local/../secret.wav"
    file_entry["path"] = unsafe_path
    package["files"][unsafe_path] = file_entry

    report = validate_profile_package(
        package,
        base_model_manifest=base_manifest,
        base_model_manifest_bytes=base_manifest_bytes,
    )

    assert not report.ok
    assert any(issue.path == f"files.{unsafe_path}.path" for issue in report.errors)


def test_profile_dataset_loader_splits_by_prompt_identity_without_leakage(tmp_path: Path) -> None:
    base_manifest, base_manifest_bytes = _load_base_manifest()
    package = make_profile_package(base_manifest, base_manifest_bytes)
    profile_path = tmp_path / "profile.speechprofile.json"
    profile_path.write_text(json.dumps(package), encoding="utf-8")
    manifest_path = tmp_path / "manifest.json"
    manifest_path.write_bytes(base_manifest_bytes)

    dataset = load_profile_dataset(
        profile_path,
        base_model_manifest_path=manifest_path,
        split_config=DatasetSplitConfig(seed=42),
    )

    assert dataset.profile_id == "profile-local"
    assert len(dataset.records) == 5
    assert len(dataset.prompt_splits) == 4
    assert {entry.split for entry in dataset.prompt_splits} == {"train", "validation", "test"}
    prompt_001_splits = {
        record.split for record in dataset.records if record.prompt_id == "prompt-001"
    }
    assert len(prompt_001_splits) == 1
    assert {record.reference_text for record in dataset.records} >= {
        "Tôi vừa update dashboard.",
        "Please open Wilson Speech.",
    }
    assert all(record.audio_bytes.startswith(b"RIFF") for record in dataset.records)


def test_build_profile_dataset_warns_when_base_model_manifest_is_missing() -> None:
    base_manifest, base_manifest_bytes = _load_base_manifest()
    package = make_profile_package(base_manifest, base_manifest_bytes)

    report = validate_profile_package(package)
    dataset = build_profile_dataset(package)

    assert report.ok
    assert any(issue.path == "baseModelManifest" for issue in report.warnings)
    assert dataset.base_model_identity is None


def test_cli_validate_emits_json_report(tmp_path: Path, capsys: Any) -> None:
    base_manifest, base_manifest_bytes = _load_base_manifest()
    package = make_profile_package(base_manifest, base_manifest_bytes)
    profile_path = tmp_path / "profile.speechprofile.json"
    profile_path.write_text(json.dumps(package), encoding="utf-8")
    manifest_path = tmp_path / "manifest.json"
    manifest_path.write_bytes(base_manifest_bytes)

    exit_code = trainer_main(
        [
            "validate",
            "--profile",
            str(profile_path),
            "--base-model-manifest",
            str(manifest_path),
            "--json",
        ]
    )

    payload = json.loads(capsys.readouterr().out)
    assert exit_code == 0
    assert payload["ok"] is True
    assert payload["profileId"] == "profile-local"
    assert payload["acceptedUtterances"] == 5


def _load_base_manifest() -> tuple[dict[str, Any], bytes]:
    body = BASE_MANIFEST_PATH.read_bytes()
    return json.loads(body), body


def make_profile_package(
    base_manifest: dict[str, Any],
    base_manifest_bytes: bytes,
) -> dict[str, Any]:
    identity = compute_base_model_identity(base_manifest, base_manifest_bytes)
    profile = {
        "schemaVersion": 1,
        "id": "profile-local",
        "displayName": "Local profile",
        "createdAt": "2026-06-23T00:00:00.000Z",
        "updatedAt": "2026-06-23T00:00:00.000Z",
        "baseModel": {
            "id": identity.id,
            "version": identity.version,
            "manifestSha256": identity.manifest_sha256,
            "graphContractSha256": identity.graph_contract_sha256,
        },
        "enrollment": {
            "acceptedUtterances": 5,
            "acceptedSeconds": 6.0,
            "languageCounts": {"vi": 2, "en": 1, "mixed": 2},
            "voiceConditionCounts": {"whisper": 1, "normal": 3, "projected": 1},
            "sentenceBankVersion": "synthetic-v1",
        },
        "privacy": {"containsRawAudio": True, "exportEncrypted": False, "localOnly": True},
    }
    utterances = [
        _utterance("utt-001", "prompt-001", "Tôi vừa update dashboard.", "mixed", "normal"),
        _utterance(
            "utt-002",
            "prompt-001-repeat",
            "Tôi vừa update dashboard.",
            "mixed",
            "projected",
            prompt_id="prompt-001",
        ),
        _utterance("utt-003", "prompt-002", "Please open Wilson Speech.", "en", "normal"),
        _utterance("utt-004", "prompt-003", "Hãy kiểm tra kết quả.", "vi", "whisper"),
        _utterance("utt-005", "prompt-004", "Tôi đang thử giọng nói.", "vi", "normal"),
    ]
    files: dict[str, dict[str, Any]] = {}
    _add_file(files, "profiles/profile-local/profile.json", _json_bytes(profile))
    enrollment_jsonl = "".join(
        json.dumps(utterance, ensure_ascii=False) + "\n" for utterance in utterances
    )
    _add_file(files, "profiles/profile-local/enrollment.jsonl", enrollment_jsonl.encode("utf-8"))
    for utterance in utterances:
        _add_file(
            files,
            f"profiles/profile-local/utterances/{utterance['id']}.json",
            _json_bytes(utterance),
        )
        audio_body = _wav_bytes(str(utterance["id"]))
        audio_path = str(utterance["audio"]["path"])
        utterance["audio"]["sha256"] = _sha256(audio_body)
        utterance["audio"]["sizeBytes"] = len(audio_body)
        _add_file(files, audio_path, audio_body, media_type="audio/wav")
        # Rewrite utterance JSON after filling audio checksums.
        _add_file(
            files,
            f"profiles/profile-local/utterances/{utterance['id']}.json",
            _json_bytes(utterance),
        )
    checksums = {
        "schemaVersion": 1,
        "profileId": "profile-local",
        "updatedAt": "2026-06-23T00:00:00.000Z",
        "files": {
            path: {"sha256": entry["sha256"], "sizeBytes": entry["sizeBytes"]}
            for path, entry in files.items()
            if not path.endswith("/checksums.json")
        },
    }
    _add_file(files, "profiles/profile-local/checksums.json", _json_bytes(checksums))
    return {
        "schemaVersion": 1,
        "packageType": "speech-enrollment-profile-export",
        "exportedAt": "2026-06-23T00:00:00.000Z",
        "profileId": "profile-local",
        "profile": profile,
        "utterances": utterances,
        "checksums": checksums,
        "files": files,
        "privacy": {
            "containsRawAudio": True,
            "containsTranscriptText": True,
            "containsRawProfileData": True,
            "exportEncrypted": False,
            "localOnly": True,
        },
        "warnings": ["Synthetic test fixture only."],
    }


def _utterance(
    utterance_id: str,
    prompt_label: str,
    text: str,
    language: str,
    voice_condition: str,
    *,
    prompt_id: str | None = None,
) -> dict[str, Any]:
    actual_prompt_id = prompt_id or prompt_label
    return {
        "schemaVersion": 1,
        "id": utterance_id,
        "profileId": "profile-local",
        "promptId": actual_prompt_id,
        "promptVersion": 1,
        "referenceText": text,
        "language": language,
        "voiceCondition": voice_condition,
        "repetitionIndex": 0,
        "audio": {
            "path": f"profiles/profile-local/recordings/{utterance_id}.wav",
            "format": "pcm_s16le_wav",
            "sampleRateHz": 16000,
            "channels": 1,
            "sha256": "0" * 64,
            "durationMs": 1200,
            "sizeBytes": 0,
        },
        "capture": {
            "requestedConstraints": {"autoGainControl": False},
            "actualSettings": {"sampleRate": 16000, "channelCount": 1},
            "userMicrophoneLabel": "Synthetic microphone",
        },
        "quality": {"schemaVersion": 1, "status": "pass", "privacy": {"containsAudio": False}},
        "acceptedBy": "manual",
        "createdAt": "2026-06-23T00:00:00.000Z",
    }


def _add_file(
    files: dict[str, dict[str, Any]],
    path: str,
    body: bytes,
    *,
    media_type: str = "application/json",
) -> None:
    files[path] = {
        "path": path,
        "sha256": _sha256(body),
        "sizeBytes": len(body),
        "mediaType": media_type,
        "base64": base64.b64encode(body).decode("ascii"),
    }


def _json_bytes(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def _wav_bytes(label: str) -> bytes:
    return b"RIFF" + label.encode("utf-8") + b"WAVEfmt data"


def _sha256(body: bytes) -> str:
    return hashlib.sha256(body).hexdigest()
