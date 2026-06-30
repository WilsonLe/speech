---
description: 'Troubleshoot production dictation E2E failures where model install succeeds but fake-microphone recording produces an empty transcript.'
applyTo: 'apps/web/e2e/production-dictation.spec.ts,apps/web/src/app/TranscriptPanel.tsx,apps/web/src/workers/asr.worker.ts,packages/decoder/**,packages/features/**,packages/model-manager/**'
---

# Troubleshooting production dictation empty transcript

- First separate setup/download failures from ASR failures: inspect `production-model-install-state.json` for redacted model requests, request failures, and progress samples before investigating transcript output.
- If Dictate reaches the ready state and fake microphone recording completes but the transcript stays empty, verify `TranscriptPanel` creates `createAsrWorker()`, sends `START_UTTERANCE`, transfers `AUDIO_CHUNK` PCM buffers, and sends `END_UTTERANCE` with the same utterance id.
- Verify the ASR worker reads installed model bytes only through `@speech/model-manager` storage, creates encoder/predictor/joiner ONNX sessions inside the worker, resamples fake-mic PCM to the manifest sample rate, extracts log-Mel features, greedily decodes RNN-T logits, and detokenizes token pieces before emitting `FINAL`.
- Use a short deterministic generated phrase for the production smoke. English Flite TTS is not Vietnamese-native; short phrases such as `viet nam` are more stable than longer or diacritic-dependent text.
- Keep the production dictation smoke opt-in with `SPEECH_PRODUCTION_DICTATION_E2E=1`; normal CI/dev runs must skip it and must not seed or intercept model downloads.
- Do not commit generated WAVs, model files, browser profiles, signed model URLs, raw audio, or transcript artifacts. Redact signed URL query strings in failure attachments.
