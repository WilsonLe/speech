from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from .dataset import load_profile_dataset
from .evaluation import evaluate_adapter_activation_from_files, write_evaluation_report
from .training import train_frozen_base_adapter_from_files, write_training_outputs
from .validation import load_json_file, validate_profile_package


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m speech_profile_trainer")
    subparsers = parser.add_subparsers(dest="command", required=True)

    validate_parser = subparsers.add_parser("validate", help="validate an exported speech profile")
    validate_parser.add_argument(
        "--profile", required=True, help="path to .speechprofile.json export"
    )
    validate_parser.add_argument("--base-model-manifest", help="path to model manifest JSON")
    validate_parser.add_argument("--json", action="store_true", help="emit machine-readable JSON")

    dataset_parser = subparsers.add_parser(
        "describe-dataset", help="validate and summarize the trainer dataset split"
    )
    dataset_parser.add_argument(
        "--profile", required=True, help="path to .speechprofile.json export"
    )
    dataset_parser.add_argument("--base-model-manifest", help="path to model manifest JSON")
    dataset_parser.add_argument("--json", action="store_true", help="emit machine-readable JSON")

    train_parser = subparsers.add_parser(
        "train", help="run the frozen-base residual-adapter trainer"
    )
    train_parser.add_argument("--profile", required=True, help="path to .speechprofile.json export")
    train_parser.add_argument(
        "--base-model-manifest", required=True, help="path to model manifest JSON"
    )
    train_parser.add_argument("--config", required=True, help="path to trainer config JSON")
    train_parser.add_argument(
        "--output-dir", required=True, help="directory for adapter.bin and metadata"
    )
    train_parser.add_argument("--json", action="store_true", help="emit machine-readable JSON")

    evaluate_parser = subparsers.add_parser(
        "evaluate", help="evaluate adapter metrics and apply the activation gate"
    )
    evaluate_parser.add_argument(
        "--evaluation", required=True, help="path to aggregate evaluation input JSON"
    )
    evaluate_parser.add_argument(
        "--training-metadata", required=True, help="path to training-metadata.json"
    )
    evaluate_parser.add_argument(
        "--gate-config", required=True, help="path to activation gate JSON"
    )
    evaluate_parser.add_argument("--output", help="optional path for aggregate evaluation report")
    evaluate_parser.add_argument("--json", action="store_true", help="emit machine-readable JSON")

    args = parser.parse_args(argv)
    if args.command == "validate":
        report = _validate(args.profile, args.base_model_manifest)
        payload = {
            "ok": report.ok,
            "profileId": report.profile_id,
            "acceptedUtterances": report.accepted_utterances,
            "acceptedSeconds": report.accepted_seconds,
            "errors": [_issue_json(issue) for issue in report.errors],
            "warnings": [_issue_json(issue) for issue in report.warnings],
        }
        _emit(payload, json_output=args.json)
        return 0 if report.ok else 1
    if args.command == "describe-dataset":
        dataset = load_profile_dataset(
            args.profile, base_model_manifest_path=args.base_model_manifest
        )
        payload = {
            "profileId": dataset.profile_id,
            "records": len(dataset.records),
            "splits": {
                "train": len(dataset.train),
                "validation": len(dataset.validation),
                "test": len(dataset.test),
            },
            "promptSplits": [entry.__dict__ for entry in dataset.prompt_splits],
        }
        _emit(payload, json_output=args.json)
        return 0
    if args.command == "train":
        result = train_frozen_base_adapter_from_files(
            profile_path=args.profile,
            base_model_manifest_path=args.base_model_manifest,
            config_path=args.config,
        )
        paths = write_training_outputs(result, args.output_dir)
        payload = {
            "profileId": result.metadata["dataset"]["profileId"],
            "adapterPath": str(paths.adapter_path),
            "metadataPath": str(paths.metadata_path),
            "adapterSha256": result.metadata["adapter"]["sha256"],
            "baseModelModified": result.metadata["baseModel"]["modified"],
        }
        _emit(payload, json_output=args.json)
        return 0
    if args.command == "evaluate":
        result = evaluate_adapter_activation_from_files(
            evaluation_path=args.evaluation,
            training_metadata_path=args.training_metadata,
            gate_config_path=args.gate_config,
        )
        output_path = None
        if args.output:
            output_path = str(write_evaluation_report(result, args.output))
        payload = {
            "activationGatePassed": result.activation_gate["passed"],
            "automaticActivationAllowed": result.activation_gate["automaticActivationAllowed"],
            "summary": result.activation_gate["summary"],
            "checks": result.activation_gate["checks"],
            "outputPath": output_path,
        }
        _emit(payload, json_output=args.json)
        return 0 if result.activation_gate["passed"] else 2
    raise AssertionError(f"Unhandled command {args.command}")


def _validate(profile_path: str, base_model_manifest_path: str | None):
    profile_package = load_json_file(profile_path)
    base_manifest = None
    base_manifest_bytes = None
    if base_model_manifest_path is not None:
        path = Path(base_model_manifest_path)
        base_manifest_bytes = path.read_bytes()
        base_manifest = load_json_file(path)
    return validate_profile_package(
        profile_package,
        base_model_manifest=base_manifest,
        base_model_manifest_bytes=base_manifest_bytes,
    )


def _emit(payload: dict[str, Any], *, json_output: bool) -> None:
    if json_output:
        print(json.dumps(payload, indent=2, sort_keys=True))
        return
    if "ok" in payload:
        status = "ok" if payload["ok"] else "failed"
        print(f"profile validation {status}: {payload.get('profileId') or '<unknown>'}")
        for issue in payload.get("errors", []):
            print(f"error: {issue['path']}: {issue['message']}")
        for issue in payload.get("warnings", []):
            print(f"warning: {issue['path']}: {issue['message']}")
        return
    if "adapterPath" in payload:
        print(
            f"adapter training complete for {payload['profileId']}: "
            f"{payload['adapterPath']} ({payload['adapterSha256']})"
        )
        return
    if "activationGatePassed" in payload:
        status = "passed" if payload["activationGatePassed"] else "failed"
        print(f"adapter activation gate {status}")
        for check in payload.get("checks", []):
            check_status = "pass" if check["passed"] else "fail"
            print(f"{check_status}: {check['name']}")
        if payload.get("outputPath"):
            print(f"report: {payload['outputPath']}")
        return
    print(
        f"profile dataset {payload['profileId']}: {payload['records']} records "
        f"({payload['splits']['train']} train, {payload['splits']['validation']} validation, "
        f"{payload['splits']['test']} test)"
    )


def _issue_json(issue: Any) -> dict[str, str]:
    return {"severity": issue.severity, "path": issue.path, "message": issue.message}


if __name__ == "__main__":
    raise SystemExit(main())
