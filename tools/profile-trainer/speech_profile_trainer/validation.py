from __future__ import annotations

import base64
import binascii
import hashlib
import json
import re
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

from speech_model_pack import validate_manifest_v2

PROFILE_PACKAGE_TYPE = "speech-enrollment-profile-export"
SHA256_RE = re.compile(r"^[a-f0-9]{64}$")
PROFILE_ID_RE = re.compile(r"^[a-z0-9][a-z0-9._-]*$")
LANGUAGES = {"vi", "en", "mixed"}
VOICE_CONDITIONS = {"whisper", "normal", "projected"}
AUDIO_FORMAT = "pcm_s16le_wav"

IssueSeverity = Literal["error", "warning"]


@dataclass(frozen=True)
class ValidationIssue:
    severity: IssueSeverity
    path: str
    message: str


@dataclass(frozen=True)
class BaseModelIdentity:
    id: str
    version: str
    manifest_sha256: str
    graph_contract_sha256: str


@dataclass(frozen=True)
class ProfilePackageValidationReport:
    ok: bool
    errors: tuple[ValidationIssue, ...] = ()
    warnings: tuple[ValidationIssue, ...] = ()
    profile_id: str | None = None
    accepted_utterances: int = 0
    accepted_seconds: float = 0.0
    language_counts: Mapping[str, int] = field(default_factory=dict)
    voice_condition_counts: Mapping[str, int] = field(default_factory=dict)
    base_model_identity: BaseModelIdentity | None = None


@dataclass(frozen=True)
class DecodedProfilePackage:
    package: Mapping[str, Any]
    files: Mapping[str, bytes]
    report: ProfilePackageValidationReport


def load_json_file(path: str | Path) -> Any:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def validate_profile_package(
    package: Mapping[str, Any],
    *,
    base_model_manifest: Mapping[str, Any] | None = None,
    base_model_manifest_bytes: bytes | None = None,
) -> ProfilePackageValidationReport:
    """Validate an exported browser enrollment profile before adapter training."""

    decoded = _validate_and_decode_profile_package(
        package,
        base_model_manifest=base_model_manifest,
        base_model_manifest_bytes=base_model_manifest_bytes,
    )
    return decoded.report


def decode_validated_profile_package(
    package: Mapping[str, Any],
    *,
    base_model_manifest: Mapping[str, Any] | None = None,
    base_model_manifest_bytes: bytes | None = None,
) -> DecodedProfilePackage:
    """Validate and decode profile export files for dataset loading."""

    decoded = _validate_and_decode_profile_package(
        package,
        base_model_manifest=base_model_manifest,
        base_model_manifest_bytes=base_model_manifest_bytes,
    )
    if not decoded.report.ok:
        joined = "; ".join(f"{issue.path}: {issue.message}" for issue in decoded.report.errors)
        raise ValueError(f"Profile package is invalid: {joined}")
    return decoded


def compute_base_model_identity(
    manifest: Mapping[str, Any],
    manifest_bytes: bytes | None = None,
) -> BaseModelIdentity:
    """Return the trainer-compatible model identity for a manifest.

    The manifest SHA-256 is the checksum of the manifest bytes when available; otherwise it is the
    checksum of canonical JSON. The graph-contract SHA-256 is canonical JSON over `graphs` only.
    """

    manifest_body = (
        manifest_bytes if manifest_bytes is not None else _canonical_json_bytes(manifest)
    )
    return BaseModelIdentity(
        id=str(manifest.get("id", "")),
        version=str(manifest.get("version", "")),
        manifest_sha256=_sha256(manifest_body),
        graph_contract_sha256=_sha256(_canonical_json_bytes(manifest.get("graphs", {}))),
    )


