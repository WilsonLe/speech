from __future__ import annotations

import re
import unicodedata
from collections.abc import Mapping, Sequence
from dataclasses import dataclass


@dataclass(frozen=True)
class TranscriptVocabulary:
    tokens: Mapping[str, str]
    word_boundary_marker: str = "▁"
    ignored_token_ids: tuple[int, ...] = ()


@dataclass(frozen=True)
class TranscriptFormatOptions:
    language_mode: str = "auto"
    formatting_enabled: bool = True
    spoken_commands_enabled: bool = False
    verbatim: bool = False


@dataclass(frozen=True)
class TranscriptFormatResult:
    text: str
    language_mode: str
    applied_rules: tuple[str, ...]


_DIGIT_WORDS = {
    "không": 0,
    "một": 1,
    "mốt": 1,
    "hai": 2,
    "ba": 3,
    "bốn": 4,
    "tư": 4,
    "năm": 5,
    "lăm": 5,
    "sáu": 6,
    "bảy": 7,
    "tám": 8,
    "chín": 9,
}

_NUMBER_WORD_PATTERN = (
    r"(?:không|một|mốt|hai|ba|bốn|tư|năm|lăm|sáu|bảy|tám|chín|"
    r"mười|mươi|trăm|linh|lẻ|nghìn|ngàn|triệu)"
)
_NUMBER_PHRASE_PATTERN = rf"{_NUMBER_WORD_PATTERN}(?:\s+{_NUMBER_WORD_PATTERN})*"
_NUMBER_PHRASE_PATTERN_LAZY = rf"{_NUMBER_WORD_PATTERN}(?:\s+{_NUMBER_WORD_PATTERN})*?"
_DIGIT_WORD_PATTERN = r"(?:không|một|mốt|hai|ba|bốn|tư|năm|lăm|sáu|bảy|tám|chín)"
_DIGIT_PHRASE_PATTERN = rf"{_DIGIT_WORD_PATTERN}(?:\s+{_DIGIT_WORD_PATTERN})*"


def render_transcript_from_token_ids(
    token_ids: Sequence[int], vocabulary: TranscriptVocabulary
) -> str:
    ignored = set(vocabulary.ignored_token_ids)
    pieces: list[str] = []
    for token_id in token_ids:
        _validate_token_id(token_id)
        if token_id in ignored:
            continue
        piece = vocabulary.tokens.get(str(token_id))
        if piece is None:
            raise ValueError(f"Missing transcript token piece for token id {token_id}.")
        pieces.append(piece)
    return detokenize_pieces(pieces, word_boundary_marker=vocabulary.word_boundary_marker)


def detokenize_pieces(pieces: Sequence[str], *, word_boundary_marker: str = "▁") -> str:
    if not word_boundary_marker:
        raise ValueError("word_boundary_marker must not be empty.")

    output = ""
    for piece in pieces:
        if not piece:
            continue
        if piece.startswith(word_boundary_marker):
            word_start = piece[len(word_boundary_marker) :]
            if not word_start:
                continue
            if output:
                output += " "
            output += word_start
        else:
            output += piece
    return normalize_vietnamese_text(output)


def format_transcript_text(
    text: str, options: TranscriptFormatOptions | None = None
) -> TranscriptFormatResult:
    resolved = options or TranscriptFormatOptions()
    formatted = normalize_vietnamese_text(text)
    applied_rules = ["unicode-nfc"]
    if resolved.verbatim or not resolved.formatting_enabled:
        return TranscriptFormatResult(
            text=formatted,
            language_mode=resolved.language_mode,
            applied_rules=tuple(applied_rules),
        )

    formatted = _collapse_whitespace(formatted)
    applied_rules.append("whitespace")
    if resolved.spoken_commands_enabled:
        next_text = _apply_spoken_commands(formatted)
        if next_text != formatted:
            applied_rules.append("spoken-commands")
        formatted = next_text

    formatted, itn_rules = _apply_vietnamese_itn(formatted)
    applied_rules.extend(itn_rules)
    return TranscriptFormatResult(
        text=formatted,
        language_mode=resolved.language_mode,
        applied_rules=tuple(applied_rules),
    )


def normalize_vietnamese_text(text: str) -> str:
    return unicodedata.normalize("NFC", text)


def parse_vietnamese_number_phrase(phrase: str) -> int | None:
    tokens = [token for token in normalize_vietnamese_text(phrase).lower().split() if token]
    if not tokens:
        return None
    return _parse_vietnamese_number_tokens(tokens)


