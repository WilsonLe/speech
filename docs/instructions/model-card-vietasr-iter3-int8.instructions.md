---
description: 'Model card for the metadata-only VietASR Iteration 3 INT8 candidate pack.'
applyTo: 'apps/web/public/model-catalog.json,apps/web/public/model-packs/vietasr-iter3-int8/manifest.json,MODEL_LICENSES.md'
---

# VietASR Iteration 3 Vietnamese INT8 candidate model card

## Summary

- **Model ID:** `vietasr-iter3-int8`
- **Display name:** VietASR Iteration 3 Vietnamese INT8 candidate
- **Version:** `2025-07-24-e827965`
- **Languages:** Vietnamese (`vi`) only
- **Architecture label:** RNN-T-style encoder, predictor, and joiner ONNX graphs
- **Sample rate/features:** 16 kHz, 80-bin log-Mel features
- **Tokenizer:** 2,000-unit SentencePiece model with `▁` word-boundary marker
- **Repository status:** metadata-only catalog/manifest entry; production weights are not committed to Git

## Source and license provenance

- **Upstream source repository:** <https://github.com/zzasdf/VietASR>
- **Model files:** <https://huggingface.co/zzasdf/viet_iter3_pseudo_label>
- **Pinned revision:** `e827965a37aab92a4455566fac49c0e80a23afef`
- **Inspected license metadata:** Hugging Face model card declares `apache-2.0`; upstream GitHub repository is Apache-2.0.
- **Repository notice:** `MODEL_LICENSES.md` records the license and runtime-compatibility limitations.

The Apache-2.0 repository code license does not automatically cover third-party model files. Keep this model card and `MODEL_LICENSES.md` in sync before changing URLs, checksums, or public availability.

## Files referenced by the manifest

| File key             | External path                          | SHA-256                                                            |             Size |
| -------------------- | -------------------------------------- | ------------------------------------------------------------------ | ---------------: |
| `encoder`            | `exp/encoder-epoch-12-avg-8.int8.onnx` | `b3abdef7a660fea7faf5e076b3c7613b0fc98406707103784d018189bb522124` | 70,876,129 bytes |
| `predictor`          | `exp/decoder-epoch-12-avg-8.int8.onnx` | `0cf67da076d09c78b47c39de5fee80cb6608593db8eaf1b6ca9fd0d818220677` |  1,308,690 bytes |
| `joiner`             | `exp/joiner-epoch-12-avg-8.int8.onnx`  | `38ec49e1c18e4feb0cad4de13e25c83a866cf56f4a66f22e8ff579d591a69a46` |  1,033,417 bytes |
| `sentencepieceModel` | `data/Vietnam_bpe_2000_new/bpe.model`  | `289dbb44527c13c419ae3a4d8ce6a349f01a97f8777e69934a77e3692d2f10db` |    270,695 bytes |
| `tokens`             | `data/Vietnam_bpe_2000_new/tokens.txt` | `f536d03c2e95ebd2930cf0abec88e823bd17d3c1933da7ae6a82db3b80605e15` |     25,847 bytes |

## Intended use

Use this pack as a browser-runtime integration candidate for Vietnamese-only model lifecycle, checksum, ONNX Runtime Web loading, and transcript-parity experiments. It is not the final bilingual/code-switching model and is not yet a release-quality streaming transcription pack.

## Runtime compatibility status

- The inspected encoder graph exposes full-sequence `x` and `x_lens` inputs and `encoder_out`/`encoder_out_lens` outputs.
- The inspected encoder graph does **not** expose streaming cache tensors, so it must not be represented as low-latency streaming-ready until a compatible streaming export or adapter is validated.
- The public catalog sets `streamingReady: false` and labels the runtime status as `candidate`.
- Browser operator compatibility, memory behavior, transcript parity, and latency must be tested before publishing any headline performance or quality claims.

## Evaluation status

No repository-owned WER/CER, code-switch, latency, RTF, memory, or named-entity recall results are published for this candidate yet. Synthetic benchmark exports validate report plumbing only and must not be presented as model performance. Future evaluation reports must state hardware, OS, browser version, model version, provider, thread count, power state, dataset/license provenance, and whether measurements used real audio timestamps.

## Data and privacy notes

The repository does not commit training audio, pseudo-labels, production model weights, private recordings, or user transcripts for this pack. Model downloads are explicit lifecycle actions and are verified by size and SHA-256 before activation. Active transcription must not upload audio or transcript content.

## Known limitations

- Vietnamese-only; no English or code-switch support.
- Not streaming-cache compatible as currently inspected.
- No project-published accuracy or latency metrics.
- Third-party data provenance is inherited from upstream and must be reviewed before broader redistribution or commercial claims.
