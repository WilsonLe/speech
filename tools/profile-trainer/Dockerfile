# syntax=docker/dockerfile:1

ARG PYTHON_IMAGE=python:3.11-slim-bookworm
FROM ${PYTHON_IMAGE}

LABEL org.opencontainers.image.title="speech profile trainer"
LABEL org.opencontainers.image.description="Local-only personal residual-adapter trainer CLI for wilsonle/speech"
LABEL org.opencontainers.image.licenses="Apache-2.0"
LABEL org.opencontainers.image.source="https://github.com/WilsonLe/speech"

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/opt/speech/tools/profile-trainer:/opt/speech/tools/model-pack

WORKDIR /work

RUN groupadd --system speech \
    && useradd --system --gid speech --home-dir /nonexistent --no-create-home speech

COPY LICENSE /opt/speech/LICENSE
COPY tools/profile-trainer/speech_profile_trainer /opt/speech/tools/profile-trainer/speech_profile_trainer
COPY tools/model-pack/speech_model_pack /opt/speech/tools/model-pack/speech_model_pack
COPY training/configs/personalization /opt/speech/training/configs/personalization

RUN python -m compileall -q /opt/speech/tools/profile-trainer/speech_profile_trainer /opt/speech/tools/model-pack/speech_model_pack \
    && chown -R speech:speech /opt/speech

USER speech
ENTRYPOINT ["python", "-m", "speech_profile_trainer"]
CMD ["--help"]