def _apply_vietnamese_itn(text: str) -> tuple[str, tuple[str, ...]]:
    applied: set[str] = set()
    formatted = _replace_number_phrase_before_unit(
        text,
        "phần trăm",
        lambda value: f"{value}%",
        lambda: applied.add("vi-percent"),
    )
    formatted = _replace_decimal_phrases(formatted, applied)
    formatted = _replace_currency_phrases(formatted, applied)
    formatted = _replace_date_phrases(formatted, applied)
    formatted = _replace_time_phrases(formatted, applied)
    formatted = _replace_phone_phrases(formatted, applied)
    return formatted, tuple(applied)


def _replace_number_phrase_before_unit(text: str, unit: str, render, on_applied) -> str:
    pattern = re.compile(rf"\b({_NUMBER_PHRASE_PATTERN})\s+{re.escape(unit)}\b", re.I)

    def replace(match: re.Match[str]) -> str:
        value = parse_vietnamese_number_phrase(match.group(1))
        if value is None:
            return match.group(0)
        on_applied()
        return render(value) if unit == "phần trăm" else f"{render(value)} {unit}"

    return pattern.sub(replace, text)


def _replace_decimal_phrases(text: str, applied: set[str]) -> str:
    pattern = re.compile(
        rf"\b({_NUMBER_PHRASE_PATTERN})\s+phẩy\s+({_DIGIT_PHRASE_PATTERN})\b", re.I
    )

    def replace(match: re.Match[str]) -> str:
        integer = parse_vietnamese_number_phrase(match.group(1))
        fraction = _parse_vietnamese_digit_sequence(match.group(2))
        if integer is None or fraction is None:
            return match.group(0)
        applied.add("vi-decimal")
        return f"{integer},{fraction}"

    return pattern.sub(replace, text)


def _replace_currency_phrases(text: str, applied: set[str]) -> str:
    pattern = re.compile(rf"\b({_NUMBER_PHRASE_PATTERN})\s+(nghìn|ngàn|triệu)?\s*đồng\b", re.I)

    def replace(match: re.Match[str]) -> str:
        value = parse_vietnamese_number_phrase(match.group(1))
        if value is None:
            return match.group(0)
        magnitude = match.group(2)
        multiplier = 1_000_000 if magnitude == "triệu" else 1_000 if magnitude else 1
        applied.add("vi-currency")
        return f"{_format_vietnamese_integer(value * multiplier)} đồng"

    return pattern.sub(replace, text)


def _replace_date_phrases(text: str, applied: set[str]) -> str:
    with_year_pattern = re.compile(
        rf"\bngày\s+({_NUMBER_PHRASE_PATTERN_LAZY})\s+tháng\s+"
        rf"({_NUMBER_PHRASE_PATTERN_LAZY})\s+năm\s+({_NUMBER_PHRASE_PATTERN})\b",
        re.I,
    )
    without_year_pattern = re.compile(
        rf"\bngày\s+({_NUMBER_PHRASE_PATTERN_LAZY})\s+tháng\s+({_NUMBER_PHRASE_PATTERN})\b",
        re.I,
    )

    def replace_with_year(match: re.Match[str]) -> str:
        replacement = _render_date(match.group(0), match.group(1), match.group(2), match.group(3))
        if replacement != match.group(0):
            applied.add("vi-date")
        return replacement

    def replace_without_year(match: re.Match[str]) -> str:
        replacement = _render_date(match.group(0), match.group(1), match.group(2))
        if replacement != match.group(0):
            applied.add("vi-date")
        return replacement

    return without_year_pattern.sub(
        replace_without_year, with_year_pattern.sub(replace_with_year, text)
    )


def _render_date(
    fallback: str, day_phrase: str, month_phrase: str, year_phrase: str | None = None
) -> str:
    day = parse_vietnamese_number_phrase(day_phrase)
    month = parse_vietnamese_number_phrase(month_phrase)
    year = parse_vietnamese_number_phrase(year_phrase) if year_phrase else None
    if day is None or month is None or not (1 <= day <= 31) or not (1 <= month <= 12):
        return fallback
    return f"{day}/{month}" if year is None else f"{day}/{month}/{year}"


