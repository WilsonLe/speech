from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
ROUTE_MAP_PATH = ROOT / "docs" / "planning" / "v0.6.0-route-map.json"
ADR_PATH = ROOT / "docs" / "adr" / "0013-v0-6-0-route-map-and-legacy-redirects.md"

EXPECTED_PRIMARY_DESTINATIONS = {
    "dictate": "/",
    "vocabulary": "/vocabulary",
    "models": "/models",
}

EXPECTED_APP_MENU_ROUTES = {
    "/settings",
    "/settings/audio",
    "/settings/storage",
    "/settings/privacy",
    "/settings/shortcuts",
    "/settings/diagnostics",
    "/about",
    "/setup/model",
}

EXPECTED_TARGET_ROUTES = {
    "/",
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
    "/setup/model",
}

EXPECTED_LEGACY_REDIRECTS = {
    None: "/",
    "offline-model-title": "/setup/model",
    "diagnostics": "/settings/diagnostics",
    "benchmark": "/settings/diagnostics",
    "personal-models-title": "/models",
    "vocabulary-title": "/vocabulary",
    "microphone-title": "/models/:profileId/enroll",
    "runtime-title": "/models/:profileId/train",
}

REQUIRED_SAFE_QUERY_KEYS = {
    "candidateId",
    "condition",
    "focus",
    "jobId",
    "language",
    "model",
    "profileId",
    "promptId",
    "replaceProfileId",
    "returnTo",
    "search",
    "section",
    "setId",
    "status",
    "vocabulary",
}

REQUIRED_RETURN_REJECTIONS = {
    "https://example.com",
    "//example.com/path",
    "javascript:alert(1)",
    "data:text/html,private",
    "../settings",
    "/\\evil",
    "/%2f%2fevil.example",
    "/models/%2e%2e/settings",
}

JsonObject = dict[str, Any]


def load_route_map() -> JsonObject:
    return json.loads(ROUTE_MAP_PATH.read_text(encoding="utf-8"))


def read_adr() -> str:
    return ADR_PATH.read_text(encoding="utf-8")


def test_route_map_shape_and_privacy_flags() -> None:
    route_map = load_route_map()

    assert route_map["schemaVersion"] == 1
    assert route_map["release"] == "v0.6.0"
    assert route_map["privacy"]["containsPrivateData"] is False
    assert route_map["privacy"]["containsUserGeneratedContent"] is False
    assert "placeholders, not real identifiers" in route_map["privacy"]["notes"]
    assert "telemetry" in route_map["privacy"]["notes"]


def test_primary_destinations_are_exactly_dictate_vocabulary_models() -> None:
    route_map = load_route_map()
    destinations = {entry["id"]: entry["route"] for entry in route_map["primaryDestinations"]}

    assert destinations == EXPECTED_PRIMARY_DESTINATIONS
    assert [entry["label"] for entry in route_map["primaryDestinations"]] == [
        "Dictate",
        "Vocabulary",
        "Models",
    ]
    assert sum(1 for entry in route_map["primaryDestinations"] if entry["defaultRoute"]) == 1
    assert all(entry["persistentNavigation"] for entry in route_map["primaryDestinations"])


def test_application_menu_and_target_routes_match_plan() -> None:
    route_map = load_route_map()
    app_menu_routes = {entry["route"] for entry in route_map["applicationMenuDestinations"]}
    target_routes = {entry["path"] for entry in route_map["targetRoutes"]}

    assert app_menu_routes == EXPECTED_APP_MENU_ROUTES
    assert target_routes == EXPECTED_TARGET_ROUTES
    assert len(route_map["targetRoutes"]) == len(EXPECTED_TARGET_ROUTES)

    route_by_path = {entry["path"]: entry for entry in route_map["targetRoutes"]}
    assert route_by_path["/models/:profileId/enroll"]["routeParams"] == ["profileId"]
    assert "promptId" in route_by_path["/models/:profileId/enroll"]["queryParams"]
    assert route_by_path["/models/:profileId/train"]["routeParams"] == ["profileId"]
    assert "jobId" in route_by_path["/models/:profileId/train"]["queryParams"]
    assert route_by_path["/vocabulary/:setId"]["routeParams"] == ["setId"]
    assert "worker" in route_by_path["/models/import"]["workerBoundary"].lower()
    assert "worker" in route_by_path["/models/:profileId/export"]["workerBoundary"].lower()


def test_every_target_route_has_focus_scroll_and_worker_boundary() -> None:
    route_map = load_route_map()

    for route in route_map["targetRoutes"]:
        assert route["id"]
        assert route["path"].startswith("/")
        assert route["title"]
        assert route["screenKind"]
        assert route["destination"]
        assert route["ownsState"]
        assert route["focusTarget"]
        assert route["scrollRestoration"]
        assert route["workerBoundary"]


