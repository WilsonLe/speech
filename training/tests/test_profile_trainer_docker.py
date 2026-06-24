from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOCKERFILE = ROOT / "tools/profile-trainer/Dockerfile"
DOCKERIGNORE = ROOT / ".dockerignore"
GUIDE = ROOT / "docs/instructions/profile-trainer-docker.instructions.md"
README = ROOT / "README.md"


def test_profile_trainer_dockerfile_runs_cli_as_non_root_without_private_artifact_copies() -> None:
    dockerfile = DOCKERFILE.read_text(encoding="utf-8")

    assert "FROM ${PYTHON_IMAGE}" in dockerfile
    assert "PYTHONPATH=/opt/speech/tools/profile-trainer:/opt/speech/tools/model-pack" in dockerfile
    assert 'ENTRYPOINT ["python", "-m", "speech_profile_trainer"]' in dockerfile
    assert "USER speech" in dockerfile
    assert "COPY tools/profile-trainer/speech_profile_trainer" in dockerfile
    assert "COPY tools/model-pack/speech_model_pack" in dockerfile
    assert "COPY training/configs/personalization" in dockerfile
    assert "COPY ." not in dockerfile
    assert "ADD ." not in dockerfile
    assert "pip install" not in dockerfile


def test_profile_trainer_dockerignore_excludes_sensitive_speech_artifacts() -> None:
    dockerignore = DOCKERIGNORE.read_text(encoding="utf-8")

    for pattern in (
        "*.speechprofile",
        "*.speechprofile.json",
        "*.wav",
        "*.onnx",
        "*.safetensors",
        "*.jsonl",
        "profiles/",
        "recordings/",
        "adapters/",
        "out/",
    ):
        assert pattern in dockerignore

    assert "training/configs/personalization" not in dockerignore


def test_profile_trainer_guide_documents_local_only_e2e_commands() -> None:
    guide = GUIDE.read_text(encoding="utf-8")

    for command in ("validate", "describe-dataset", "train", "evaluate", "package"):
        assert f"\n  {command} \\" in guide or f"\n  {command}\n" in guide

    assert "--network none" in guide
    assert '-u "$(id -u):$(id -g)"' in guide
    assert "/opt/speech/training/configs/personalization/default-adapter-trainer.json" in guide
    assert "/opt/speech/training/configs/personalization/default-activation-gate.json" in guide
    assert "raw audio" in guide
    assert "private vocabulary" in guide
    assert "base image digest" in guide


def test_readme_links_profile_trainer_docker_guide() -> None:
    readme = README.read_text(encoding="utf-8")

    assert "docs/instructions/profile-trainer-docker.instructions.md" in readme
