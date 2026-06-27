import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONTRACT_PATH = ROOT / "docs/planning/v0.6.0-component-gallery-contract.json"
ADR_PATH = ROOT / "docs/adr/0014-v0-6-0-component-gallery-and-usage-docs.md"
ROUTE_PATH = ROOT / "apps/web/src/app/component-gallery-route.ts"
APP_PATH = ROOT / "apps/web/src/app/App.tsx"
GALLERY_PATH = ROOT / "apps/web/src/app/ComponentGallery.tsx"
GALLERY_TEST_PATH = ROOT / "apps/web/src/app/component-gallery.test.tsx"

EXPECTED_PRIMITIVES = {
    "Accordion",
    "Button",
    "Dialog",
    "Disclosure",
    "EmptyState",
    "IconButton",
    "InlineError",
    "LoadingState",
    "MenuButton",
    "Notice",
    "Progress",
    "RadioGroup",
    "Select",
    "Status",
    "Toast",
    "Tooltip",
}


def load_contract() -> dict:
    return json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))


def test_component_gallery_contract_records_dev_only_route_and_bundle_impact() -> None:
    contract = load_contract()

    assert contract["schemaVersion"] == 1
    assert contract["issue"] == 225
    assert contract["route"]["hash"] == "#ui-gallery"
    assert contract["route"]["availability"] == "development-only"
    assert contract["route"]["defaultLinkedFromProductionNavigation"] is False
    assert contract["route"]["productionCriticalPath"] is False
    assert "import.meta.env.DEV" in contract["route"]["loader"]

    bundle = contract["bundleImpact"]
    assert bundle["preChangeJsCssBytes"] == 930939
    assert bundle["postChangeJsCssBytes"] == 931206
    assert bundle["deltaBytes"] == 267
    assert bundle["deltaBytes"] <= bundle["deltaBudgetBytes"]
    assert bundle["productionGalleryChunkPresent"] is False
    assert bundle["criticalDictatePathImpact"] == "route-helper-only"


def test_component_gallery_contract_covers_all_current_primitives() -> None:
    contract = load_contract()
    documented = set(contract["documentedPrimitiveFamilies"])

    assert documented == EXPECTED_PRIMITIVES
    assert len(documented) == 16
    assert contract["privacyRules"]["syntheticFixturesOnly"] is True
    assert contract["privacyRules"]["noTelemetry"] is True

    forbidden = set(contract["privacyRules"]["forbiddenFixtureContent"])
    assert {
        "personal audio",
        "transcripts",
        "private vocabulary terms",
        "profile IDs",
        "prompt IDs",
        "feature tensors",
        "checkpoints",
        "adapter weights",
        "storage paths",
        "passphrases",
    } <= forbidden


def test_component_gallery_usage_rules_keep_required_content_visible() -> None:
    contract = load_contract()
    rules = "\n".join(
        contract["componentUseRules"]
        + contract["accessibilityConstraints"]
        + contract["contentStyleRules"]
    )

    assert "Required actions" in rules
    assert "privacy consequences" in rules
    assert "destructive consequences" in rules
    assert "recovery text" in rules
    assert "outside tooltips" in rules
    assert "Menus contain temporary action/navigation lists only" in rules
    assert "Dialogs remain short blocking decisions" in rules
    assert "Technical implementation terms belong in diagnostics" in rules


def test_route_and_app_gate_gallery_to_development_hash_route() -> None:
    route_source = ROUTE_PATH.read_text(encoding="utf-8")
    app_source = APP_PATH.read_text(encoding="utf-8")

    assert "componentGalleryHashRoute = '#ui-gallery'" in route_source
    assert "isDevelopment" in route_source
    assert "reason: 'development-route'" in route_source
    assert "reason: 'not-development'" in route_source
    assert "reason: 'different-route'" in route_source

    assert "import.meta.env.DEV ? lazy(() => import('./ComponentGallery')) : null" in app_source
    assert "shouldRenderComponentGalleryRoute" in app_source
    assert "ComponentGallery" in app_source
    assert "Suspense" in app_source


def test_gallery_source_and_unit_test_enforce_synthetic_privacy_boundary() -> None:
    gallery_source = GALLERY_PATH.read_text(encoding="utf-8")
    unit_test_source = GALLERY_TEST_PATH.read_text(encoding="utf-8")

    assert "speechPrimitiveAccessibilityExamples" in gallery_source
    assert "Usage rules" in gallery_source
    assert "Content style" in gallery_source
    assert "Accessibility constraints" in gallery_source
    assert "Keep examples synthetic and task-focused" in gallery_source
    assert (
        "Required actions, blockers, privacy consequences, destructive consequences"
        in gallery_source
    )
    assert "outside tooltips, menus, toasts, and collapsed panels" in gallery_source

    for primitive in EXPECTED_PRIMITIVES:
        assert primitive in unit_test_source

    assert "profile-" in unit_test_source
    assert "prompt-" in unit_test_source
    assert "feature tensor" in unit_test_source
    assert "adapter weight" in unit_test_source
    assert "private vocabulary" in unit_test_source
    assert "sk-[A-Za-z0-9]{20,}" in unit_test_source


def test_adr_accepts_nonproduction_gallery_and_references_contract() -> None:
    adr = ADR_PATH.read_text(encoding="utf-8")

    assert "Status: Accepted" in adr
    assert "Issue: #225" in adr
    assert "#ui-gallery" in adr
    assert "development-only" in adr
    assert "import.meta.env.DEV" in adr
    assert "do not emit a gallery chunk" in adr
    assert "docs/planning/v0.6.0-component-gallery-contract.json" in adr
    assert "must not import domain workers" in adr
    assert "Production build measurement" in adr
    assert "+267" in adr
