# ADR: v0.6.0 baseline task metrics and screenshots

## Status

Accepted

## Context

`v0.6.0` needs a task-first redesign baseline before implementation changes the web UI. Issue #211 captured the v0.5 route, screen, action, workflow-state, and string inventory. Issue #212 adds task-level evidence for the 11 baseline tasks named in the v0.6 plan.

The v0.5.0 release commit is `8e72dd120e41e69cc52458804fa8b8804e74b9bc`. The screenshot capture ran after #211 merged at `47dc6d65b80f4acb63c248b3e1c20830dc06514d`; #211 was docs/test-only and did not change the web UI baseline.

## Decision

Commit the baseline task metrics as structured JSON at:

- `docs/planning/v0.6.0-baseline-task-metrics.json`

The JSON records, for each required task:

- completion path;
- pointer click count;
- keystroke count;
- wrong-turn count;
- accessibility obstacles;
- qualitative observations;
- privacy flags; and
- screenshot artifact metadata.

Screenshots were captured locally with Playwright/Chromium against a production build using fake microphone input and synthetic vocabulary/profile data. The PNG files are intentionally not committed. Instead, the JSON records each screenshot file name, local `/tmp` path, byte size, viewport, element bounding box, and SHA-256 checksum.

The local artifact directory used for this issue was:

- `/tmp/speech-v0.6-baseline-212/screenshots/`

This keeps the repository free of binary screenshot growth while still documenting that baseline screenshots were captured. Future agents can regenerate comparable screenshots from the current v0.5 baseline path if needed.

## Consequences

- The baseline metrics are local audit observations, not a moderated usability study.
- Later usability-study issues must collect participant evidence separately; this ADR must not be treated as satisfying the v0.6 usability gates.
- No telemetry, remote analytics, private audio, private transcript, private vocabulary, or real profile data was used.
- The screenshots may contain synthetic fake-microphone capture state, a synthetic vocabulary term, and a synthetic exported profile created during the capture run.
- Static validation in `training/tests/test_v0_6_baseline_task_metrics.py` keeps the manifest complete, privacy-safe, and tied to the 11 required tasks.
