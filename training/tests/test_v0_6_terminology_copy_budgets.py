from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
CONTRACT_PATH = ROOT / "docs" / "planning" / "v0.6.0-terminology-copy-budgets.json"
ADR_PATH = ROOT / "docs" / "adr" / "0012-v0-6-0-terminology-and-copy-budgets.md"

EXPECTED_TERMINOLOGY = {
    "Personal Voice Model": "Voice model",
    "P1 speaker/channel profile": "Voice profile",
    "P2 adapter": "Personal model",
    "Base RNN-T model": "Speech model",
    "Contextual bias vocabulary": "Vocabulary",
    "Training companion pack": "Training support files",
    "Activation gate": "Quality check",
    "Generic anchor evaluation": "General speech check",
    "Projected voice condition": "Loud",
    "Execution provider": "Processing mode",
    "OPFS": "Device storage",
}

EXPECTED_COPY_BUDGETS = {
    "default-dictate": {"maxVisibleInterfaceWords": 35},
    "ordinary-list-detail": {"maxVisibleInterfaceWords": 80},
    "wizard-step": {"maxVisibleInterfaceWords": 45},
    "empty-state": {"maxVisibleInterfaceWords": 30},
    "helper-text": {"maxCharacters": 100, "maxSentences": 1},
    "tooltip": {"maxCharacters": 140, "mayContainRequiredInformation": False},
    "status-label": {"maxCharacters": 40},
    "primary-button": {"minWords": 1, "maxWords": 4, "startsWithVerb": True},
    "recoverable-error": {
        "maxSentences": 1,
        "requiresRecoveryAction": True,
        "technicalDetailDisclosedSeparately": True,
    },
}

EXPECTED_USER_NEEDS = {
    "identify-destination-or-control",
    "state-action-available-now",
    "state-required-choice",
    "communicate-state-or-progress",
    "explain-consequence-risk-or-privacy-boundary",
    "explain-recovery-action",
    "satisfy-accessibility-legal-licensing-or-provenance-requirement",
}

EXPECTED_EXCEPTION_REASONS = {
    "user-need",
    "legal",
    "privacy",
    "accessibility",
    "safety",
    "licensing",
    "provenance",
}

EXPECTED_EXCEPTION_FIELDS = {
    "surface",
    "budget",
    "measuredCountOrLength",
    "reason",
    "owner",
    "testOrReviewReference",
}


JsonObject = dict[str, Any]


def load_contract() -> JsonObject:
    return json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))


def read_adr() -> str:
    return ADR_PATH.read_text(encoding="utf-8")


def test_terminology_copy_budget_contract_shape_and_privacy() -> None:
    contract = load_contract()

    assert contract["schemaVersion"] == 1
    assert contract["release"] == "v0.6.0"
    assert contract["privacy"] == {
        "containsPrivateData": False,
        "containsUserGeneratedContent": False,
        "notes": contract["privacy"]["notes"],
    }
    assert "no audio" in contract["privacy"]["notes"]
    assert "telemetry" in contract["privacy"]["notes"]
    assert "participant evidence" in contract["privacy"]["notes"]


def test_terminology_map_has_expected_default_ui_terms() -> None:
    contract = load_contract()
    terminology = {
        entry["technicalConcept"]: entry["defaultUiTerm"] for entry in contract["terminology"]
    }

    assert terminology == EXPECTED_TERMINOLOGY
    for entry in contract["terminology"]:
        assert entry["technicalDetailTerm"]
        assert entry["notes"]


def test_default_technical_terms_are_explicitly_constrained() -> None:
    contract = load_contract()
    constrained_terms = set(contract["technicalTermsAllowedByDefaultOnlyWhenUserProvided"])

    assert {"RNN-T", "CTC", "OPFS", "WER", "CER", "SNR", "VAD", "WASM", "WebGPU"}.issubset(
        constrained_terms
    )


def test_copy_budgets_match_progressive_disclosure_adr() -> None:
    contract = load_contract()
    budgets = {entry["surface"]: entry for entry in contract["copyBudgets"]}

    assert set(budgets) == set(EXPECTED_COPY_BUDGETS)
    for surface, expected in EXPECTED_COPY_BUDGETS.items():
        for key, value in expected.items():
            assert budgets[surface][key] == value


def test_user_need_and_writing_rules_are_complete() -> None:
    contract = load_contract()

    assert set(contract["visibleStringUserNeeds"]) == EXPECTED_USER_NEEDS
    writing_rules = "\n".join(contract["writingRules"])
    assert "Use sentence case." in writing_rules
    assert "Start action buttons with verbs." in writing_rules
    assert "Do not blame the user." in writing_rules
    assert "Preserve Vietnamese diacritics" in writing_rules
    assert "Do not silently rename user data" in writing_rules


def test_copy_budget_exception_process_is_documented() -> None:
    contract = load_contract()
    exception_process = contract["exceptionProcess"]

    assert set(exception_process["allowedReasons"]) == EXPECTED_EXCEPTION_REASONS
    assert set(exception_process["requiredFields"]) == EXPECTED_EXCEPTION_FIELDS
    assert (
        "documented next to the changed screen test, ADR, or issue evidence"
        in exception_process["rule"]
    )


def test_terminology_copy_budget_adr_accepts_contract() -> None:
    text = read_adr()

    assert text.startswith("# ADR: v0.6.0 terminology map and copy budgets")
    assert "## Status\n\nAccepted" in text
    assert str(CONTRACT_PATH.relative_to(ROOT)) in text
    assert "docs/planning/v0.6.0-ui-inventory.json" in text
    assert "ADR 0010" in text
    assert "ADR 0011" in text

    for technical, default in EXPECTED_TERMINOLOGY.items():
        assert technical in text
        assert default in text

    for surface in ["Default Dictate screen", "Wizard step", "Tooltip", "Recoverable error"]:
        assert surface in text

    assert (
        "documented user, legal, privacy, accessibility, safety, licensing, or provenance need"
        in text
    )
    assert "does not change any model, profile, vocabulary, training, import/export" in text


def test_adr_and_contract_do_not_contain_private_fixture_material() -> None:
    combined_text = CONTRACT_PATH.read_text(encoding="utf-8") + "\n" + read_adr()

    forbidden_fragments = [
        "BEGIN PRIVATE",
        "passphrase:",
        "storage/users/",
        ".wav",
        ".speechprofile",
        "speaker-001",
        "profile-001",
        "prompt-001",
    ]
    for fragment in forbidden_fragments:
        assert fragment not in combined_text
