from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
INVENTORY_PATH = ROOT / "docs" / "planning" / "v0.6.0-ui-inventory.json"
ADR_PATH = ROOT / "docs" / "adr" / "0008-v0-6-0-ui-inventory-baseline.md"

REQUIRED_SCREEN_IDS = {
    "hero",
    "dictate-transcript",
    "vocabulary",
    "models",
    "offline-model",
    "diagnostics",
    "benchmark",
    "microphone-enrollment",
    "runtime-training",
    "roadmap",
}

REQUIRED_WORKFLOW_IDS = {
    "transcript-status",
    "model-lifecycle",
    "personal-models",
    "benchmark",
    "browser-training",
    "microphone-enrollment",
}

REQUIRED_ROUTE_TARGETS = {
    "/": "Dictate",
    "/#vocabulary-title": "Vocabulary",
    "/#personal-models-title": "Models",
    "/#diagnostics": "Diagnostics",
    "/#benchmark": "Diagnostics",
    "/#offline-model-title": "SetupModel",
    "/#microphone-title": "Models",
    "/#runtime-title": "Models",
}


def load_inventory() -> dict[str, object]:
    return json.loads(INVENTORY_PATH.read_text(encoding="utf-8"))


def test_v0_6_ui_inventory_metadata_and_summary_adr_exist() -> None:
    inventory = load_inventory()
    metadata = inventory["metadata"]

    assert metadata["baselineRelease"] == "v0.5.0"
    assert metadata["baselineCommit"] == "8e72dd120e41e69cc52458804fa8b8804e74b9bc"
    assert metadata["sourceIssue"] == "https://github.com/WilsonLe/speech/issues/211"

    adr = ADR_PATH.read_text(encoding="utf-8")
    assert "docs/planning/v0.6.0-ui-inventory.json" in adr
    assert "single route `/`" in adr
    assert "No private recordings" in adr


def test_v0_6_ui_inventory_covers_required_v0_5_surfaces() -> None:
    inventory = load_inventory()

    screen_ids = {screen["id"] for screen in inventory["screens"]}
    assert screen_ids >= REQUIRED_SCREEN_IDS

    workflow_ids = {workflow["id"] for workflow in inventory["workflowStates"]}
    assert workflow_ids >= REQUIRED_WORKFLOW_IDS

    route_targets = {
        route["currentRoute"]: route["v06Destination"] for route in inventory["routes"]
    }
    for route, destination in REQUIRED_ROUTE_TARGETS.items():
        assert route_targets[route] == destination

    assert len(inventory["stringInventory"]) >= 100
    assert len(inventory["actions"]) >= 12


def test_v0_6_ui_inventory_references_existing_sources_and_allowed_destinations() -> None:
    inventory = load_inventory()
    allowed_destinations = set(inventory["allowedV06Destinations"])
    referenced_paths: set[str] = set(inventory["sourceCoverage"])

    for collection_name in ("screens", "workflowStates"):
        for item in inventory[collection_name]:
            assert item["v06Destination"] in allowed_destinations
            for source_path in item["sourceFiles"]:
                referenced_paths.add(source_path)

    for route in inventory["routes"]:
        assert route["v06Destination"] in allowed_destinations
        assert route["plannedTreatment"].strip()

    for action in inventory["actions"]:
        assert action["v06Destination"] in allowed_destinations
        assert action["label"].strip()
        assert action["plannedTreatment"].strip()

    for source_path in referenced_paths:
        assert (ROOT / source_path).exists(), source_path


def test_v0_6_ui_string_inventory_has_required_classification_fields() -> None:
    inventory = load_inventory()
    allowed_destinations = set(inventory["allowedV06Destinations"])
    required_fields = {
        "id",
        "currentLocation",
        "currentText",
        "userNeed",
        "audience",
        "stateOrCondition",
        "visibility",
        "v06Destination",
        "proposedDisposition",
        "testOwner",
    }

    ids: set[str] = set()
    for entry in inventory["stringInventory"]:
        assert required_fields <= set(entry), entry
        assert entry["id"] not in ids
        ids.add(entry["id"])
        assert entry["currentText"].strip(), entry["id"]
        assert entry["userNeed"].strip(), entry["id"]
        assert entry["proposedDisposition"].strip(), entry["id"]
        assert entry["v06Destination"] in allowed_destinations, entry["id"]
        assert (ROOT / entry["currentLocation"]).exists(), entry["id"]

    hero_entries = [
        entry for entry in inventory["stringInventory"] if entry["id"].startswith("app.hero")
    ]
    assert hero_entries
    assert all(
        "Remove" in entry["proposedDisposition"]
        or "Delete" in entry["proposedDisposition"]
        or "Replace" in entry["proposedDisposition"]
        or "Move" in entry["proposedDisposition"]
        for entry in hero_entries
    )

    diagnostic_entries = [
        entry
        for entry in inventory["stringInventory"]
        if entry["visibility"] == "diagnostic" or entry["v06Destination"] == "Diagnostics"
    ]
    assert len(diagnostic_entries) >= 12


def test_v0_6_ui_inventory_has_no_unresolved_questions() -> None:
    inventory = load_inventory()
    assert inventory["unresolvedQuestions"] == []