def _validate_and_decode_profile_package(
    package: Mapping[str, Any],
    *,
    base_model_manifest: Mapping[str, Any] | None,
    base_model_manifest_bytes: bytes | None,
) -> DecodedProfilePackage:
    errors: list[ValidationIssue] = []
    warnings: list[ValidationIssue] = []
    decoded_files: dict[str, bytes] = {}

    if not isinstance(package, Mapping):
        issue = ValidationIssue("error", "$", "profile package must be a JSON object")
        report = ProfilePackageValidationReport(ok=False, errors=(issue,))
        return DecodedProfilePackage(package={}, files={}, report=report)

    _equals(package.get("schemaVersion"), 1, "schemaVersion", errors)
    _equals(package.get("packageType"), PROFILE_PACKAGE_TYPE, "packageType", errors)
    profile_id = _safe_segment(package.get("profileId"), "profileId", errors)

    profile = _mapping(package.get("profile"), "profile", errors)
    checksums = _mapping(package.get("checksums"), "checksums", errors)
    utterances = _list(package.get("utterances"), "utterances", errors)
    files = _mapping(package.get("files"), "files", errors)
    privacy = _mapping(package.get("privacy"), "privacy", errors)

    if privacy is not None:
        _equals(privacy.get("localOnly"), True, "privacy.localOnly", errors)
        _equals(
            privacy.get("containsTranscriptText"), True, "privacy.containsTranscriptText", errors
        )
        if privacy.get("containsRawAudio") is not True:
            warnings.append(
                ValidationIssue(
                    "warning",
                    "privacy.containsRawAudio",
                    "profile export does not declare raw audio; trainer dataset may be empty",
                )
            )
        if privacy.get("exportEncrypted") is True:
            errors.append(
                ValidationIssue(
                    "error",
                    "privacy.exportEncrypted",
                    "encrypted exports must be decrypted before training validation",
                )
            )

    if profile is not None and profile_id is not None:
        _equals(profile.get("id"), profile_id, "profile.id", errors)
    if checksums is not None and profile_id is not None:
        _equals(checksums.get("profileId"), profile_id, "checksums.profileId", errors)

    if files is not None:
        if len(files) == 0:
            errors.append(ValidationIssue("error", "files", "profile export must contain files"))
        for key, file_entry in files.items():
            if not isinstance(key, str):
                errors.append(ValidationIssue("error", "files", "file keys must be strings"))
                continue
            file_mapping = _mapping(file_entry, f"files.{key}", errors)
            if file_mapping is None:
                continue
            path = _non_empty_string(file_mapping.get("path"), f"files.{key}.path", errors)
            if path is not None and key != path:
                errors.append(
                    ValidationIssue("error", f"files.{key}", "file key must match file path")
                )
            if path is not None and profile_id is not None:
                _assert_profile_path(profile_id, path, f"files.{key}.path", errors)
            expected_sha = _sha_string(file_mapping.get("sha256"), f"files.{key}.sha256", errors)
            expected_size = _non_negative_int(
                file_mapping.get("sizeBytes"), f"files.{key}.sizeBytes", errors
            )
            _non_empty_string(file_mapping.get("mediaType"), f"files.{key}.mediaType", errors)
            base64_text = _non_empty_string(
                file_mapping.get("base64"), f"files.{key}.base64", errors
            )
            if path is None or base64_text is None:
                continue
            try:
                body = base64.b64decode(base64_text, validate=True)
            except (binascii.Error, ValueError):
                errors.append(ValidationIssue("error", f"files.{key}.base64", "invalid base64"))
                continue
            decoded_files[path] = body
            if expected_size is not None and len(body) != expected_size:
                errors.append(
                    ValidationIssue("error", f"files.{key}.sizeBytes", "decoded size mismatch")
                )
            if expected_sha is not None and _sha256(body) != expected_sha:
                errors.append(ValidationIssue("error", f"files.{key}.sha256", "checksum mismatch"))

    if profile_id is not None:
        _validate_embedded_metadata(profile_id, package, decoded_files, errors)
        _validate_utterances(profile_id, utterances, decoded_files, errors)
        _validate_checksum_index(checksums, files, errors)

    base_identity: BaseModelIdentity | None = None
    if base_model_manifest is not None:
        manifest_errors = validate_manifest_v2(base_model_manifest)
        for index, message in enumerate(manifest_errors):
            errors.append(ValidationIssue("error", f"baseModelManifest[{index}]", message))
        base_identity = compute_base_model_identity(base_model_manifest, base_model_manifest_bytes)
        if profile is not None:
            _validate_profile_base_model(profile, base_identity, errors)
    else:
        warnings.append(
            ValidationIssue(
                "warning",
                "baseModelManifest",
                "base model manifest was not provided; trainer compatibility was not verified",
            )
        )

    accepted_utterances = 0
    accepted_seconds = 0.0
    language_counts: Mapping[str, int] = {}
    voice_condition_counts: Mapping[str, int] = {}
    if profile is not None:
        enrollment = _mapping(profile.get("enrollment"), "profile.enrollment", errors)
        if enrollment is not None:
            accepted_utterances = (
                _non_negative_int(
                    enrollment.get("acceptedUtterances"),
                    "profile.enrollment.acceptedUtterances",
                    errors,
                )
                or 0
            )
            accepted_seconds = (
                _non_negative_number(
                    enrollment.get("acceptedSeconds"),
                    "profile.enrollment.acceptedSeconds",
                    errors,
                )
                or 0.0
            )
            language_counts = _count_record(
                enrollment.get("languageCounts"), "profile.enrollment.languageCounts", errors
            )
            voice_condition_counts = _count_record(
                enrollment.get("voiceConditionCounts"),
                "profile.enrollment.voiceConditionCounts",
                errors,
            )
            _non_empty_string(
                enrollment.get("sentenceBankVersion"),
                "profile.enrollment.sentenceBankVersion",
                errors,
            )

    if utterances is not None and accepted_utterances != len(utterances):
        errors.append(
            ValidationIssue(
                "error",
                "profile.enrollment.acceptedUtterances",
                "accepted utterance count must match utterances length",
            )
        )

    report = ProfilePackageValidationReport(
        ok=len(errors) == 0,
        errors=tuple(errors),
        warnings=tuple(warnings),
        profile_id=profile_id,
        accepted_utterances=accepted_utterances,
        accepted_seconds=accepted_seconds,
        language_counts=language_counts,
        voice_condition_counts=voice_condition_counts,
        base_model_identity=base_identity,
    )
    return DecodedProfilePackage(package=package, files=decoded_files, report=report)


