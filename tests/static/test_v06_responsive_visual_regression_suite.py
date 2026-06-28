import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
MATRIX_PATH = REPO_ROOT / "docs/planning/v0.6.0-responsive-visual-regression-suite.json"
SPEC_PATH = REPO_ROOT / "apps/web/e2e/responsive-visual-regression.spec.ts"

REQUIRED_VIEWPORTS = {
    (360, 800),
    (768, 1024),
    (1024, 768),
    (1366, 768),
    (1440, 900),
    (1920, 1080),
}
REQUIRED_STATE_CATEGORIES = {
    "default",
    "loading",
    "recording",
    "error",
    "empty",
    "active",
    "paused",
    "incompatible",
    "completed",
}
REQUIRED_RESPONSIVE_ROUTES = {
    "/",
    "/vocabulary",
    "/models",
    "/models/new",
    "/models/import",
    "/models/local-enrollment-profile/export",
    "/models/local-enrollment-profile/results",
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


def test_visual_matrix_covers_required_viewports_states_and_routes() -> None:
    matrix = load_matrix()
    assert matrix["schemaVersion"] == 1
    assert matrix["issue"] == 252
    assert matrix["artifactPolicy"]["committedScreenshots"] is False
    assert matrix["artifactPolicy"]["mode"] == "runtime-playwright-attachments"
    assert "Synthetic/local fixtures only" in matrix["artifactPolicy"]["privacy"]

    viewports = {(item["width"], item["height"]) for item in matrix["referenceViewports"]}
    assert viewports == REQUIRED_VIEWPORTS

    categories = {item["category"] for item in matrix["requiredStates"]}
    assert categories == REQUIRED_STATE_CATEGORIES
    assert len(matrix["requiredStates"]) == len(REQUIRED_STATE_CATEGORIES)

    routes = set(matrix["responsiveRoutes"])
    assert REQUIRED_RESPONSIVE_ROUTES.issubset(routes)
    assert matrix["artifactPolicy"]["residualGaps"]


def test_visual_e2e_implements_matrix_without_committed_snapshots() -> None:
    spec = SPEC_PATH.read_text(encoding="utf-8")
    matrix = load_matrix()

    assert "test.describe('v0.6 responsive visual regression matrix'" in spec
    assert "testInfo.attach(`visual-${state.id}-${viewport.id}.png`" in spec
    assert "assertNoDocumentHorizontalOverflow" in spec
    assert "assertTargetIsNotCoveredByMobileNavigation" in spec
    assert "toHaveScreenshot" not in spec

    for state in matrix["requiredStates"]:
        assert state["id"] in spec
    for route in REQUIRED_RESPONSIVE_ROUTES:
        assert route in spec or route in json.dumps(matrix["responsiveRoutes"])


def test_visual_artifacts_do_not_commit_private_or_binary_screenshots() -> None:
    forbidden_extensions = {".png", ".jpg", ".jpeg", ".webp"}
    committed_visual_paths = [
        path
        for path in (REPO_ROOT / "docs").rglob("*v0.6*visual*")
        if path.suffix.lower() in forbidden_extensions
    ]
    committed_visual_paths.extend(
        path
        for path in (REPO_ROOT / "apps/web/e2e").rglob("*visual*")
        if path.suffix.lower() in forbidden_extensions
    )
    assert committed_visual_paths == []

    matrix_text = MATRIX_PATH.read_text(encoding="utf-8").lower()
    for forbidden in ["transcript text", "raw audio", "adapter weights", "profile payload"]:
        assert forbidden not in matrix_text
