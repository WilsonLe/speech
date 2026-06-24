# Test Data Licenses

This directory is reserved for small redistribution-safe fixtures only.

Do not add private recordings, production corpora, unknown-license audio, or generated transcripts without explicit provenance and license review.

## Synthetic transcript parity fixture

`test-data/expected/transcript-reference.json` is generated from hand-authored synthetic token pieces in `tools/transcript-reference/generate_transcript_reference.py`. It contains no recordings, corpus excerpts, private transcripts, or production model output, and is distributed under the repository's Apache-2.0 code license.

## Synthetic enrollment sentence-bank fixture

`test-data/expected/enrollment-sentence-bank.json` contains project-authored prompt text used to validate the enrollment sentence-bank schema. It contains no recordings, corpus excerpts, private transcripts, production model output, or user enrollment data, and is distributed under the repository's Apache-2.0 code license.
