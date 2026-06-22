from __future__ import annotations

import json
from pathlib import Path

from speech_transcript_reference import (
    TranscriptFormatOptions,
    TranscriptVocabulary,
    format_transcript_text,
    render_transcript_from_token_ids,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
OUTPUT_PATH = REPO_ROOT / "test-data/expected/transcript-reference.json"

TOKENS = {
    "0": "<blk>",
    "1": "<sos/eos>",
    "2": "<unk>",
    "3": "▁xin",
    "4": "▁chào",
    "5": "▁Minh",
    "6": ".",
    "7": "▁cà",
    "8": "▁phê",
    "9": "▁sữa",
    "10": "▁đá",
    "11": "▁deploy",
    "12": "ment",
    "13": "▁xong",
    "14": "!",
    "15": "▁hôm",
    "16": "▁nay",
}

CASES = [
    {
        "id": "vi-greeting",
        "description": "Vietnamese greeting with punctuation and NFC diacritics.",
        "tokenIds": [0, 3, 4, 5, 6, 1],
    },
    {
        "id": "vi-coffee",
        "description": "Vietnamese words with multiple diacritics and ignored blank tokens.",
        "tokenIds": [7, 8, 9, 10, 0],
    },
    {
        "id": "mixed-technical-subword",
        "description": "Mixed Vietnamese/English-style technical term split across subword pieces.",
        "tokenIds": [15, 16, 11, 12, 13, 14],
    },
]

FORMAT_CASES = [
    {
        "id": "vi-percent-time-date",
        "input": (
            "hôm nay tăng hai mươi phần trăm lúc ba giờ mười lăm "
            "ngày hai mươi hai tháng sáu năm hai nghìn không trăm hai mươi sáu"
        ),
        "options": {"languageMode": "vi"},
    },
    {
        "id": "vi-currency-phone",
        "input": "phí hai mươi nghìn đồng số điện thoại không chín không một hai ba",
        "options": {"languageMode": "vi"},
    },
    {
        "id": "vi-spoken-command-opt-in",
        "input": "xin chào xuống dòng Minh",
        "options": {"languageMode": "vi", "spokenCommandsEnabled": True},
    },
    {
        "id": "mixed-preserve-english-casing",
        "input": "deploy API xong",
        "options": {"languageMode": "mixed"},
    },
    {
        "id": "verbatim-no-itn",
        "input": "hai mươi phần trăm",
        "options": {"languageMode": "vi", "verbatim": True},
    },
]


def build_fixture() -> dict[str, object]:
    vocabulary = TranscriptVocabulary(tokens=TOKENS, ignored_token_ids=(0, 1))
    cases = []
    for case in CASES:
        token_ids = case["tokenIds"]
        assert isinstance(token_ids, list)
        cases.append(
            {
                **case,
                "expectedText": render_transcript_from_token_ids(token_ids, vocabulary),
            }
        )
    format_cases = []
    for case in FORMAT_CASES:
        options = case["options"]
        assert isinstance(options, dict)
        format_cases.append(
            {
                **case,
                "expectedText": format_transcript_text(
                    str(case["input"]), _format_options_from_fixture(options)
                ).text,
            }
        )
    return {
        "schemaVersion": 1,
        "description": (
            "Synthetic transcript rendering and formatting parity fixtures; "
            "no audio or private transcripts."
        ),
        "tokenizer": {
            "wordBoundaryMarker": "▁",
            "ignoredTokenIds": [0, 1],
            "tokens": TOKENS,
        },
        "cases": cases,
        "formatCases": format_cases,
    }


def _format_options_from_fixture(options: dict[str, object]) -> TranscriptFormatOptions:
    return TranscriptFormatOptions(
        language_mode=str(options.get("languageMode", "auto")),
        formatting_enabled=bool(options.get("formattingEnabled", True)),
        spoken_commands_enabled=bool(options.get("spokenCommandsEnabled", False)),
        verbatim=bool(options.get("verbatim", False)),
    )


def main() -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(build_fixture(), indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
