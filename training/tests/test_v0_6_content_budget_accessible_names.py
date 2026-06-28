from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
GATE_PATH = ROOT / "docs" / "planning" / "v0.6.0-content-budget-accessible-name-gates.json"
E2E_PATH = ROOT / "apps" / "web" / "e2e" / "content-budget-accessibility.spec.ts"
COPY_BUDGET_CONTRACT_PATH = ROOT / "docs" / "planning" / "v0.6.0-terminology-copy-budgets.json"
COPY_DELETION_PATH = ROOT / "docs" / "planning" / "v0.6.0-copy-deletion-pass.json"

REQUIRED_BUDGET_CASES = {
    "dictate-ready-default": "default-dictate",
    "vocabulary-list-default": "ordinary-list-detail",
    "models-list-default": "ordinary-list-detail",
    "create-model-current-step": "wizard-step",
    "settings-index-default": "ordinary-list-detail",
}

REQUIRED_PRIMARY_ACTIONS = {
    ("/", "Install model"),
    ("/", "Hold to speak"),
    ("/vocabulary", "New set"),
    ("/models", "New"),
    ("/models", "Import"),
    ("/models/import", "Choose file"),
    ("/models/local-profile/export", "Prepare export"),
    ("/settings/storage", "Delete all local speech data"),
    ("/settings/audio", "Start input test"),
    ("/settings/diagnostics", "Download support bundle"),
}

REQUIRED_ACCESSIBLE_NAME_ROUTES = {
    "/",
    "/vocabulary",
    "/models",
    "/models/new",
    "/models/import",
    "/models/local-profile/train",
    "/models/local-profile/results",
    "/models/local-profile/export",
    "/settings",
    "/settings/audio",
    "/settings/storage",
    "/settings/privacy",
    "/settings/shortcuts",
    "/settings/diagnostics",
    "/about",
}

REQUIRED_FORBIDDEN_TERMS = {
    "RNN-T",
    "CTC",
    "OPFS",
    "WER",
    "CER",
    "SNR",
    "VAD",
    "WASM",
    "WebGPU",
    "ONNX",
    "AudioWorklet",
    "checksum",
    "adapter",
    "worker-owned",
    "runtime worker",
    "execution provider",
}

JsonObject = dict[str, Any]


def load_gate() -> JsonObject:
    return json.loads(GATE_PATH.read_text(encoding="utf-8"))


def test_gate_artifact_shape_privacy_and_semantic_assertions() -> None:
    gate = load_gate()

    assert gate["schemaVersion"] == 1
    assert gate["release"] == "v0.6.0"
    assert gate["privacy"]["containsPrivateData"] is False
    assert gate["privacy"]["containsUserGeneratedContent"] is False
    assert "no audio" in gate["privacy"]["notes"]
    assert "screenshots" in gate["privacy"]["notes"]
    assert gate["semanticAssertionsOnly"] is True
    assert gate["screenshotTestsAreNotUsedAsAssertions"] is True


def test_critical_copy_budget_cases_are_bound_to_budget_contract() -> None:
    gate = load_gate()
    budget_contract = json.loads(COPY_BUDGET_CONTRACT_PATH.read_text(encoding="utf-8"))
    contract_budgets = {entry["surface"]: entry for entry in budget_contract["copyBudgets"]}

    cases = {case["id"]: case for case in gate["criticalCopyBudgetCases"]}
    assert set(cases) == set(REQUIRED_BUDGET_CASES)
    for case_id, surface in REQUIRED_BUDGET_CASES.items():
        case = cases[case_id]
        assert case["budgetSurface"] == surface
        assert case["selector"].startswith(".")
        assert case["exception"] is None
        assert (
            case["maxVisibleInterfaceWords"]
            <= contract_budgets[surface]["maxVisibleInterfaceWords"]
        )


def test_primary_actions_accessible_routes_and_forbidden_terms_are_complete() -> None:
    gate = load_gate()

    actions = {(entry["route"], entry["name"]) for entry in gate["primaryActionCases"]}
    assert REQUIRED_PRIMARY_ACTIONS.issubset(actions)

    assert set(gate["accessibleNameRoutes"]) == REQUIRED_ACCESSIBLE_NAME_ROUTES
    assert set(gate["defaultWorkflowRoutesForTerminologyScan"]).issubset(
        REQUIRED_ACCESSIBLE_NAME_ROUTES
    )
    assert REQUIRED_FORBIDDEN_TERMS.issubset(set(gate["forbiddenDefaultWorkflowTerms"]))


def test_semantic_e2e_implements_budget_name_action_and_terminology_checks() -> None:
    source = E2E_PATH.read_text(encoding="utf-8")

    assert "critical v0.6 surfaces stay within copy budgets" in source
    assert "critical primary actions have visible, accessible names" in source
    assert "interactive controls are named across task routes" in source
    assert "default workflows avoid unexplained internal terminology" in source
    assert "toHaveAccessibleName" in source
    assert "collectUnnamedControls" in source
    assert "countVisibleInterfaceWords" in source
    assert "seedInstalledBaseModel" in source
    assert "screenshot" not in source.lower()


def test_gate_builds_on_copy_deletion_pass_without_private_material() -> None:
    combined = "\n".join(
        [
            GATE_PATH.read_text(encoding="utf-8"),
            E2E_PATH.read_text(encoding="utf-8"),
            COPY_DELETION_PATH.read_text(encoding="utf-8"),
        ]
    )

    for fragment in [
        "BEGIN PRIVATE",
        "passphrase:",
        "storage/users/",
        ".wav",
        ".speechprofile",
        "speaker-001",
        "profile-001",
        "prompt-001",
    ]:
        assert fragment not in combined

    assert "docs/planning/v0.6.0-copy-deletion-pass.json" in str(COPY_DELETION_PATH)
