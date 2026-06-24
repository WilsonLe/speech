from __future__ import annotations

import json
from pathlib import Path

from speech_feature_reference import build_log_mel_fixture_bundle

REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURE_PATH = REPO_ROOT / "test-data" / "expected" / "log-mel-reference.json"


def test_log_mel_reference_fixture_is_current() -> None:
    expected = json.loads(FIXTURE_PATH.read_text())

    assert build_log_mel_fixture_bundle() == expected