def _validate_embedded_metadata(
    profile_id: str,
    package: Mapping[str, Any],
    decoded_files: Mapping[str, bytes],
    errors: list[ValidationIssue],
) -> None:
    profile_path = f"profiles/{profile_id}/profile.json"
    checksums_path = f"profiles/{profile_id}/checksums.json"
    embedded_profile = _read_json_file(decoded_files, profile_path, errors)
    embedded_checksums = _read_json_file(decoded_files, checksums_path, errors)
    if embedded_profile is not None and _canonical_json(embedded_profile) != _canonical_json(
        package.get("profile")
    ):
        errors.append(
            ValidationIssue(
                "error",
                profile_path,
                "embedded profile.json must match top-level profile metadata",
            )
        )
    if embedded_checksums is not None and _canonical_json(embedded_checksums) != _canonical_json(
        package.get("checksums")
    ):
        errors.append(
            ValidationIssue(
                "error",
                checksums_path,
                "embedded checksums.json must match top-level checksum metadata",
            )
        )


def _validate_utterances(
    profile_id: str,
    utterances: list[Any] | None,
    decoded_files: Mapping[str, bytes],
    errors: list[ValidationIssue],
) -> None:
    if utterances is None:
        return
    embedded_utterances: list[Any] = []
    utterance_prefix = f"profiles/{profile_id}/utterances/"
    for path, body in decoded_files.items():
        if path.startswith(utterance_prefix) and path.endswith(".json"):
            try:
                embedded_utterances.append(json.loads(body.decode("utf-8")))
            except (UnicodeDecodeError, json.JSONDecodeError):
                errors.append(ValidationIssue("error", path, "utterance JSON is invalid"))
    if _canonical_json(_sort_utterances(embedded_utterances)) != _canonical_json(
        _sort_utterances(utterances)
    ):
        errors.append(
            ValidationIssue(
                "error",
                "utterances",
                "top-level utterances must match embedded utterance JSON files",
            )
        )
    seen_ids: set[str] = set()
    for index, utterance in enumerate(utterances):
        path = f"utterances[{index}]"
        if not isinstance(utterance, Mapping):
            errors.append(ValidationIssue("error", path, "utterance must be an object"))
            continue
        _equals(utterance.get("schemaVersion"), 1, f"{path}.schemaVersion", errors)
        utterance_id = _safe_segment(utterance.get("id"), f"{path}.id", errors)
        if utterance_id is not None:
            if utterance_id in seen_ids:
                errors.append(ValidationIssue("error", f"{path}.id", "utterance id must be unique"))
            seen_ids.add(utterance_id)
        _equals(utterance.get("profileId"), profile_id, f"{path}.profileId", errors)
        _safe_segment(utterance.get("promptId"), f"{path}.promptId", errors)
        _positive_int(utterance.get("promptVersion"), f"{path}.promptVersion", errors)
        _non_empty_string(utterance.get("referenceText"), f"{path}.referenceText", errors)
        _enum_value(utterance.get("language"), LANGUAGES, f"{path}.language", errors)
        _enum_value(
            utterance.get("voiceCondition"),
            VOICE_CONDITIONS,
            f"{path}.voiceCondition",
            errors,
        )
        _non_negative_int(utterance.get("repetitionIndex"), f"{path}.repetitionIndex", errors)
        _non_empty_string(utterance.get("createdAt"), f"{path}.createdAt", errors)
        if utterance.get("acceptedBy") not in {"automatic", "manual"}:
            errors.append(
                ValidationIssue("error", f"{path}.acceptedBy", "acceptedBy is not supported")
            )
        audio = _mapping(utterance.get("audio"), f"{path}.audio", errors)
        if audio is None:
            continue
        audio_path = _non_empty_string(audio.get("path"), f"{path}.audio.path", errors)
        if audio_path is not None:
            _assert_profile_path(profile_id, audio_path, f"{path}.audio.path", errors)
        _equals(audio.get("format"), AUDIO_FORMAT, f"{path}.audio.format", errors)
        _equals(audio.get("sampleRateHz"), 16_000, f"{path}.audio.sampleRateHz", errors)
        _equals(audio.get("channels"), 1, f"{path}.audio.channels", errors)
        audio_sha = _sha_string(audio.get("sha256"), f"{path}.audio.sha256", errors)
        _positive_int(audio.get("durationMs"), f"{path}.audio.durationMs", errors)
        audio_size = _positive_int(audio.get("sizeBytes"), f"{path}.audio.sizeBytes", errors)
        if audio_path is not None:
            audio_bytes = decoded_files.get(audio_path)
            if audio_bytes is None:
                errors.append(
                    ValidationIssue("error", f"{path}.audio.path", "referenced audio file missing")
                )
            else:
                if audio_sha is not None and _sha256(audio_bytes) != audio_sha:
                    errors.append(
                        ValidationIssue("error", f"{path}.audio.sha256", "audio checksum mismatch")
                    )
                if audio_size is not None and len(audio_bytes) != audio_size:
                    errors.append(
                        ValidationIssue("error", f"{path}.audio.sizeBytes", "audio size mismatch")
                    )


