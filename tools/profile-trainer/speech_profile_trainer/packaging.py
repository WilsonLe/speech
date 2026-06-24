from __future__ import annotations

import base64
import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .validation import load_json_file

PROFILE_ID_RE = re.compile(r"^[a-z0-9][a-z0-9._-]*$")
PACKAGE_TYPE = "speech-personal-adapter-package"
ADAPTER_FILE_KEY = "adapterGraph"
MANIFEST_FILE_KEY = "profileManifest"


@dataclass(frozen=True)
class AdapterPackageResult:
    package: dict[str, Any]
    manifest: dict[str, Any]


def package_personal_adapter(
    *,
    adapter_bytes: bytes,
    training_metadata: dict[str, Any],
    evaluation_report: dict[str, Any],
    profile_id: str | None = None,
    display_name: str | None = None,
    exported_at: str = "1970-01-01T00:00:00.000Z",
) -> AdapterPackageResult:
    adapter_sha256 = _sha256(adapter_bytes)
    _validate_adapter_artifact(adapter_sha256, len(adapter_bytes), training_metadata)
    _require_activation_gate_passed(evaluation_report)
    resolved_profile_id = profile_id or _profile_id_from_metadata(training_metadata)
    if not PROFILE_ID_RE.fullmatch(resolved_profile_id):
        raise ValueError("profileId must be a safe profile identifier")
    resolved_display_name = display_name or f"{resolved_profile_id} adapter"
    if not resolved_display_name:
        raise ValueError("displayName must be non-empty")

    adapter_path = f"profiles/{resolved_profile_id}/adapters/{adapter_sha256}/adapter.bin"
    adapter_file_ref = {
        "path": adapter_path,
        "sha256": adapter_sha256,
        "sizeBytes": len(adapter_bytes),
        "mediaType": "application/octet-stream",
    }
    manifest = _profile_manifest(
        profile_id=resolved_profile_id,
        display_name=resolved_display_name,
        exported_at=exported_at,
        adapter_file_ref=adapter_file_ref,
        training_metadata=training_metadata,
        evaluation_report=evaluation_report,
    )
    manifest_bytes = _canonical_json_bytes(manifest)
    manifest_path = f"profiles/{resolved_profile_id}/profile.json"
    files = {
        manifest_path: _package_file(manifest_path, manifest_bytes, "application/json"),
        adapter_path: _package_file(adapter_path, adapter_bytes, "application/octet-stream"),
    }
    checksums = {
        "schemaVersion": 1,
        "profileId": resolved_profile_id,
        "updatedAt": exported_at,
        "files": {
            path: {"sha256": file_entry["sha256"], "sizeBytes": file_entry["sizeBytes"]}
            for path, file_entry in files.items()
        },
    }
    package = {
        "schemaVersion": 1,
        "packageType": PACKAGE_TYPE,
        "exportedAt": exported_at,
        "profileId": resolved_profile_id,
        "manifest": manifest,
        "checksums": checksums,
        "files": files,
        "privacy": {
            "containsRawAudio": False,
            "containsTranscriptText": False,
            "containsRawProfileData": False,
            "containsAdapterWeights": True,
            "containsBaseModelWeights": False,
            "exportEncrypted": False,
            "localOnly": True,
        },
        "warnings": [
            "Adapter packages contain private adaptation weights. "
            "Import only into a compatible local browser profile."
        ],
    }
    validate_personal_adapter_package(package)
    return AdapterPackageResult(package=package, manifest=manifest)


def package_personal_adapter_from_files(
    *,
    adapter_path: str | Path,
    training_metadata_path: str | Path,
    evaluation_report_path: str | Path,
    profile_id: str | None = None,
    display_name: str | None = None,
    exported_at: str = "1970-01-01T00:00:00.000Z",
) -> AdapterPackageResult:
    adapter_bytes = Path(adapter_path).read_bytes()
    training_metadata = load_json_file(training_metadata_path)
    evaluation_report = load_json_file(evaluation_report_path)
    if not isinstance(training_metadata, dict):
        raise ValueError("training metadata must be an object")
    if not isinstance(evaluation_report, dict):
        raise ValueError("evaluation report must be an object")
    return package_personal_adapter(
        adapter_bytes=adapter_bytes,
        training_metadata=training_metadata,
        evaluation_report=evaluation_report,
        profile_id=profile_id,
        display_name=display_name,
        exported_at=exported_at,
    )