def _replace_time_phrases(text: str, applied: set[str]) -> str:
    pattern = re.compile(
        rf"\b({_NUMBER_PHRASE_PATTERN})\s+giờ(?:\s+({_NUMBER_PHRASE_PATTERN}))?\b", re.I
    )

    def replace(match: re.Match[str]) -> str:
        hour = parse_vietnamese_number_phrase(match.group(1))
        minute = parse_vietnamese_number_phrase(match.group(2)) if match.group(2) else 0
        if hour is None or minute is None or hour > 23 or minute > 59:
            return match.group(0)
        applied.add("vi-time")
        return f"{hour}:{minute:02d}"

    return pattern.sub(replace, text)


def _replace_phone_phrases(text: str, applied: set[str]) -> str:
    pattern = re.compile(rf"\b(số điện thoại|điện thoại)\s+({_NUMBER_PHRASE_PATTERN})\b", re.I)

    def replace(match: re.Match[str]) -> str:
        digits = _parse_vietnamese_digit_sequence(match.group(2))
        if digits is None or len(digits) < 3:
            return match.group(0)
        applied.add("vi-phone")
        return f"{match.group(1)} {digits}"

    return pattern.sub(replace, text)


def _apply_spoken_commands(text: str) -> str:
    text = re.sub(r"\b(?:xuống dòng|new line)\b", "\n", text, flags=re.I)
    text = re.sub(r"[ \t]*\n[ \t]*", "\n", text)
    return text.strip()


def _collapse_whitespace(text: str) -> str:
    return re.sub(r"[ \t\r\n]+", " ", text).strip()


def _parse_vietnamese_digit_sequence(phrase: str) -> str | None:
    tokens = [token for token in normalize_vietnamese_text(phrase).lower().split() if token]
    if not tokens:
        return None
    output = ""
    for token in tokens:
        digit = _DIGIT_WORDS.get(token)
        if digit is None:
            return None
        output += str(digit)
    return output


def _parse_vietnamese_number_tokens(tokens: Sequence[str]) -> int | None:
    if "triệu" in tokens:
        index = len(tokens) - 1 - list(reversed(tokens)).index("triệu")
        left = _parse_vietnamese_number_tokens(tokens[:index])
        right = _parse_vietnamese_number_tokens(tokens[index + 1 :])
        if left is None:
            return None
        return left * 1_000_000 + (right or 0)

    thousand_indexes = [index for index, token in enumerate(tokens) if token in {"nghìn", "ngàn"}]
    if thousand_indexes:
        index = thousand_indexes[-1]
        left_tokens = tokens[:index]
        right_tokens = tokens[index + 1 :]
        left = 1 if not left_tokens else _parse_vietnamese_number_tokens(left_tokens)
        right = _parse_vietnamese_number_tokens(right_tokens)
        if left is None:
            return None
        return left * 1_000 + (right or 0)

    return _parse_under_one_thousand(tokens)


def _parse_under_one_thousand(tokens: Sequence[str]) -> int | None:
    if not tokens:
        return None
    if "trăm" in tokens:
        index = tokens.index("trăm")
        hundreds = 1 if index == 0 else _parse_digit_token(tokens[index - 1])
        if hundreds is None:
            return None
        remainder = _parse_under_one_hundred(tokens[index + 1 :])
        return hundreds * 100 + (remainder or 0)
    return _parse_under_one_hundred(tokens)


def _parse_under_one_hundred(tokens: Sequence[str]) -> int | None:
    filtered = [token for token in tokens if token not in {"linh", "lẻ"}]
    if not filtered:
        return 0
    if len(filtered) == 1:
        return _parse_digit_token(filtered[0])
    if filtered[0] == "mười":
        ones = 0 if len(filtered) == 1 else _parse_digit_token(filtered[1])
        return None if ones is None else 10 + ones
    if filtered[1] == "mươi":
        tens = _parse_digit_token(filtered[0])
        ones = 0 if len(filtered) == 2 else _parse_digit_token(filtered[2])
        if tens is None or ones is None:
            return None
        return tens * 10 + ones
    return None


def _parse_digit_token(token: str | None) -> int | None:
    if token is None:
        return None
    return _DIGIT_WORDS.get(token)


def _format_vietnamese_integer(value: int) -> str:
    return f"{value:,}".replace(",", ".")


def _validate_token_id(token_id: int) -> None:
    if not isinstance(token_id, int) or token_id < 0:
        raise ValueError(f"Transcript token id {token_id} must be a non-negative integer.")
