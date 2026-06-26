from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ADR_PATH = ROOT / "docs" / "adr" / "0011-v0-6-0-progressive-disclosure-rules.md"

VISIBLE_REQUIREMENTS = [
    "screen title, current prompt, or current task",
    "one visually dominant primary action",
    "required fields and choices",
    "blocking errors and exact next recovery action",
    "destructive consequences and confirmation targets",
    "privacy consequences at recording, training, import, export, support-bundle, "
    "and deletion boundaries",
    "compatibility or activation-gate failures",
    "reload, checkpoint, or interrupted-work recovery",
]

DISCLOSED_DETAILS = [
    "model hashes",
    "tokenizer hashes",
    "storage paths",
    "detailed recording-quality measurements",
    "training loss",
    "complete benchmark tables",
    "advanced vocabulary weights",
    "low-frequency management actions",
]

PROHIBITIONS = [
    "nested accordions",
    "required fields or required blockers inside initially collapsed content",
    "essential information available only in a tooltip",
    "long forms in menus or dialogs",
    "submenu nesting",
    "icon-only primary navigation",
    "icon-only controls without accessible names",
    "destructive, privacy, import, compatibility, or training-failure information only in a toast",
]

COPY_BUDGETS = {
    "Default Dictate screen": "35 visible interface words",
    "Ordinary list/detail screen before disclosures": "80 visible interface words",
    "Wizard step": "45 visible interface words",
    "Empty state": "30 visible interface words",
    "Helper text": "100 characters or less",
    "Tooltip": "140 characters or less",
    "Status label": "40 characters or less",
    "Primary button": "one to four words",
}


def read_adr() -> str:
    return ADR_PATH.read_text(encoding="utf-8")


def test_progressive_disclosure_adr_exists_and_uses_standard_sections() -> None:
    text = read_adr()

    assert text.startswith("# ADR: v0.6.0 progressive-disclosure rules")
    assert "## Status\n\nAccepted" in text
    assert "## Context" in text
    assert "## Decision" in text
    assert "## Consequences" in text


def test_progressive_disclosure_adr_keeps_required_content_visible() -> None:
    text = read_adr()

    assert (
        "Keep the current task, required choice, blocker, consequence, recovery action, "
        "and primary next action visible" in text
    )
    for requirement in VISIBLE_REQUIREMENTS:
        assert requirement in text


def test_progressive_disclosure_adr_defines_optional_technical_detail() -> None:
    text = read_adr()

    assert "Hide or move by default when it is not required for the immediate task" in text
    for detail in DISCLOSED_DETAILS:
        assert detail in text


def test_progressive_disclosure_adr_defines_mechanism_boundaries() -> None:
    text = read_adr()

    assert "Use a **dedicated screen**" in text
    assert (
        "Enrollment, training, model import, model export, storage management, "
        "diagnostics, and delete-all-local-data are screens" in text
    )
    assert "Use a **single disclosure**" in text
    assert "Use a **menu**" in text
    assert "Use a **tooltip** only to supplement" in text
    assert "Use a **dialog** only for short confirmation" in text


def test_progressive_disclosure_adr_records_prohibitions() -> None:
    text = read_adr()

    assert "The v0.6 UI must not introduce" in text
    for prohibition in PROHIBITIONS:
        assert prohibition in text


def test_progressive_disclosure_adr_records_minimal_copy_rule_and_budgets() -> None:
    text = read_adr()

    assert "Every visible string must serve at least one user need" in text
    for surface, budget in COPY_BUDGETS.items():
        assert surface in text
        assert budget in text
    assert (
        "documented user, legal, privacy, accessibility, safety, licensing, or provenance need"
        in text
    )


def test_progressive_disclosure_adr_preserves_accessibility_privacy_and_worker_boundaries() -> None:
    text = read_adr()

    assert "Minimal UI must not become cryptic" in text
    assert "Hidden content must not remain focusable" in text
    assert "support keyboard operation" in text
    assert "restore focus predictably" in text
    assert "Privacy and security consequences must be visible" in text
    assert "Details may explain hashes, schemas, checksums, encryption parameters" in text
    assert "must not be hidden" in text
    assert "does not change worker ownership or domain contracts" in text
    assert "remain in existing packages/workers" in text


def test_progressive_disclosure_adr_links_to_prior_v0_6_decisions() -> None:
    text = read_adr()

    assert "ADR 0008" in text
    assert "ADR 0009" in text
    assert "ADR 0010" in text
    assert "exactly three persistent primary destinations" in text
    assert "ADR 0010 owns destination and route ownership" in text
