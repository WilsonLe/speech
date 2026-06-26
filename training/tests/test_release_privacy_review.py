from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def read_text(relative_path: str) -> str:
    return (ROOT / relative_path).read_text(encoding="utf-8")


def test_v0_5_privacy_security_licensing_review_records_release_boundaries() -> None:
    adr = read_text("docs/adr/0006-v0-5-0-privacy-security-licensing-review.md")

    assert "No new privacy, security, licensing, or data-governance blocker" in adr
    assert "raw enrollment audio" in adr
    assert "`.speechmodel` import treats every file as hostile" in adr
    assert "worker-owned smoke vectors" in adr
    assert "ADR 0004" in adr
    assert "ADR 0005" in adr
    assert "must not claim production quality or performance gates pass" in adr


def test_security_policy_mentions_personal_model_sensitive_artifacts() -> None:
    security = read_text("SECURITY.md")

    assert "`.speechmodel` export/import packages" in security
    assert "Web Crypto envelope handling" in security
    assert "feature shards" in security
    assert "checkpoints" in security
    assert "portable `.speechmodel` bundles" in security


def test_synthetic_fixture_license_and_notice_coverage_is_complete() -> None:
    model_licenses = read_text("MODEL_LICENSES.md")
    notices = read_text("THIRD_PARTY_NOTICES.md")
    test_data_licenses = read_text("test-data/LICENSES.md")

    assert "Local development browser-training artifact scaffold" in model_licenses
    assert "nvidia-parakeet-ctc-vietnamese-research" in model_licenses
    assert "runtime status: blocked" in model_licenses.lower()
    assert "browser-training contract fixtures" in notices
    assert "test-data/expected/*.json" in notices
    assert "Synthetic log-Mel reference fixture" in test_data_licenses
    assert "Tiny adapter parity fixture" in test_data_licenses
    assert "Synthetic v0.4.0 speech profile fixture" in test_data_licenses
