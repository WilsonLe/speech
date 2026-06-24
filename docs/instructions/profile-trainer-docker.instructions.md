---
description: 'Local Docker image and end-to-end workflow for the personal adapter trainer.'
applyTo: 'tools/profile-trainer/Dockerfile,.dockerignore,tools/profile-trainer/**,training/configs/personalization/**'
---

# Local profile-trainer Docker guide

The profile trainer runs locally against an explicit exported profile package and base-model manifest. The image must not include model weights, enrollment recordings, profile exports, transcripts, adapters, or generated trainer outputs at build time.

## Build the local image

Build from the repository root:

```bash
docker build \
  -f tools/profile-trainer/Dockerfile \
  -t speech-profile-trainer:local \
  .
```

The Dockerfile copies only the Python trainer package, the model-pack manifest validator needed by trainer validation, default personalization configs, and the Apache-2.0 code license into `/opt/speech`. `.dockerignore` excludes generated speech/model/profile artifacts from the build context.

For release publication, record the exact base image digest used by the build. Local development may override the base image for a security rebuild:

```bash
docker build \
  --build-arg PYTHON_IMAGE=python:3.11-slim-bookworm \
  -f tools/profile-trainer/Dockerfile \
  -t speech-profile-trainer:local \
  .
```

## Run with local-only privacy defaults

After the image is built, run trainer commands with a bind mount for only the working directory that contains the explicit user-approved profile export, base-model manifest, aggregate evaluation input, and output directory. Prefer `--network none` because the trainer does not need network access at runtime.

```bash
mkdir -p ./local-trainer-out

docker run --rm --network none \
  -u "$(id -u):$(id -g)" \
  -v "$PWD:/work" \
  speech-profile-trainer:local \
  validate \
  --profile /work/my-profile.speechprofile.json \
  --base-model-manifest /work/base-model-manifest.json \
  --json
```

Do not mount the user's home directory, browser profile directory, cloud-sync folder, or any path containing unrelated recordings. Do not paste exported profile JSON, raw transcripts, private vocabulary, or adapter bytes into issues, PRs, logs, screenshots, or support bundles.

## End-to-end command sequence

Use the same image for validation, dataset inspection, deterministic frozen-base adapter training, aggregate evaluation, and browser-compatible packaging:

```bash
# 1. Validate profile package, checksums, safe paths, and base-model identity.
docker run --rm --network none -u "$(id -u):$(id -g)" -v "$PWD:/work" \
  speech-profile-trainer:local \
  validate \
  --profile /work/my-profile.speechprofile.json \
  --base-model-manifest /work/base-model-manifest.json \
  --json

# 2. Inspect prompt-ID splits; repeated takes of the same prompt must stay in one split.
docker run --rm --network none -u "$(id -u):$(id -g)" -v "$PWD:/work" \
  speech-profile-trainer:local \
  describe-dataset \
  --profile /work/my-profile.speechprofile.json \
  --base-model-manifest /work/base-model-manifest.json \
  --json

# 3. Train only approved residual-adapter/speaker-conditioning parameters.
docker run --rm --network none -u "$(id -u):$(id -g)" -v "$PWD:/work" \
  speech-profile-trainer:local \
  train \
  --profile /work/my-profile.speechprofile.json \
  --base-model-manifest /work/base-model-manifest.json \
  --config /opt/speech/training/configs/personalization/default-adapter-trainer.json \
  --output-dir /work/local-trainer-out \
  --json

# 4. Evaluate aggregate personal/anchor metrics and apply the activation gate.
docker run --rm --network none -u "$(id -u):$(id -g)" -v "$PWD:/work" \
  speech-profile-trainer:local \
  evaluate \
  --evaluation /work/aggregate-evaluation-input.json \
  --training-metadata /work/local-trainer-out/training-metadata.json \
  --gate-config /opt/speech/training/configs/personalization/default-activation-gate.json \
  --output /work/local-trainer-out/evaluation-report.json \
  --json

# 5. Package only when the activation gate passes.
docker run --rm --network none -u "$(id -u):$(id -g)" -v "$PWD:/work" \
  speech-profile-trainer:local \
  package \
  --adapter /work/local-trainer-out/adapter.bin \
  --training-metadata /work/local-trainer-out/training-metadata.json \
  --evaluation-report /work/local-trainer-out/evaluation-report.json \
  --output /work/local-trainer-out/my-adapter.speechprofile.json \
  --display-name "My local adapter" \
  --json
```

The output adapter package is a sensitive explicit export. Import it into the PWA only after verifying that the profile/base-model identity and activation gate match the currently installed model.

## Publication checklist

Before publishing a local-trainer image tag or release note:

- rebuild from a clean checkout and record the image tag plus base image digest;
- run the repository validation gate and at least one local `docker build` plus `validate --json` smoke command;
- confirm `.dockerignore` still excludes raw audio, `.speechprofile*`, model weights, transcript JSONL, and generated outputs;
- confirm runtime docs use `--network none`, explicit bind mounts, and host UID/GID mapping;
- ensure guide examples refer to aggregate evaluation inputs and never include real transcripts, prompt text, private vocabulary, raw audio, or model weights.