def _validate_checksum_index(
    checksums: Mapping[str, Any] | None,
    files: Mapping[str, Any] | None,
    errors: list[ValidationIssue],
) -> None:
    if checksums is None or files is None:
        return
    checksum_files = _mapping(checksums.get("files"), "checksums.files", errors)
    if checksum_files is None:
        return
    for path, checksum in checksum_files.items():
        if path not in files:
            errors.append(
                ValidationIssue(
                    "error", f"checksums.files.{path}", "checksum references missing file"
                )
            )
            continue
        if isinstance(checksum, Mapping) and isinstance(files[path], Mapping):
            if checksum.get("sha256") != files[path].get("sha256"):
                errors.append(
                    ValidationIssue(
                        "error", f"checksums.files.{path}.sha256", "checksum metadata mismatch"
                    )
                )
            if checksum.get("sizeBytes") != files[path].get("sizeBytes"):
                errors.append(
                    ValidationIssue(
                        "error",
                        f"checksums.files.{path}.sizeBytes",
                        "checksum metadata mismatch",
                    )
                )
    for path in files:
        if (
            isinstance(path, str)
            and not path.endswith("/checksums.json")
            and path not in checksum_files
        ):
            errors.append(
                ValidationIssue("error", f"files.{path}", "file missing from checksum index")
            )


def _validate_profile_base_model(
    profile: Mapping[str, Any],
    expected: BaseModelIdentity,
    errors: list[ValidationIssue],
) -> None:
    base_model = _mapping(profile.get("baseModel"), "profile.baseModel", errors)
    if base_model is None:
        return
    expected_values = {
        "id": expected.id,
        "version": expected.version,
        "manifestSha256": expected.manifest_sha256,
        "graphContractSha256": expected.graph_contract_sha256,
    }
    for key, expected_value in expected_values.items():
        if base_model.get(key) != expected_value:
            errors.append(
                ValidationIssue(
                    "error",
                    f"profile.baseModel.{key}",
                    "profile base-model identity does not match supplied manifest",
                )
            )


def _read_json_file(
    decoded_files: Mapping[str, bytes], path: str, errors: list[ValidationIssue]
) -> Any | None:
    body = decoded_files.get(path)
    if body is None:
        errors.append(ValidationIssue("error", path, "required embedded JSON file is missing"))
        return None
    try:
        return json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        errors.append(ValidationIssue("error", path, "embedded JSON file is invalid"))
        return None


