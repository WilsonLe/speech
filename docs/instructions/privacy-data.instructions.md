---
description: 'Privacy, model licensing, and local data handling rules for speech.'
applyTo: 'apps/**,packages/**,model-packs/**,tools/**,training/**,MODEL_LICENSES.md,THIRD_PARTY_NOTICES.md'
---

# Privacy and data rules

- Audio and transcripts remain local unless the user explicitly exports them.
- No telemetry, remote logging, analytics, or crash uploads are enabled by default.
- During active transcription, do not fetch remote services; model downloads and app updates must be explicit lifecycle events outside active dictation.
- Enrollment recordings, speaker embeddings, adapters, and exported profiles are sensitive voice-biometric-like personal data.
- Never place private audio/transcripts/profile artifacts in logs, screenshots, fixtures, support bundles, or CI artifacts.
- Code license, model license, dataset license, and fixture license are separate release gates.
- Data-governance docs must state source, license/consent, speaker/source split policy, and redistribution rights before adding training audio, pseudo-labels, corpora, or derived weights.
- A few minutes of enrollment adapts a pretrained model; never describe it as training a new ASR base model from scratch.
