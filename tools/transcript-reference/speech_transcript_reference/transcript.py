from __future__ import annotations

import unicodedata
from collections.abc import Mapping, Sequence
from dataclasses import dataclass


@dataclass(frozen=True)
class TranscriptVocabulary:
    tokens: Mapping[str, str]
    word_boundary_marker: str = "▁"
    ignored_token_ids: tuple[int, ...] = ()


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
    return unicodedata.normalize("NFC", output)


def _validate_token_id(token_id: int) -> None:
    if not isinstance(token_id, int) or token_id < 0:
        raise ValueError(f"Transcript token id {token_id} must be a non-negative integer.")
