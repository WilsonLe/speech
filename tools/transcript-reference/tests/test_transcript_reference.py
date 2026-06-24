from __future__ import annotations

import json
from pathlib import Path

import pytest
from speech_transcript_reference import (
    TranscriptFormatOptions,
    TranscriptVocabulary,
    detokenize_pieces,
    format_transcript_text,
    parse_vietnamese_number_phrase,
    render_transcript_from_token_ids,
)

REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURE_PATH = REPO_ROOT / "test-data/expected/transcript-reference.json"


def load_fixture() -> dict[str, object]:
    return json.loads(FIXTURE_PATH.read_text())


def test_fixture_expected_text_matches_python_reference() -> None:
    fixture = load_fixture()
    tokenizer = fixture["tokenizer"]
    assert isinstance(tokenizer, dict)
    vocabulary = TranscriptVocabulary(
        tokens=tokenizer["tokens"],
        word_boundary_marker=tokenizer["wordBoundaryMarker"],
        ignored_token_ids=tuple(tokenizer["ignoredTokenIds"]),
    )

    cases = fixture["cases"]
    assert isinstance(cases, list)
    for case in cases:
        assert isinstance(case, dict)
        assert (
            render_transcript_from_token_ids(case["tokenIds"], vocabulary) == case["expectedText"]
        )


def test_fixture_format_cases_match_python_reference() -> None:
    fixture = load_fixture()
    cases = fixture["formatCases"]
    assert isinstance(cases, list)
    for case in cases:
        assert isinstance(case, dict)
        options = case["options"]
        assert isinstance(options, dict)
        result = format_transcript_text(
            case["input"],
            TranscriptFormatOptions(
                language_mode=options.get("languageMode", "auto"),
                formatting_enabled=options.get("formattingEnabled", True),
                spoken_commands_enabled=options.get("spokenCommandsEnabled", False),
                verbatim=options.get("verbatim", False),
            ),
        )
        assert result.text == case["expectedText"]


def test_vietnamese_formatter_basic_itn() -> None:
    assert (
        format_transcript_text(
            "hôm nay tăng hai mươi phần trăm lúc ba giờ mười lăm",
            TranscriptFormatOptions(language_mode="vi"),
        ).text
        == "hôm nay tăng 20% lúc 3:15"
    )
    assert parse_vietnamese_number_phrase("hai nghìn không trăm hai mươi sáu") == 2026


def test_detokenize_pieces_preserves_nfc_vietnamese_text() -> None:
    decomposed = "ca\u0300"

    assert detokenize_pieces(["▁" + decomposed, "▁phê"]) == "cà phê"


def test_reference_rejects_invalid_tokens() -> None:
    vocabulary = TranscriptVocabulary(tokens={"1": "▁xin"})

    with pytest.raises(ValueError, match="Missing transcript token piece"):
        render_transcript_from_token_ids([2], vocabulary)
    with pytest.raises(ValueError, match="non-negative"):
        render_transcript_from_token_ids([-1], vocabulary)
    with pytest.raises(ValueError, match="empty"):
        detokenize_pieces(["▁xin"], word_boundary_marker="")
