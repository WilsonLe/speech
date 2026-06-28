import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MATRIX_PATH = ROOT / "docs/planning/v0.6.0-manual-accessibility-matrix.json"
E2E_PATH = ROOT / "apps/web/e2e/manual-accessibility-matrix.spec.ts"

REQUIRED_MATRIX_ROWS = {
    "keyboard-only-chrome",
    "keyboard-only-edge",
    "nvda-chrome",
    "nvda-edge",
    "voiceover-safari-macos",
    "forced-colours",
    "zoom-text-scaling-200",
}

REQUIRED_EVIDENCE = {
    "axe-critical-serious-required-routes",
    "keyboard-focus-chromium",
    "forced-colours-chromium",
    "two-hundred-percent-text-scaling",
    "live-region-restraint",
    "no-hover-only-required-actions",
}

REQUIRED_ROUTES = {
    "/",
    "/vocabulary",
    "/models",
    "/models/new",
    "/models/local-enrollment-profile/train",
    "/models/local-enrollment-profile/results",
    "/models/import",
    "/models/local-enrollment-profile/export",
    "/settings",
    "/settings/audio",
    "/settings/storage",
    "/settings/privacy",
    "/settings/shortcuts",
    "/settings/diagnostics",
    "/about",
}


def load_matrix() -> dict:
    return json.loads(MATRIX_PATH.read_text(encoding="utf-8"))


def test_manual_accessibility_matrix_has_required_rows_and_evidence() -> None:
    matrix = load_matrix()

    assert matrix["schemaVersion"] == 1
    assert matrix["release"] == "v0.6.0"
    assert matrix["artifact"] == "manual-accessibility-matrix"

    evidence = matrix["localAutomatedEvidence"]["checks"]
    evidence_ids = {entry["id"] for entry in evidence}
    assert REQUIRED_EVIDENCE <= evidence_ids
    assert all(entry["status"] == "pass" for entry in evidence)

    rows = matrix["assistiveTechnologyMatrix"]
    row_ids = {entry["id"] for entry in rows}
    assert REQUIRED_MATRIX_ROWS <= row_ids

    allowed_statuses = {"pass", "accepted-limitation"}
    for row in rows:
        assert row["status"] in allowed_statuses
        assert row["evidence"], row["id"]
        assert set(row["evidence"]) <= evidence_ids
        if row["status"] == "accepted-limitation":
            assert row["acceptedLimitations"], row["id"]
            assert any(
                token in " ".join(row["acceptedLimitations"]).lower()
                for token in ("not available", "external", "manual")
            )


def test_matrix_routes_and_privacy_flags_are_complete() -> None:
    matrix = load_matrix()

    assert set(matrix["routeFixtures"]) == REQUIRED_ROUTES

    privacy = matrix["privacy"]
    assert privacy == {
        "usesSyntheticFixturesOnly": True,
        "storesPersonalAudio": False,
        "storesTranscripts": False,
        "storesPrivateVocabulary": False,
        "storesScreenshots": False,
        "networkTelemetryAdded": False,
    }

    outcomes = "\n".join(matrix["requiredOutcomes"]).lower()
    for phrase in (
        "zero critical or serious axe-core violations",
        "no keyboard trap",
        "no focused element obscured",
        "no required action available only by hover",
        "live regions announce concise state changes",
        "external at limitations are explicit",
    ):
        assert phrase in outcomes


def test_playwright_matrix_spec_locks_required_checks() -> None:
    source = E2E_PATH.read_text(encoding="utf-8")

    for phrase in (
        "AxeBuilder",
        "critical",
        "serious",
        "forcedColors: 'active'",
        "font-size: 200%",
        "assertNoKeyboardTrapOrObscuredFocus",
        "live regions are restrained",
        "not hover-only",
    ):
        assert phrase in source

    assert "screenshot" not in source.lower()
    assert "recording.webm" not in source
