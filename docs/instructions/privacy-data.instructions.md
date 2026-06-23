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
- Custom-vocabulary prompt generation uses user-entered terms, aliases, and categories as local sensitive data; generated prompts must stay local by default, be shown for user review before recording, and not be committed as release fixtures or uploaded.
- Code license, model license, dataset license, and fixture license are separate release gates.
- Catalog research leads with unclear or `other` license metadata must stay blocked/non-installable and must not be downloaded by the PWA until redistribution and runtime compatibility are documented.
- Data-governance docs must state source, license/consent, speaker/source split policy, and redistribution rights before adding training audio, pseudo-labels, corpora, or derived weights.
- A few minutes of enrollment adapts a pretrained model; never describe it as training a new ASR base model from scratch.
