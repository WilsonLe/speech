---
description: 'Benchmark report, diagnostics export, and performance measurement rules.'
applyTo: 'packages/benchmark/**,packages/inference/src/personal-adapter.ts,apps/web/src/app/BenchmarkPanel.tsx,apps/web/src/app/ModelRuntimePanel.tsx,apps/web/src/workers/benchmark*.ts,apps/web/e2e/benchmark-diagnostics.spec.ts'
---

# Benchmark and diagnostics export rules

- Keep benchmark report schemas UI-independent in `@speech/benchmark`; UI code may render/export reports but must not own the contract.
- Run repeatable benchmark work in a dedicated worker, not on the main UI thread. The main thread may start runs, display progress, and download JSON.
- Benchmark/diagnostics exports are local JSON downloads. Do not upload reports by default and do not include audio, transcript text, private profile data, secrets, or model weights.
- Label synthetic benchmarks clearly. Synthetic worker timing can validate export plumbing and queue/timing math, but headline performance gates require real model packs on declared reference hardware.
- Include privacy flags, environment metadata, timing summaries, queue depth, audio overrun counts, RTF, provider/thread metadata when available, and interpretation warnings in exported reports.
- Measure hard performance gates from audio timestamps when real audio/model benchmarks are added; CI synthetic/browser timings are informational unless run on designated reference hardware.
- Custom-term benchmark exports must report recall and false insertion separately with explicit numerator/denominator scores. Recall uses recalled expected custom-term matches over expected custom-term matches; false insertion uses unexpected custom-term matches over emitted custom-term matches. Keep fixtures synthetic and export aggregate counts/case IDs only, not transcript text, phrases, aliases, or private vocabulary.
- Held-out base-vs-profile profile-evaluation reports should use explicit numerator/denominator rates for WER, CER, switch-boundary error, custom-term recall, alias recall, and false insertions per 100 non-target utterances; latency and RTF values should remain aggregate summaries and never include raw prompt text, audio, or profile artifacts.
- Adapter runtime benchmarks should report only aggregate timing/RTF overhead, provider/thread metadata, adapter size/checksum, and privacy flags; never export adapter weights, raw profile JSON, enrollment audio, transcripts, or private vocabulary.
