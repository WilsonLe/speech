from __future__ import annotations

from pathlib import Path

from speech_feature_reference.log_mel import write_log_mel_fixture_bundle

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = REPO_ROOT / "test-data" / "expected" / "log-mel-reference.json"


def main() -> None:
    write_log_mel_fixture_bundle(DEFAULT_OUTPUT)
    print(f"wrote {DEFAULT_OUTPUT.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