def write_personal_adapter_package(result: AdapterPackageResult, output_path: str | Path) -> Path:
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(result.package, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return path


def validate_personal_adapter_package(package: dict[str, Any]) -> None:
    if package.get("schemaVersion") != 1:
        raise ValueError("adapter package schemaVersion must be 1")
    if package.get("packageType") != PACKAGE_TYPE:
        raise ValueError(f"adapter package packageType must be {PACKAGE_TYPE}")
    profile_id = _required_string(package, "profileId")
    if not PROFILE_ID_RE.fullmatch(profile_id):
        raise ValueError("adapter package profileId is not safe")
    manifest = _required_object(package, "manifest")
    if manifest.get("id") != profile_id:
        raise ValueError("adapter package manifest.id must match profileId")
    files = _required_object(package, "files")
    checksums = _required_object(package, "checksums")
    checksum_files = _required_object(checksums, "files")
    manifest_path = f"profiles/{profile_id}/profile.json"
    if manifest_path not in files:
        raise ValueError("adapter package must include embedded profile.json")
    decoded_files: dict[str, bytes] = {}
    for path, file_entry in files.items():
        if not isinstance(path, str) or not path.startswith(f"profiles/{profile_id}/"):
            raise ValueError("adapter package files must stay under the profile directory")
        file_object = _as_object(file_entry, f"files.{path}")
        if file_object.get("path") != path:
            raise ValueError(f"files.{path}.path must match the file key")
        body = _decode_base64(_required_string(file_object, "base64"), f"files.{path}.base64")
        sha256 = _required_string(file_object, "sha256")
        if _sha256(body) != sha256:
            raise ValueError(f"files.{path}.sha256 does not match file body")
        size_bytes = _required_int(file_object, "sizeBytes")
        if len(body) != size_bytes:
            raise ValueError(f"files.{path}.sizeBytes does not match file body")
        decoded_files[path] = body
        checksum_entry = _as_object(checksum_files.get(path), f"checksums.files.{path}")
        if checksum_entry.get("sha256") != sha256 or checksum_entry.get("sizeBytes") != size_bytes:
            raise ValueError(f"checksums.files.{path} must match file entry")
    embedded_manifest = json.loads(decoded_files[manifest_path].decode("utf-8"))
    if _canonical_json(embedded_manifest) != _canonical_json(manifest):
        raise ValueError("embedded profile.json must match adapter package manifest")
    _validate_manifest_adapter_file_ref(manifest, files)
    privacy = _required_object(package, "privacy")
    if privacy.get("containsRawAudio") is not False:
        raise ValueError("adapter package must not contain raw audio")
    if privacy.get("containsTranscriptText") is not False:
        raise ValueError("adapter package must not contain transcript text")
    if privacy.get("containsBaseModelWeights") is not False:
        raise ValueError("adapter package must not contain base model weights")
    if privacy.get("containsAdapterWeights") is not True:
        raise ValueError("adapter package must declare adapter weights")


def _profile_manifest(
    *,
    profile_id: str,
    display_name: str,
    exported_at: str,
    adapter_file_ref: dict[str, Any],
    training_metadata: dict[str, Any],
    evaluation_report: dict[str, Any],
) -> dict[str, Any]:
    dataset = _required_object(training_metadata, "dataset")
    adapter = _required_object(training_metadata, "adapter")
    reproducibility = _required_object(training_metadata, "reproducibility")
    base_model = _required_object(training_metadata, "baseModel")
    evaluation = _required_object(evaluation_report, "evaluation")
    activation_gate = _required_object(evaluation_report, "activationGate")
    return {
        "schemaVersion": 1,
        "id": profile_id,
        "displayName": display_name,
        "createdAt": str(training_metadata.get("createdAt") or exported_at),
        "updatedAt": exported_at,
        "baseModel": {
            "id": _required_string(base_model, "id"),
            "version": _required_string(base_model, "version"),
            "manifestSha256": _required_string(base_model, "manifestSha256"),
            "graphContractSha256": _required_string(base_model, "graphContractSha256"),
        },
        "languages": _manifest_languages(dataset.get("languages")),
        "enrollment": {
            "acceptedUtterances": _required_int(dataset, "records"),
            "acceptedSeconds": _number_or_zero(dataset.get("acceptedSeconds")),
            "languageCounts": _count_record(dataset.get("languages")),
            "voiceConditionCounts": _count_record(dataset.get("voiceConditions")),
            "sentenceBankVersion": str(dataset.get("sentenceBankVersion") or "unknown"),
        },
        "adaptation": {
            "type": "residual-adapter",
            "contractVersion": 1,
            "files": {ADAPTER_FILE_KEY: adapter_file_ref},
            "adapter": {
                "graphFileKey": ADAPTER_FILE_KEY,
                "graphContractSha256": _required_string(reproducibility, "graphContractSha256"),
                "parameterCount": _required_int(adapter, "parameterCount"),
                "maxParameters": _required_int(adapter, "maxParameters"),
                "precision": _required_string(adapter, "precision"),
                "insertionPointIds": _string_list(adapter.get("insertionPointIds")),
                "application": _required_string(adapter, "application"),
                "activationSwap": "utterance-boundary",
            },
            "training": {
                "runtime": "python-profile-trainer",
                "trainerVersion": _required_string(training_metadata, "trainerVersion"),
                "configSha256": _required_string(reproducibility, "configSha256"),
                "profilePackageSha256": _required_string(reproducibility, "profilePackageSha256"),
                "baseModelSha256": _required_string(reproducibility, "baseModelManifestSha256"),
                "randomSeed": _required_int(reproducibility, "randomSeed"),
            },
        },
        "evaluation": {
            "baseMetrics": _evaluation_metrics(evaluation, side="base"),
            "adaptedMetrics": _evaluation_metrics(evaluation, side="adapted"),
            "activationGatePassed": bool(activation_gate.get("passed")),
            "warnings": _activation_warnings(activation_gate),
        },
        "privacy": {"containsRawAudio": False, "exportEncrypted": False},
    }


def _evaluation_metrics(evaluation: dict[str, Any], *, side: str) -> dict[str, float]:
    overall = _required_object(evaluation, "overall")
    metrics: dict[str, float] = {}
    _copy_metric(metrics, "wer", overall, "wer", side)
    _copy_metric(metrics, "cer", overall, "cer", side)
    _copy_metric(metrics, "customTermRecall", overall, "customTermRecall", side)
    false_insertion = _required_object(overall, "falseInsertionRate")
    false_value = false_insertion.get(side)
    if isinstance(false_value, int | float) and not isinstance(false_value, bool):
        metrics["falseInsertionsPer100Utterances"] = round(float(false_value) * 100, 6)
    rtf = _required_object(overall, "rtf")
    rtf_value = rtf.get(side)
    if isinstance(rtf_value, int | float) and not isinstance(rtf_value, bool):
        metrics["realTimeFactor"] = round(float(rtf_value), 6)
    return metrics


def _copy_metric(
    output: dict[str, float],
    output_key: str,
    summary: dict[str, Any],
    source_key: str,
    side: str,
) -> None:
    metric = _required_object(summary, source_key)
    value = metric.get(side)
    if isinstance(value, int | float) and not isinstance(value, bool):
        output[output_key] = round(float(value), 6)


def _activation_warnings(activation_gate: dict[str, Any]) -> list[str]:
    checks = activation_gate.get("checks")
    if not isinstance(checks, list):
        return []
    return [
        f"activation gate check failed: {check.get('name')}"
        for check in checks
        if isinstance(check, dict) and check.get("passed") is False
    ]


def _validate_manifest_adapter_file_ref(
    manifest: dict[str, Any], package_files: dict[str, Any]
) -> None:
    adaptation = _required_object(manifest, "adaptation")
    if adaptation.get("type") != "residual-adapter":
        raise ValueError("adapter package manifest adaptation.type must be residual-adapter")
    adapter_binding = _required_object(adaptation, "adapter")
    graph_file_key = _required_string(adapter_binding, "graphFileKey")
    adaptation_files = _required_object(adaptation, "files")
    adapter_ref = _as_object(
        adaptation_files.get(graph_file_key),
        f"manifest.adaptation.files.{graph_file_key}",
    )
    adapter_path = _required_string(adapter_ref, "path")
    package_file = _as_object(package_files.get(adapter_path), f"files.{adapter_path}")
    if adapter_ref.get("sha256") != package_file.get("sha256"):
        raise ValueError("manifest adapter file ref sha256 must match package file")
    if adapter_ref.get("sizeBytes") != package_file.get("sizeBytes"):
        raise ValueError("manifest adapter file ref sizeBytes must match package file")
    if adapter_ref.get("mediaType") != package_file.get("mediaType"):
        raise ValueError("manifest adapter file ref mediaType must match package file")


def _validate_adapter_artifact(sha256: str, size_bytes: int, metadata: dict[str, Any]) -> None:
    adapter = _required_object(metadata, "adapter")
    if adapter.get("sha256") != sha256:
        raise ValueError("adapter bytes do not match training metadata adapter.sha256")
    if adapter.get("sizeBytes") != size_bytes:
        raise ValueError("adapter bytes do not match training metadata adapter.sizeBytes")


def _require_activation_gate_passed(evaluation_report: dict[str, Any]) -> None:
    activation_gate = _required_object(evaluation_report, "activationGate")
    if activation_gate.get("passed") is not True:
        raise ValueError("adapter activation gate must pass before packaging")
    if activation_gate.get("automaticActivationAllowed") is not True:
        raise ValueError("automatic activation must be allowed before packaging")


def _profile_id_from_metadata(metadata: dict[str, Any]) -> str:
    dataset = _required_object(metadata, "dataset")
    return _required_string(dataset, "profileId")


def _manifest_languages(value: Any) -> list[str]:
    counts = _count_record(value)
    languages: list[str] = []
    if counts.get("vi", 0) > 0 or counts.get("mixed", 0) > 0:
        languages.append("vi")
    if counts.get("en", 0) > 0 or counts.get("mixed", 0) > 0:
        languages.append("en")
    return languages or ["vi", "en"]


def _package_file(path: str, body: bytes, media_type: str) -> dict[str, Any]:
    return {
        "path": path,
        "sha256": _sha256(body),
        "sizeBytes": len(body),
        "mediaType": media_type,
        "base64": base64.b64encode(body).decode("ascii"),
    }


def _count_record(value: Any) -> dict[str, int]:
    if not isinstance(value, dict):
        return {}
    output: dict[str, int] = {}
    for key, count in value.items():
        if isinstance(key, str) and isinstance(count, int) and not isinstance(count, bool):
            output[key] = max(0, count)
    return output


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list) or not value:
        raise ValueError("expected a non-empty string array")
    output: list[str] = []
    for item in value:
        if not isinstance(item, str) or not item:
            raise ValueError("expected a non-empty string array")
        output.append(item)
    return output


