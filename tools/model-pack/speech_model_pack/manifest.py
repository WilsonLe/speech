from __future__ import annotations

from collections.abc import Mapping
from typing import Any


def validate_manifest_minimum(manifest: Mapping[str, Any]) -> list[str]:
    """Return human-readable errors for the minimum manifest-v2 release gate."""
    errors: list[str] = []

    if manifest.get("schemaVersion") != 2:
        errors.append("schemaVersion must be 2")
    if manifest.get("architecture") != "rnnt":
        errors.append("architecture must be rnnt")
    if manifest.get("sampleRateHz") != 16000:
        errors.append("sampleRateHz must be 16000")

    for key in ("id", "version", "displayName"):
        if not isinstance(manifest.get(key), str) or not manifest[key]:
            errors.append(f"{key} must be a non-empty string")

    if not isinstance(manifest.get("files"), Mapping) or not manifest["files"]:
        errors.append("files must list at least one artifact")

    graphs = manifest.get("graphs")
    if not isinstance(graphs, Mapping):
        errors.append("graphs contract is required")
    else:
        for graph_name in ("encoder", "predictor", "joiner"):
            if graph_name not in graphs:
                errors.append(f"graphs.{graph_name} is required")

    return errors
