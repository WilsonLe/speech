import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TOKEN_ROOT = ROOT / "packages" / "ui" / "src" / "tokens"
IMPACT_REPORT = ROOT / "docs" / "planning" / "v0.6.0-token-bundle-impact.json"
WEB_MAIN = ROOT / "apps" / "web" / "src" / "main.tsx"
WEB_GLOBAL_CSS = ROOT / "apps" / "web" / "src" / "styles" / "global.css"


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_semantic_token_files_cover_required_v0_6_categories() -> None:
    expected_files = {
        "spacing.css": [
            "--speech-space-1",
            "--speech-size-touch-target",
            "@media (width <= 44rem)",
        ],
        "typography.css": [
            "--speech-font-family-sans",
            "--speech-text-transcript",
            "--speech-line-body",
        ],
        "colour.css": [
            "--speech-color-surface-canvas",
            "--speech-focus-ring-color",
            "@media (forced-colors: active)",
        ],
        "motion.css": [
            "--speech-motion-enabled",
            "--speech-duration-standard",
            "@media (prefers-reduced-motion: reduce)",
        ],
        "elevation.css": [
            "--speech-shadow-panel",
            "--speech-layer-dialog",
            "@media (forced-colors: active)",
        ],
    }

    for file_name, required_fragments in expected_files.items():
        token_file = TOKEN_ROOT / file_name
        assert token_file.exists(), f"missing token file {file_name}"
        token_css = read_text(token_file)
        for fragment in required_fragments:
            assert fragment in token_css, f"{file_name} should include {fragment}"

    index_css = read_text(TOKEN_ROOT / "index.css")
    for file_name in expected_files:
        assert f"@import './{file_name}';" in index_css


def test_web_shell_imports_tokens_before_legacy_global_css() -> None:
    main_source = read_text(WEB_MAIN)
    assert "import '@speech/ui/tokens.css';" in main_source
    assert main_source.index("@speech/ui/tokens.css") < main_source.index("./styles/global.css")

    global_css = read_text(WEB_GLOBAL_CSS)
    assert "--panel: var(--speech-color-surface-panel);" in global_css
    assert "--accent: var(--speech-color-accent);" in global_css
    assert (
        "outline: var(--speech-focus-ring-width) solid var(--speech-focus-ring-color);"
        in global_css
    )


def test_token_bundle_impact_is_measured_and_css_only() -> None:
    report = json.loads(read_text(IMPACT_REPORT))
    assert report["schemaVersion"] == 1
    assert report["issue"] == 218
    assert report["accepted"] is True
    assert report["delta"]["cssBytes"] == report["delta"]["totalBytes"]
    assert report["delta"]["cssGzipBytes"] > 0
    assert report["delta"]["totalGzipBytes"] <= 2048
    assert "no runtime JavaScript dependency" in " ".join(report["notes"])