def _number_or_zero(value: Any) -> float:
    if isinstance(value, int | float) and not isinstance(value, bool) and value >= 0:
        return float(value)
    return 0.0


def _required_object(value: dict[str, Any] | Any, key: str) -> dict[str, Any]:
    entry = value.get(key) if isinstance(value, dict) else None
    return _as_object(entry, key)


def _as_object(value: Any, path: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{path} must be an object")
    return value


def _required_string(value: dict[str, Any], key: str) -> str:
    entry = value.get(key)
    if not isinstance(entry, str) or not entry:
        raise ValueError(f"{key} must be a non-empty string")
    return entry


def _required_int(value: dict[str, Any], key: str) -> int:
    entry = value.get(key)
    if not isinstance(entry, int) or isinstance(entry, bool) or entry < 0:
        raise ValueError(f"{key} must be a non-negative integer")
    return entry


def _decode_base64(value: str, path: str) -> bytes:
    try:
        return base64.b64decode(value.encode("ascii"), validate=True)
    except ValueError as exc:
        raise ValueError(f"{path} must be valid base64") from exc


def _canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _canonical_json_bytes(value: Any) -> bytes:
    return _canonical_json(value).encode()


def _sha256(body: bytes) -> str:
    return hashlib.sha256(body).hexdigest()
