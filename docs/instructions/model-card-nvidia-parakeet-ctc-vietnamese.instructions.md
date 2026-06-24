---
description: 'Model card for the blocked NVIDIA Parakeet CTC Vietnamese research candidate.'
applyTo: 'apps/web/public/model-catalog.json,MODEL_LICENSES.md,docs/instructions/model-card-nvidia-parakeet-ctc-vietnamese.instructions.md'
---

# NVIDIA Parakeet CTC Vietnamese research candidate model card

## Summary

- **Model ID:** `nvidia-parakeet-ctc-vietnamese-research`
- **Display name:** NVIDIA Parakeet CTC Vietnamese research candidate
- **Catalog version:** `2026-06-hf-metadata-review`
- **Verified languages:** Vietnamese (`vi`) only from inspected public metadata
- **Architecture label:** NeMo/FastConformer CTC checkpoint from upstream metadata
- **Repository status:** blocked catalog research intake; no manifest URL, no manifest checksum, and no weights committed to Git

## Source and license provenance

- **Model card / files:** <https://huggingface.co/nvidia/parakeet-ctc-0.6b-Vietnamese>
- **Inspected metadata:** Hugging Face metadata reports `library_name: nemo`, `pipeline_tag: automatic-speech-recognition`, tags including `Nemo`, `ASR`, `Pytorch`, `FastConformer`, `Parakeet`, `CTC`, `vi`, and `license:other`.
- **Observed artifact class:** large `.nemo` checkpoint artifacts and supporting documentation, not a repository-owned browser model pack.
- **Repository notice:** `MODEL_LICENSES.md` records that redistribution and release use are not cleared for this app.

A public model card or downloadable checkpoint does not by itself establish redistribution rights, browser runtime compatibility, or suitability for this project's local-first PWA. Keep this model card and `MODEL_LICENSES.md` in sync before changing catalog status, URLs, license wording, or public availability.

## Intended use

Use this entry only as a documented research lead for the v0.2.0 bilingual/code-switch roadmap. It gives contributors a visible record of the investigated upstream candidate while preventing accidental installation or runtime claims.

## Runtime compatibility status

- This entry is **not installable** and has no manifest v2 file.
- The inspected public metadata describes a CTC NeMo/FastConformer checkpoint, not this repository's RNN-T encoder/predictor/joiner graph contract.
- No browser-ready ONNX Runtime Web artifact, streaming cache tensor contract, tokenizer contract, or model-pack checksum set has been verified.
- English and Vietnamese-English code-switch support are not verified from the inspected metadata; the catalog lists only Vietnamese to avoid overclaiming.
- The PWA must render this entry as blocked and must not expose inspect/install actions that would fetch model artifacts.

## Evaluation status

No repository-owned WER/CER, mixed-language, code-switch boundary, latency, RTF, memory, contextual-bias, or named-entity recall results are published for this candidate. Synthetic benchmark exports validate report plumbing only and must not be presented as candidate-model performance.

## Data and privacy notes

The repository does not commit upstream checkpoint files, training data, private recordings, or transcripts for this candidate. Because the catalog entry is blocked, the app shell must not download or cache the candidate's upstream artifacts. If this lead is revisited, license clearance, manifest v2 packaging, graph-contract validation, browser compatibility, and no-network active-transcription tests are required before installability changes.

## Known limitations

- Not a joint Vietnamese/English/code-switch model pack verified for this app.
- Not an RNN-T streaming graph package.
- License metadata is `other` and not release-cleared for redistribution by this project.
- No manifest/checksum/runtime contract exists in this repository.
- No project-published accuracy or latency metrics.
