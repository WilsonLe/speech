---
description: 'Privacy, model licensing, and local data handling rules for speech.'
applyTo: 'apps/**,packages/**,model-packs/**,tools/**,training/**,MODEL_LICENSES.md,THIRD_PARTY_NOTICES.md'
---

# Privacy and data rules

- Audio and transcripts remain local unless the user explicitly exports them.
- No telemetry, remote logging, analytics, or crash uploads are enabled by default.
- During active transcription, do not fetch remote services; model downloads and app updates must be explicit lifecycle events outside active dictation.
- Enrollment recordings, speaker embeddings, adapters, and exported profiles are sensitive voice-biometric-like personal data; follow `docs/instructions/voice-profile-threat-model.instructions.md` for threat-model reviews and release gates.
- Persist enrollment audio only after explicit user acceptance/save into private profile storage; never use localStorage/IndexedDB for raw voice data, and keep delete-all voice-data flows local and deterministic.
- Never place private audio/transcripts/profile artifacts in logs, screenshots, fixtures, support bundles, or CI artifacts.
- Base-vs-profile evaluation reports may be exported only as aggregate local metrics with privacy flags; omit prompt text, raw audio, raw embeddings, profile files, and model weights.
- Profile export/import must be explicit user action, local-only, checksummed, and visibly sensitive because exported packages can include enrollment recordings, prompt text, microphone metadata, and derived profile files; deletion must clear stored raw and derived files plus active-profile pointers.
- Local trainer dataset loaders may read exported enrollment audio and prompt text only from explicit user-provided profile packages, must not print or fixture private content, and must keep train/validation/test leakage checks local to the user machine.
- Local trainer adapter metadata may include aggregate split counts, hashes, losses, adapter checksums, and software/config provenance, but must not include raw audio, prompt/reference transcript text, full profile JSON, base weights, or private vocabulary strings.
- Adapter evaluation and activation-gate reports may include aggregate WER/CER/custom-term/false-insertion/RTF metrics, adapter size/checksum, and pass/fail checks only; omit raw audio, transcripts, case IDs, private vocabulary strings, full profile JSON, and model weights.
- Personal adapter packages are explicit sensitive exports; they may include adapter weights and a profile manifest, but must omit raw audio, transcripts, case IDs, full enrollment profile JSON, and base model weights while preserving checksum/base-model compatibility metadata.
- `SpeechProfileManifestV2` migration and `browser-top-adapter` adaptation are metadata-only; the manifest must never carry raw audio, transcripts, frozen-feature values, checkpoints, or optimizer state, and the copy-on-write V1->V2 migration must not rewrite or convert existing CLI residual adapters. Browser adapter weight file refs are voice-derived sensitive data and follow the same export/import/deletion boundaries as other adapter artifacts.
- Browser-training spikes may inspect package metadata, export maps, public type declarations, and aggregate capability flags only; they must not persist or upload raw audio, transcripts, frozen features, profile contents, or adapter bytes.
- Model manifest V3 browser-training contracts are public compatibility metadata only. They may name tensors, file keys, licenses, provenance, algorithm IDs, and limits, but must not contain user recordings, transcripts, frozen-feature values, checkpoints, adapter weights, private vocabulary terms, or profile-derived artifacts.
- Browser-training prototypes may emit aggregate loss/parameter/checksum metadata and non-sensitive synthetic fixtures; private frozen features or profile-derived datasets must stay worker-local/OPFS-local and must not appear in logs, screenshots, fixtures, telemetry, or exports unless explicitly packaged by the user.
- Browser-training checkpoints can contain adapter weights derived from frozen features. The public UI prototype may persist synthetic checkpoints in browser-local storage for reload recovery, but private/profile checkpoints must remain in dedicated worker/profile-owned storage and must not be logged, screenshotted, uploaded, or treated as activated profiles.
- Browser-vs-Python adapter comparison exports may include aggregate metric deltas, activation-gate flags, adapter checksums/sizes, and base-model compatibility only; omit transcript text, case IDs, frozen-feature values, profile JSON, adapter weights, raw audio, and private vocabulary strings.
- Local trainer Docker images must not bake exported profiles, raw recordings, transcripts, adapter outputs, aggregate evaluation inputs, or model weights into image layers; runtime examples should prefer `--network none`, narrow bind mounts, and host UID/GID mapping.
- Custom-vocabulary prompt generation uses user-entered terms, aliases, and categories as local sensitive data; generated prompts must stay local by default, be shown for user review before recording, and not be committed as release fixtures or uploaded.
- Code license, model license, dataset license, and fixture license are separate release gates.
- Catalog research leads with unclear or `other` license metadata must stay blocked/non-installable and must not be downloaded by the PWA until redistribution and runtime compatibility are documented.
- Data-governance docs must state source, license/consent, speaker/source split policy, and redistribution rights before adding training audio, pseudo-labels, corpora, or derived weights.
- A few minutes of enrollment adapts a pretrained model; never describe it as training a new ASR base model from scratch.