def test_legacy_v0_5_anchor_redirect_table_is_complete() -> None:
    route_map = load_route_map()
    redirects = {entry["legacyHash"]: entry for entry in route_map["legacyRedirects"]}

    assert {hash_value: entry["targetRoute"] for hash_value, entry in redirects.items()} == (
        EXPECTED_LEGACY_REDIRECTS
    )
    assert redirects["offline-model-title"]["alternateTargetRoute"] == "/settings/storage"
    assert redirects["microphone-title"]["alternateTargetRoute"] == "/settings/audio"
    assert redirects["runtime-title"]["alternateTargetRoute"] == "/settings/diagnostics"
    assert redirects["benchmark"]["appendQuery"] == {"section": "benchmark"}

    for entry in route_map["legacyRedirects"]:
        assert entry["legacyPath"] == "/"
        assert entry["preserveHash"] is False
        assert "returnTo" in entry["preserveQueryKeys"] or entry["legacyHash"] is None
        assert entry["focusAfterRedirect"]
        assert entry["stateRestoration"]


def test_safe_query_state_preserves_ids_but_rejects_unknown_values() -> None:
    route_map = load_route_map()
    safe_query = route_map["safeQueryState"]

    assert set(safe_query["allowedKeys"]) == REQUIRED_SAFE_QUERY_KEYS
    assert set(safe_query["idKeys"]).issuperset(
        {"profileId", "setId", "jobId", "promptId", "candidateId"}
    )
    assert safe_query["preserveUnknownKeys"] is False
    assert safe_query["dropUnsafeValues"] is True
    assert safe_query["searchValueMaxLength"] <= 120
    assert safe_query["idValuePattern"] == "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$"
    assert "Domain stores remain authoritative" in safe_query["notes"]


def test_safe_return_target_contract_rejects_open_redirects() -> None:
    route_map = load_route_map()
    return_targets = route_map["safeReturnTargets"]

    assert return_targets["queryParam"] == "returnTo"
    assert set(return_targets["rejectedExamples"]) == REQUIRED_RETURN_REJECTIONS
    assert return_targets["allowedRootRoute"] == "/"
    assert set(return_targets["allowedInternalPrefixes"]) == {
        "/vocabulary",
        "/models",
        "/settings",
        "/about",
        "/setup/model",
    }
    rules_text = "\n".join(return_targets["rules"])
    for required_fragment in [
        "root route or same-origin relative paths under an allowed internal prefix",
        "absolute URLs",
        "protocol-relative URLs",
        "encoded slash/backslash traversal",
        "encoded or literal dot-dot segments",
        "JavaScript/data/blob/file schemes",
        "drop returnTo",
    ]:
        assert required_fragment in rules_text


def test_state_preservation_and_legacy_alias_lifetime_are_documented() -> None:
    route_map = load_route_map()
    state = route_map["statePreservation"]

    assert "profileId" in state["profileIds"]
    assert "setId" in state["vocabularySetIds"]
    assert "jobId" in state["jobIds"]
    assert "drop unknown or unsafe values" in state["safeQueryState"]
    assert "focus" in state["focusAndScroll"]
    assert "Recording" in state["activeWorkGuards"]
    assert "training" in state["activeWorkGuards"]
    assert route_map["legacyRouteRemoval"] == {
        "earliestRemovalRelease": "v0.8.0",
        "rule": route_map["legacyRouteRemoval"]["rule"],
    }
    assert "v0.5 hash-anchor aliases" in route_map["legacyRouteRemoval"]["rule"]


def test_route_map_adr_accepts_contract_and_preserves_boundaries() -> None:
    text = read_adr()

    assert text.startswith("# ADR: v0.6.0 route map and legacy redirects")
    assert "## Status\n\nAccepted" in text
    assert str(ROUTE_MAP_PATH.relative_to(ROOT)) in text
    assert "ADR 0010" in text
    assert "ADR 0011" in text
    assert "ADR 0012" in text
    assert "docs/planning/v0.6.0-ui-inventory.json" in text

    for route in EXPECTED_TARGET_ROUTES:
        assert route in text
    for legacy_hash in [hash_value for hash_value in EXPECTED_LEGACY_REDIRECTS if hash_value]:
        assert f"#{legacy_hash}" in text

    assert "same-origin relative path" in text
    assert "Domain storage remains authoritative" in text
    assert "does not change model, profile, vocabulary, training, import/export" in text
    assert "v0.8.0" in text


def test_route_map_contract_has_no_private_fixture_material() -> None:
    combined_text = ROUTE_MAP_PATH.read_text(encoding="utf-8") + "\n" + read_adr()

    forbidden_fragments = [
        "BEGIN PRIVATE",
        "passphrase:",
        "storage/users/",
        ".wav",
        ".speechprofile",
        "speaker-001",
        "profile-001",
        "prompt-001",
        "https://speech-amber-beta.vercel.app",
    ]
    for fragment in forbidden_fragments:
        assert fragment not in combined_text
