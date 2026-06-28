import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REPORT_PATH = ROOT / "docs/planning/v0.6.0-copy-deletion-pass.json"
MICROPHONE_PANEL = ROOT / "apps/web/src/app/MicrophonePanel.tsx"
RUNTIME_PANEL = ROOT / "apps/web/src/app/ModelRuntimePanel.tsx"
ROADMAP = ROOT / "apps/web/src/app/milestones.ts"
READINESS_HELPERS = ROOT / "apps/web/src/app/personal-models-preflight.ts"


def load_report() -> dict:
    return json.loads(REPORT_PATH.read_text(encoding="utf-8"))


def test_copy_deletion_pass_records_scope_and_sources() -> None:
    report = load_report()

    assert report["schemaVersion"] == 1
    assert report["reviewId"] == "v0.6.0-copy-deletion-pass"
    assert report["sourceIssue"].endswith("/250")
    assert report["baselineInventory"] == "docs/planning/v0.6.0-ui-inventory.json"
    assert report["terminologyContract"] == "docs/planning/v0.6.0-terminology-copy-budgets.json"
    assert {"empty", "loading", "error", "success", "offline", "update", "recovery"}.issubset(
        set(report["scope"]["statesReviewed"])
    )
    assert len(report["rewrites"]) >= 3


def test_removed_default_copy_is_not_reintroduced() -> None:
    source = "\n".join(
        [
            MICROPHONE_PANEL.read_text(encoding="utf-8"),
            RUNTIME_PANEL.read_text(encoding="utf-8"),
            ROADMAP.read_text(encoding="utf-8"),
            READINESS_HELPERS.read_text(encoding="utf-8"),
        ]
    )

    removed_phrases = [
        "Accepted take saved in private OPFS profile storage",
        "non-durable memory fallback storage",
        "Runtime workers may apply it only between utterances",
        "Profile import verified checksums",
        "Captured take still exists only in memory",
        "Replaying the in-memory enrollment take",
        "Dedicated worker ONNX Runtime loader",
        "Benchmark worker provider",
        "Worker provider benchmark has not run yet",
        "Benchmarking ONNX Runtime providers",
        "attaches an AudioWorklet capture processor",
        "AudioWorklet capture metrics",
        "AudioWorklet status",
        "Worklet sample rate",
        "SharedArrayBuffer ring buffer",
        "ONNX RNN-T sessions",
    ]

    for phrase in removed_phrases:
        assert phrase not in source


def test_replacements_use_task_first_terms() -> None:
    microphone = MICROPHONE_PANEL.read_text(encoding="utf-8")
    runtime = RUNTIME_PANEL.read_text(encoding="utf-8")

    assert "Recording saved on this device" in microphone
    assert "Voice model enabled. It applies after the current recording ends." in microphone
    assert "Import restored local recordings. Review before using this voice model." in microphone
    assert "Check this browser" in runtime
    assert "Check training support" in runtime
    assert "Training support details" in runtime
    assert "Runtime details" in runtime


def test_technical_copy_is_confined_to_allowed_contexts() -> None:
    report = load_report()
    allowed = set(report["allowedTechnicalContexts"])

    assert "Diagnostics" in allowed
    assert "Training details" in allowed
    assert "Runtime details" in allowed
    assert report["privacy"] == {
        "rawErrorMessagesDefaultVisible": False,
        "rawIdentifiersDefaultVisible": False,
        "storageBackendNamesDefaultVisible": False,
        "notes": report["privacy"]["notes"],
    }
