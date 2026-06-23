---
description: 'Troubleshooting local profile-trainer Docker image build and runtime import failures.'
applyTo: 'tools/profile-trainer/Dockerfile,.dockerignore,tools/profile-trainer/**'
---

# Profile-trainer Docker troubleshooting

- Symptom: `docker run ... speech-profile-trainer:<tag> --help` fails with `ModuleNotFoundError: No module named 'speech_model_pack'`.
- Root cause: `speech_profile_trainer.validation` imports the model-pack manifest validator, so the Docker image must copy `tools/model-pack/speech_model_pack` and include `/opt/speech/tools/model-pack` in `PYTHONPATH`.
- Fix: keep `tools/profile-trainer/Dockerfile` copying both `tools/profile-trainer/speech_profile_trainer` and `tools/model-pack/speech_model_pack`, then compile both directories.
- Verification: rebuild the image, run `docker run --rm --network none speech-profile-trainer:<tag> --help`, and run a `validate --json` smoke against a synthetic or user-approved profile package.
