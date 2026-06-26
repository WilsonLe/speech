from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ADR_PATH = ROOT / "docs" / "adr" / "0010-v0-6-0-task-first-information-architecture.md"
INVENTORY_PATH = ROOT / "docs" / "planning" / "v0.6.0-ui-inventory.json"
BASELINE_METRICS_PATH = ROOT / "docs" / "planning" / "v0.6.0-baseline-task-metrics.json"

PRIMARY_DESTINATIONS = ["Dictate", "Vocabulary", "Models"]
APP_MENU_DESTINATIONS = [
    "Settings",
    "Storage",
    "Privacy",
    "Keyboard shortcuts",
    "Diagnostics",
    "About",
]
ROUTE_FAMILIES = [
    "/",
    "/setup/model",
    "/vocabulary",
    "/vocabulary/new",
    "/vocabulary/:setId",
    "/models",
    "/models/new",
    "/models/import",
    "/models/:profileId",
    "/models/:profileId/enroll",
    "/models/:profileId/train",
    "/models/:profileId/results",
    "/models/:profileId/export",
    "/settings",
    "/settings/audio",
    "/settings/storage",
    "/settings/privacy",
    "/settings/shortcuts",
    "/settings/diagnostics",
    "/about",
]


def read_adr() -> str:
    return ADR_PATH.read_text(encoding="utf-8")


def test_task_first_ia_adr_exists_and_uses_standard_sections() -> None:
    text = read_adr()

    assert text.startswith("# ADR: v0.6.0 task-first information architecture")
    assert "## Status\n\nAccepted" in text
    assert "## Context" in text
    assert "## Decision" in text
    assert "## Consequences" in text


def test_task_first_ia_adr_accepts_exactly_three_primary_destinations() -> None:
    text = read_adr()

    for destination in PRIMARY_DESTINATIONS:
        assert f"**{destination}**" in text

    assert "exactly three persistent primary destinations" in text
    assert "labels remain visible" in text
    assert "not icon-only" in text
    assert "No dashboard" in text
    assert "marketing-style home screen" in text
    assert "introductory carousel" in text


def test_task_first_ia_adr_maps_application_menu_destinations() -> None:
    text = read_adr()

    assert "The application menu owns low-frequency and app-wide destinations" in text
    for destination in APP_MENU_DESTINATIONS:
        assert f"**{destination}**" in text
    assert "install/update actions when applicable" in text
    assert "compact **Local** status indicator" in text
    assert "not a primary destination" in text


def test_task_first_ia_adr_records_route_ownership_and_redirect_intent() -> None:
    text = read_adr()

    for route in ROUTE_FAMILIES:
        assert f"`{route}`" in text

    assert "Legacy v0.5 route and anchor aliases must redirect" in text
    assert "preserving safe object IDs" in text
    assert "reject open redirects" in text
    assert "restore state from domain stores" in text


def test_task_first_ia_adr_preserves_domain_and_worker_contracts() -> None:
    text = read_adr()

    assert str(INVENTORY_PATH.relative_to(ROOT)) in text
    assert "ADR 0008" in text
    assert "ADR 0009" in text
    assert BASELINE_METRICS_PATH.exists()
    assert "does not change any domain schema" in text
    assert "worker protocol" in text
    assert "model-pack manifest" in text
    assert "profile manifest" in text
    assert "portable model format" in text
    assert "Heavy work remains in existing packages and workers" in text
    assert "onto the main thread" in text


def test_task_first_ia_adr_preserves_privacy_and_required_visibility() -> None:
    text = read_adr()

    assert "privacy/security contract" in text
    assert "required choices, blockers, privacy consequences" in text
    assert "destructive consequences" in text
    assert "recovery actions" in text
    assert "Diagnostics, benchmark details" in text
    assert "move out of default workflows" in text
    assert "rollback to the v0.5 application shell" in text