def _assert_profile_path(
    profile_id: str, path: str, error_path: str, errors: list[ValidationIssue]
) -> None:
    segments = path.split("/")
    if any(not _is_safe_segment(segment) for segment in segments):
        errors.append(ValidationIssue("error", error_path, "path contains unsafe segment"))
        return
    if segments[:2] != ["profiles", profile_id]:
        errors.append(ValidationIssue("error", error_path, "path is outside the profile directory"))


def _sort_utterances(utterances: list[Any]) -> list[Any]:
    return sorted(
        utterances,
        key=lambda utterance: (
            str(utterance.get("createdAt", "")) if isinstance(utterance, Mapping) else "",
            str(utterance.get("id", "")) if isinstance(utterance, Mapping) else "",
        ),
    )


def _canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _canonical_json_bytes(value: Any) -> bytes:
    return _canonical_json(value).encode("utf-8")


def _sha256(body: bytes) -> str:
    return hashlib.sha256(body).hexdigest()


def _is_safe_segment(value: str) -> bool:
    return (
        bool(value)
        and value not in {".", ".."}
        and "/" not in value
        and "\\" not in value
        and "\0" not in value
    )


def _safe_segment(value: Any, path: str, errors: list[ValidationIssue]) -> str | None:
    if (
        not isinstance(value, str)
        or PROFILE_ID_RE.fullmatch(value) is None
        or not _is_safe_segment(value)
    ):
        errors.append(ValidationIssue("error", path, "must be a safe profile/path segment"))
        return None
    return value


def _mapping(value: Any, path: str, errors: list[ValidationIssue]) -> Mapping[str, Any] | None:
    if not isinstance(value, Mapping):
        errors.append(ValidationIssue("error", path, "must be an object"))
        return None
    return value


def _list(value: Any, path: str, errors: list[ValidationIssue]) -> list[Any] | None:
    if not isinstance(value, list):
        errors.append(ValidationIssue("error", path, "must be an array"))
        return None
    return value


def _equals(value: Any, expected: Any, path: str, errors: list[ValidationIssue]) -> None:
    if value != expected:
        errors.append(ValidationIssue("error", path, f"must be {expected!r}"))


def _non_empty_string(value: Any, path: str, errors: list[ValidationIssue]) -> str | None:
    if not isinstance(value, str) or not value:
        errors.append(ValidationIssue("error", path, "must be a non-empty string"))
        return None
    return value


def _sha_string(value: Any, path: str, errors: list[ValidationIssue]) -> str | None:
    text = _non_empty_string(value, path, errors)
    if text is not None and SHA256_RE.fullmatch(text) is None:
        errors.append(ValidationIssue("error", path, "must be a SHA-256 hex digest"))
        return None
    return text


def _positive_int(value: Any, path: str, errors: list[ValidationIssue]) -> int | None:
    if not isinstance(value, int) or isinstance(value, bool) or value <= 0:
        errors.append(ValidationIssue("error", path, "must be a positive integer"))
        return None
    return value


def _non_negative_int(value: Any, path: str, errors: list[ValidationIssue]) -> int | None:
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        errors.append(ValidationIssue("error", path, "must be a non-negative integer"))
        return None
    return value


def _non_negative_number(value: Any, path: str, errors: list[ValidationIssue]) -> float | None:
    if not isinstance(value, int | float) or isinstance(value, bool) or value < 0:
        errors.append(ValidationIssue("error", path, "must be a non-negative number"))
        return None
    return float(value)


def _count_record(value: Any, path: str, errors: list[ValidationIssue]) -> Mapping[str, int]:
    if not isinstance(value, Mapping):
        errors.append(ValidationIssue("error", path, "must be an object"))
        return {}
    output: dict[str, int] = {}
    for key, count in value.items():
        if not isinstance(key, str) or not key:
            errors.append(ValidationIssue("error", path, "keys must be non-empty strings"))
            continue
        if not isinstance(count, int) or isinstance(count, bool) or count < 0:
            errors.append(
                ValidationIssue("error", f"{path}.{key}", "must be a non-negative integer")
            )
            continue
        output[key] = count
    return output


def _enum_value(value: Any, allowed: set[str], path: str, errors: list[ValidationIssue]) -> None:
    if not isinstance(value, str) or value not in allowed:
        errors.append(ValidationIssue("error", path, "is not supported"))
