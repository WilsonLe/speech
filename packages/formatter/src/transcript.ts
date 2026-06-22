export interface TranscriptVocabulary {
  readonly tokens: Readonly<Record<string, string>>;
  readonly wordBoundaryMarker?: string;
  readonly ignoredTokenIds?: readonly number[];
}

export interface TranscriptRenderOptions {
  readonly vocabulary: TranscriptVocabulary;
  readonly tokenIds: readonly number[];
}

export function renderTranscriptFromTokenIds(options: TranscriptRenderOptions): string {
  const ignoredTokenIds = new Set(options.vocabulary.ignoredTokenIds ?? []);
  const pieces: string[] = [];
  for (const tokenId of options.tokenIds) {
    validateTokenId(tokenId);
    if (ignoredTokenIds.has(tokenId)) continue;
    const piece = options.vocabulary.tokens[tokenId.toString()];
    if (piece === undefined) {
      throw new Error(`Missing transcript token piece for token id ${tokenId.toString()}.`);
    }
    pieces.push(piece);
  }
  return detokenizePieces(pieces, {
    wordBoundaryMarker: options.vocabulary.wordBoundaryMarker ?? '▁',
  });
}

export interface DetokenizePiecesOptions {
  readonly wordBoundaryMarker?: string;
}

export function detokenizePieces(
  pieces: readonly string[],
  options: DetokenizePiecesOptions = {},
): string {
  const wordBoundaryMarker = options.wordBoundaryMarker ?? '▁';
  if (wordBoundaryMarker.length === 0) {
    throw new Error('wordBoundaryMarker must not be empty.');
  }

  let output = '';
  for (const piece of pieces) {
    if (piece.length === 0) continue;
    if (piece.startsWith(wordBoundaryMarker)) {
      const wordStart = piece.slice(wordBoundaryMarker.length);
      if (wordStart.length === 0) continue;
      if (output.length > 0) output += ' ';
      output += wordStart;
    } else {
      output += piece;
    }
  }
  return output.normalize('NFC');
}

function validateTokenId(tokenId: number): void {
  if (!Number.isInteger(tokenId) || tokenId < 0) {
    throw new Error(`Transcript token id ${String(tokenId)} must be a non-negative integer.`);
  }
}
